"""Admin-only third-party integration configuration + SMTP alerting.

Design notes
------------
- Configuration is stored as one document per ``kind`` in the ``integrations``
  collection. Secret fields are encrypted at rest via ``lib/crypto.py``; the
  API response returns a masked hint (``•••ken``) instead of plaintext.
- We ship the config UI + storage for Jira, SMTP, Teams, Telegram, and vCenter.
  Live delivery is wired up for SMTP first — the others land the config and a
  save endpoint, actual delivery hooks arrive in later phases.
- No live "test connection" endpoint is exposed in this cut (per product
  choice). ``POST /integrations/email/test`` sends a real email via the
  currently-saved SMTP config so an admin can verify the settings.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import require_admin
from lib.crypto import decrypt_secret, encrypt_secret, mask_secret
from lib.db import db
from models.integrations import (
    IntegrationKind,
    IntegrationUpsert,
    NotifyExpiringNotesRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Fields that must be encrypted before storage, by integration kind. Any field
# name in this set is transparently encrypted on write and masked on read.
SECRET_FIELDS: dict[str, set[str]] = {
    "smtp": {"password"},
    "jira": {"api_token"},
    "teams": {"webhook_url"},
    "telegram": {"bot_token"},
    "vcenter": {"password"},
}
_ALLOWED_KINDS: set[str] = set(SECRET_FIELDS.keys())


def _redact(kind: str, config: dict) -> dict:
    """Return a shallow copy with secret fields swapped for a masked hint."""
    out = dict(config or {})
    for f in SECRET_FIELDS.get(kind, set()):
        if out.get(f):
            out[f] = mask_secret(decrypt_secret(str(out[f])))
    return out


def _persist_secrets(kind: str, incoming: dict, existing: dict) -> dict:
    """Merge incoming values with what is already stored.

    Blank secret fields on the incoming payload keep the existing encrypted
    value (so an admin editing SMTP does not have to retype the password every
    time). Non-blank secrets are encrypted and stored.
    """
    out: dict[str, Any] = dict(incoming or {})
    secrets = SECRET_FIELDS.get(kind, set())
    for f in secrets:
        new_val = out.get(f, None)
        old_val = existing.get(f, "")
        if new_val is None or new_val == "":
            out[f] = old_val  # keep existing (still encrypted)
        else:
            out[f] = encrypt_secret(str(new_val))
    return out


def _assert_kind(kind: str) -> None:
    if kind not in _ALLOWED_KINDS:
        raise HTTPException(status_code=404, detail="unknown integration")


class IntegrationOut(BaseModel):
    kind: IntegrationKind
    enabled: bool
    config: dict
    updated_at: datetime | None = None
    has_secret: bool = False


@router.get("/integrations", response_model=list[IntegrationOut])
async def list_integrations(_: dict = Depends(require_admin)):
    """One row per supported connector. Missing rows come back with defaults so
    the UI never has to distinguish 'never configured' from 'saved empty'."""
    docs = {d["kind"]: d for d in await db.integrations.find().to_list(50)}
    out: list[IntegrationOut] = []
    for kind in sorted(_ALLOWED_KINDS):
        doc = docs.get(kind)
        cfg = (doc or {}).get("config", {}) or {}
        out.append(
            IntegrationOut(
                kind=kind,  # type: ignore[arg-type]
                enabled=bool((doc or {}).get("enabled", False)),
                config=_redact(kind, cfg),
                updated_at=(doc or {}).get("updated_at"),
                has_secret=any(cfg.get(f) for f in SECRET_FIELDS.get(kind, set())),
            )
        )
    return out


@router.get("/integrations/{kind}", response_model=IntegrationOut)
async def get_integration(kind: str, _: dict = Depends(require_admin)):
    _assert_kind(kind)
    doc = await db.integrations.find_one({"kind": kind}) or {}
    cfg = doc.get("config", {}) or {}
    return IntegrationOut(
        kind=kind,  # type: ignore[arg-type]
        enabled=bool(doc.get("enabled", False)),
        config=_redact(kind, cfg),
        updated_at=doc.get("updated_at"),
        has_secret=any(cfg.get(f) for f in SECRET_FIELDS.get(kind, set())),
    )


@router.put("/integrations/{kind}", response_model=IntegrationOut)
async def upsert_integration(
    kind: str, input: IntegrationUpsert, _: dict = Depends(require_admin)
):
    _assert_kind(kind)
    existing = await db.integrations.find_one({"kind": kind}) or {}
    existing_cfg = existing.get("config", {}) or {}
    merged = _persist_secrets(kind, input.config, existing_cfg)
    now = datetime.now(timezone.utc)
    await db.integrations.update_one(
        {"kind": kind},
        {
            "$set": {
                "kind": kind,
                "enabled": bool(input.enabled),
                "config": merged,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    return IntegrationOut(
        kind=kind,  # type: ignore[arg-type]
        enabled=input.enabled,
        config=_redact(kind, merged),
        updated_at=now,
        has_secret=any(merged.get(f) for f in SECRET_FIELDS.get(kind, set())),
    )


@router.delete("/integrations/{kind}", status_code=204)
async def delete_integration(kind: str, _: dict = Depends(require_admin)):
    _assert_kind(kind)
    await db.integrations.delete_one({"kind": kind})
    return None


# --------------------------------------------------------------------- SMTP


async def _load_smtp_config() -> dict:
    doc = await db.integrations.find_one({"kind": "smtp", "enabled": True})
    if not doc:
        raise HTTPException(
            status_code=409, detail="SMTP integration is not enabled — configure it first"
        )
    cfg = dict(doc.get("config", {}) or {})
    if cfg.get("password"):
        cfg["password"] = decrypt_secret(str(cfg["password"]))
    return cfg


def _send_email_sync(cfg: dict, to_addresses: list[str], subject: str, body: str) -> None:
    """Blocking SMTP send — invoked via ``asyncio.to_thread`` from the router."""
    host = cfg.get("host") or ""
    port = int(cfg.get("port") or 587)
    if not host:
        raise ValueError("SMTP host is not configured")

    msg = EmailMessage()
    from_addr = cfg.get("from_address") or cfg.get("username") or "no-reply@localhost"
    from_name = cfg.get("from_name") or "Application Catalog"
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = ", ".join(to_addresses)
    msg["Subject"] = subject
    msg.set_content(body)

    use_tls = bool(cfg.get("use_tls", True))
    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls(context=context)
            smtp.ehlo()
        if cfg.get("username"):
            smtp.login(cfg["username"], cfg.get("password") or "")
        smtp.send_message(msg)


class SendTestEmailRequest(BaseModel):
    to: str
    subject: str = "AppCatalog SMTP test"
    body: str = "This is a test email from Application Catalog."


@router.post("/integrations/email/test", status_code=202)
async def send_test_email(input: SendTestEmailRequest, _: dict = Depends(require_admin)):
    cfg = await _load_smtp_config()
    try:
        await asyncio.to_thread(_send_email_sync, cfg, [input.to], input.subject, input.body)
    except Exception as exc:  # surface a friendly message; details in server log
        logger.exception("SMTP test failed")
        raise HTTPException(status_code=502, detail=f"SMTP send failed: {exc}") from exc
    return {"status": "sent", "to": input.to}


@router.post("/integrations/alerts/notes-expiring", status_code=202)
async def notify_expiring_notes(
    input: NotifyExpiringNotesRequest, _: dict = Depends(require_admin)
):
    """Send a digest of notes expiring inside ``within_days`` to ``to_addresses``.

    This is the manual trigger — a scheduled sweep is out of scope for this
    cut. Wiring: uses the same expiry logic as ``GET /api/notes/alerts``.
    """
    if not input.to_addresses:
        raise HTTPException(status_code=422, detail="at least one recipient is required")
    cfg = await _load_smtp_config()

    now = datetime.now(timezone.utc)
    from datetime import timedelta

    horizon = now + timedelta(days=input.within_days)
    docs = await db.notes.find(
        {
            "status": "active",
            "expires_at": {"$gte": now, "$lte": horizon},
        }
    ).sort("expires_at", 1).to_list(200)

    if not docs:
        return {"status": "skipped", "reason": "no expiring notes"}

    lines = [
        "Notes expiring in the next {n} day(s):".format(n=input.within_days),
        "",
    ]
    for d in docs:
        exp = d.get("expires_at")
        exp_txt = exp.strftime("%Y-%m-%d") if hasattr(exp, "strftime") else str(exp)
        lines.append(f"- {d.get('title', '(untitled)')}  · expires {exp_txt}")
    body = "\n".join(lines)

    try:
        await asyncio.to_thread(
            _send_email_sync,
            cfg,
            list(input.to_addresses),
            f"AppCatalog: {len(docs)} note(s) expiring soon",
            body,
        )
    except Exception as exc:
        logger.exception("notes-expiring alert failed")
        raise HTTPException(status_code=502, detail=f"SMTP send failed: {exc}") from exc

    return {"status": "sent", "count": len(docs)}
