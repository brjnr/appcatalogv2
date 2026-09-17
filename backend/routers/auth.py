"""Authentication endpoints — httpOnly cookie sessions under /api/auth/*.

Login accepts either an email address or a username in the ``email`` field of
the request body (backward compatibility). Brute-force controls are enforced
here rather than in a global middleware because the throttle is per-account
plus per-IP; both live in ``lib.auth``.
"""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from lib.auth import (
    check_login_lockout,
    client_ip,
    create_session,
    destroy_session,
    load_user_from_request,
    record_login_attempt,
    verify_password,
)
from lib.db import db
from models.users import LoginRequest, UserOut

router = APIRouter()


class MeResponse(BaseModel):
    user: UserOut | None = None


async def _user_out(doc: dict) -> UserOut:
    department_id = doc.get("department_id", "") or ""
    department = (
        await db.departments.find_one({"id": department_id}, {"name": 1}) if department_id else None
    )
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        username=doc.get("username", "") or "",
        email=doc["email"],
        role=doc.get("role", "normal_user"),
        assigned_category_ids=list(doc.get("assigned_category_ids") or []),
        department_id=department_id,
        department_name=department["name"] if department else "",
        is_active=bool(doc.get("is_active", True)),
    )


def _identifier_query(raw: str) -> dict:
    """Match on either email or username (both stored lower-cased)."""
    normalized = raw.strip().lower()
    return {"$or": [{"email": normalized}, {"username": normalized}]}


@router.post("/auth/login", response_model=UserOut)
async def login(input: LoginRequest, request: Request, response: Response):
    ip = client_ip(request)
    identifier = input.email.strip().lower()

    # Uniform failure surface: the throttle raises 429 with a generic message,
    # bad credentials raise 401 with a generic message, and deactivated accounts
    # get a distinct 403 (the admin already had them look up the identifier —
    # the ambiguity is only relevant to guessing).
    await check_login_lockout(identifier, ip)

    user = await db.users.find_one(_identifier_query(identifier))
    ok = bool(user) and verify_password(input.password, user.get("password_hash", ""))
    await record_login_attempt(identifier, ip, ok)
    if not ok:
        raise HTTPException(status_code=401, detail="invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="this account has been deactivated")

    await create_session(response, user["id"])
    return await _user_out(user)


@router.get("/auth/me", response_model=UserOut | None)
async def me(request: Request):
    """Who am I — returns the session user, or null when logged out (200, so
    the frontend can redirect without treating it as an error)."""
    user = await load_user_from_request(request)
    return await _user_out(user) if user else None


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, response: Response):
    await destroy_session(request, response)
    return None
