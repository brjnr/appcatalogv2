"""Pydantic models for app categories (RBAC access units)."""

from datetime import datetime, timezone
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

CategoryStatus = Literal["active", "inactive"]


class AppCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    icon: str = "Layers"  # lucide icon name (fallback when no custom image)
    icon_url: str | None = None  # custom uploaded image, served from /api/uploads/
    status: CategoryStatus = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_utc(cls, value: object) -> object:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    icon: str = Field(default="Layers", max_length=60)
    status: CategoryStatus = "active"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=60)
    status: CategoryStatus | None = None
