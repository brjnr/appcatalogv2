"""Pydantic models for third-party integration configuration.

Each connector is stored as a document in ``integrations`` keyed by
``kind`` (one row per kind). Secret fields (``password``, ``token``,
``webhook_url`` etc.) are encrypted at rest — see ``lib/crypto.py``.
"""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

IntegrationKind = Literal["jira", "smtp", "teams", "telegram", "vcenter"]


class SmtpConfig(BaseModel):
    host: str = Field(default="", max_length=200)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=400)  # write-only, encrypted at rest
    use_tls: bool = True
    from_address: str = Field(default="", max_length=200)
    from_name: str = Field(default="Application Catalog", max_length=120)


class JiraConfig(BaseModel):
    base_url: str = Field(default="", max_length=300)
    email: str = Field(default="", max_length=200)
    api_token: str = Field(default="", max_length=400)  # write-only, encrypted


class TeamsConfig(BaseModel):
    webhook_url: str = Field(default="", max_length=500)  # write-only, encrypted


class TelegramConfig(BaseModel):
    bot_token: str = Field(default="", max_length=200)  # write-only, encrypted
    chat_id: str = Field(default="", max_length=100)


class VCenterConfig(BaseModel):
    host: str = Field(default="", max_length=200)
    username: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=400)  # write-only, encrypted
    verify_ssl: bool = True


AnyConfig = SmtpConfig | JiraConfig | TeamsConfig | TelegramConfig | VCenterConfig


class IntegrationConfig(BaseModel):
    kind: IntegrationKind
    enabled: bool = False
    config: dict = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("config")
    @classmethod
    def _no_null(cls, v: dict | None) -> dict:
        return v or {}


class IntegrationUpsert(BaseModel):
    """Payload for PUT /api/integrations/{kind}. Blank secret fields mean
    'keep the existing encrypted value' — an admin does not have to retype
    the SMTP password on every edit."""

    enabled: bool = False
    config: dict = Field(default_factory=dict)


class NotifyExpiringNotesRequest(BaseModel):
    within_days: int = Field(default=7, ge=1, le=60)
    to_addresses: list[str] = Field(default_factory=list, max_length=20)
