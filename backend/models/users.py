"""Pydantic models for users and authentication.

Password policy (2026-02): 13+ characters, at least one uppercase, one lowercase,
and one symbol. The ``password_confirm`` field is validated server-side so a
mismatched retype cannot slip past a bypassed UI.
"""

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

Role = Literal["administrator", "normal_user"]

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,40}$")
_PASSWORD_MIN = 13
_PASSWORD_MAX = 128
_SYMBOL_RE = re.compile(r"[^A-Za-z0-9]")
_LOWER_RE = re.compile(r"[a-z]")
_UPPER_RE = re.compile(r"[A-Z]")


def _validate_username(value: str) -> str:
    v = value.strip().lower()
    if not _USERNAME_RE.match(v):
        raise ValueError(
            "username must be 3-40 characters and contain only letters, numbers, dot, underscore, or hyphen"
        )
    return v


def _validate_password_strength(value: str) -> str:
    if len(value) < _PASSWORD_MIN:
        raise ValueError(f"password must be at least {_PASSWORD_MIN} characters")
    if len(value) > _PASSWORD_MAX:
        raise ValueError(f"password must be at most {_PASSWORD_MAX} characters")
    if not _UPPER_RE.search(value):
        raise ValueError("password must contain at least one uppercase letter")
    if not _LOWER_RE.search(value):
        raise ValueError("password must contain at least one lowercase letter")
    if not _SYMBOL_RE.search(value):
        raise ValueError("password must contain at least one symbol")
    return value


class UserOut(BaseModel):
    """User as exposed over the API — never includes the password hash."""

    id: str
    name: str
    username: str = ""
    email: str
    role: Role
    assigned_category_ids: list[str] = Field(default_factory=list)
    department_id: str = ""  # -> departments.id; drives note sharing/editing by department
    department_name: str = ""
    is_active: bool = True


class LoginRequest(BaseModel):
    """Login accepts either an email address or a username in the ``email`` field.

    The field name is retained for API backward compatibility, but the value is
    treated as an opaque identifier by the router (``email OR username``).
    """

    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=_PASSWORD_MAX)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str
    email: EmailStr
    password: str
    password_confirm: str
    role: Role = "normal_user"
    assigned_category_ids: list[str] = Field(default_factory=list)
    department_id: str = Field(default="", max_length=60)
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        return _validate_username(v)

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return _validate_password_strength(v)

    @model_validator(mode="after")
    def _confirm(self) -> "UserCreate":
        if self.password != self.password_confirm:
            raise ValueError("password_confirm does not match password")
        return self


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    username: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    password_confirm: str | None = None
    role: Role | None = None
    assigned_category_ids: list[str] | None = None
    department_id: str | None = Field(default=None, max_length=60)
    is_active: bool | None = None

    @field_validator("username")
    @classmethod
    def _username(cls, v: str | None) -> str | None:
        return _validate_username(v) if v is not None else None

    @field_validator("password")
    @classmethod
    def _password(cls, v: str | None) -> str | None:
        return _validate_password_strength(v) if v is not None else None

    @model_validator(mode="after")
    def _confirm(self) -> "UserUpdate":
        # If a new password is provided, retype is mandatory and must match.
        # If neither is provided, no-op (leave current password intact).
        if self.password is not None or self.password_confirm is not None:
            if self.password is None or self.password_confirm is None:
                raise ValueError(
                    "provide both password and password_confirm to change the password"
                )
            if self.password != self.password_confirm:
                raise ValueError("password_confirm does not match password")
        return self
