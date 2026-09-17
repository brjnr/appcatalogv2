"""Auth primitives: password hashing, hashed-token httpOnly cookie sessions,
brute-force lockout helpers, and FastAPI dependencies.

Security posture (2026-02 hardening):
- Session cookies contain a cryptographically-random opaque token; only the
  SHA-256 digest of the token is persisted in Mongo (``sessions.token_hash``),
  so a database dump cannot be replayed as a live session.
- Cookies default to ``httponly=True`` / ``samesite=lax`` / ``path=/``. When the
  environment marks the deployment as HTTPS (``SESSION_COOKIE_SECURE=1`` or a
  configured ``SESSION_COOKIE_DOMAIN``), ``secure=True`` is applied so browsers
  refuse to send the cookie over plaintext.
- Expiry is enforced on every request; expired rows are deleted on lookup and
  a TTL index in ``lib/db.py`` reaps stragglers.
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db

pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")
SESSION_COOKIE = "catalog_session"
SESSION_TTL = timedelta(days=7)

# Login lockout: window of failed logins that trip a temporary block. Values are
# small on purpose — brute force needs bulk, so even a modest cap breaks a
# credential-stuffing script without punishing a fat-fingered admin.
LOGIN_ATTEMPT_WINDOW = timedelta(minutes=15)
MAX_FAILED_ATTEMPTS_PER_ACCOUNT = 8
MAX_FAILED_ATTEMPTS_PER_IP = 20


def _cookie_secure() -> bool:
    """True when the browser must refuse to send the cookie over http://.

    The public preview and any real deployment run over TLS-terminated ingress,
    so this defaults to *on* — set ``SESSION_COOKIE_SECURE=0`` in a purely
    local ``.env`` if you need to test with plain http://localhost.
    """
    return os.environ.get("SESSION_COOKIE_SECURE", "1").lower() not in {"0", "false", "no", ""}


def _cookie_samesite() -> str:
    value = os.environ.get("SESSION_COOKIE_SAMESITE", "lax").lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return pwd_context.verify(password, password_hash)
    except Exception:
        return False


async def create_session(response: Response, user_id: str) -> None:
    raw = secrets.token_urlsafe(48)  # 64 chars of URL-safe entropy
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one(
        {
            "token_hash": _hash_token(raw),
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + SESSION_TTL,
        }
    )
    response.set_cookie(
        SESSION_COOKIE,
        raw,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
    )


async def destroy_session(request: Request, response: Response) -> None:
    """Delete the DB-side session and clear the cookie. Safe to call twice."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _hash_token(token)})
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        samesite=_cookie_samesite(),
        secure=_cookie_secure(),
    )


async def load_user_from_request(request: Request) -> dict | None:
    """Resolve the session cookie to an active user, or None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = await db.sessions.find_one({"token_hash": _hash_token(token)})
    if not session:
        return None
    expires = session.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:  # motor may return naive datetimes
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            await db.sessions.delete_one({"_id": session["_id"]})
            return None
    user = await db.users.find_one({"id": session["user_id"]})
    if not user or not user.get("is_active", True):
        return None
    return user


async def require_user(request: Request) -> dict:
    user = await load_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


async def require_admin(user: dict = Depends(require_user)) -> dict:
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="administrator access required")
    return user


def allowed_category_ids(user: dict) -> list[str] | None:
    """None = unrestricted (administrator); otherwise the user's assigned category ids."""
    if user.get("role") == "administrator":
        return None
    return list(user.get("assigned_category_ids") or [])


# ------------------------------------------------------------------ throttling


def client_ip(request: Request) -> str:
    """Best-effort client IP behind a single trusted reverse proxy.

    Falls back to the connection peer when no proxy header is present.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


async def check_login_lockout(email: str, ip: str) -> None:
    """Deny before we ever look up the account when this email/IP is over quota.

    We consult the ``login_attempts`` collection (TTL-cleaned in ``lib/db.py``)
    and raise ``429`` with a generic message so callers cannot use response
    text to distinguish "wrong password" from "locked out".
    """
    since = datetime.now(timezone.utc) - LOGIN_ATTEMPT_WINDOW
    account_failures = await db.login_attempts.count_documents(
        {"email": email, "success": False, "created_at": {"$gte": since}}
    )
    ip_failures = await db.login_attempts.count_documents(
        {"ip": ip, "success": False, "created_at": {"$gte": since}}
    )
    if (
        account_failures >= MAX_FAILED_ATTEMPTS_PER_ACCOUNT
        or ip_failures >= MAX_FAILED_ATTEMPTS_PER_IP
    ):
        raise HTTPException(
            status_code=429,
            detail="too many login attempts — please try again later",
        )


async def record_login_attempt(email: str, ip: str, success: bool) -> None:
    """Persist the attempt for lockout math. TTL index drops rows automatically."""
    now = datetime.now(timezone.utc)
    await db.login_attempts.insert_one(
        {
            "email": email,
            "ip": ip,
            "success": bool(success),
            "created_at": now,
            "expires_at": now + LOGIN_ATTEMPT_WINDOW,
        }
    )
