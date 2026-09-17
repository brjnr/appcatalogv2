"""Symmetric encryption for integration secrets stored in Mongo.

We keep credentials (SMTP password, Jira token, Teams webhook URL, Telegram bot
token, vCenter password, ...) encrypted at rest so a database dump alone does
not hand an attacker every downstream system.

Key material comes from the ``INTEGRATIONS_KEY`` env var (a URL-safe
base64-encoded 32-byte key — the same shape ``Fernet.generate_key()`` returns).
If it is missing we derive a deterministic key from ``SECRET_KEY`` so a fresh
dev environment does not crash — but that path logs a loud warning and MUST
NOT be relied on in production.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _load_fernet() -> Fernet:
    raw = os.environ.get("INTEGRATIONS_KEY", "").strip()
    if raw:
        try:
            return Fernet(raw.encode("ascii"))
        except (ValueError, TypeError):
            logger.error(
                "INTEGRATIONS_KEY is not a valid Fernet key — falling back to derived key"
            )
    seed = os.environ.get("SECRET_KEY") or f"appcatalog:{os.environ.get('DB_NAME', 'appcatalog')}"
    derived = base64.urlsafe_b64encode(hashlib.sha256(seed.encode("utf-8")).digest())
    if not raw:
        logger.warning(
            "INTEGRATIONS_KEY not set — using a derived key for integration secrets. "
            "Set INTEGRATIONS_KEY in production."
        )
    return Fernet(derived)


_fernet = _load_fernet()


def encrypt_secret(plain: str) -> str:
    """Return a base64 token that stores ``plain`` symmetrically-encrypted."""
    if plain is None:
        return ""
    if not isinstance(plain, str):
        raise TypeError("only strings can be encrypted here")
    return _fernet.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    """Best-effort decrypt. Returns ``""`` if the token is empty or corrupted."""
    if not token:
        return ""
    try:
        return _fernet.decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("decrypt_secret: rejected an unreadable token")
        return ""


def mask_secret(value: str) -> str:
    """Redact a secret for display — keep the last 4 chars only when it is long."""
    if not value:
        return ""
    return "•" * max(4, len(value) - 4) + value[-4:] if len(value) > 6 else "•" * len(value)
