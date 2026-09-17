"""Pydantic models for the enterprise application catalog."""

from datetime import datetime, timezone
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Environment = Literal["Production", "Staging", "Internal", "Cloud", "On-Premises"]
Status = Literal["Active", "Maintenance", "Deprecated"]
SortId = Literal[
    "name_asc",
    "name_desc",
    "most_used",
    "most_favorite",
    "recently_added",
    "recently_updated",
]


class CatalogApp(BaseModel):
    """A single enterprise application. category_name is resolved from the categories
    collection on read; category_id is the stored reference."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    category_id: str
    category_name: str = ""
    environment: Environment = "Production"
    status: Status = "Active"
    url: str
    icon: str = "AppWindow"
    usage_count: int = 0
    favorite_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_utc(cls, value: object) -> object:
        # motor hands back naive datetimes — store/normalize as aware UTC so JS parses them.
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class AppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    category_id: str = Field(min_length=1)
    environment: Environment = "Production"
    status: Status = "Active"
    url: str = Field(min_length=1, max_length=500)
    icon: str = Field(default="AppWindow", max_length=60)


class AppUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    category_id: str | None = None
    environment: Environment | None = None
    status: Status | None = None
    url: str | None = Field(default=None, min_length=1, max_length=500)
    icon: str | None = Field(default=None, max_length=60)


class FavoriteUpdate(BaseModel):
    favorite: bool
