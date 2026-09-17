"""Pydantic models for temporary notes / memos (servers, alerts, applications, …)."""

from datetime import datetime, timezone
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

NoteStatus = Literal["active", "trashed"]
NoteLinkKind = Literal["application", "server", "pic"]

# Days a trashed note is kept before it is purged for good.
TRASH_RETENTION_DAYS = 7
# Default validity of a new note when the author does not pick an expiry date.
DEFAULT_VALID_DAYS = 7

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class NoteLink(BaseModel):
    """Optional link from a note to an application, server, or PIC."""

    kind: NoteLinkKind
    id: str


class NoteLinkOut(NoteLink):
    name: str = ""


class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    body: str = ""
    author_id: str
    author_name: str
    department_ids: list[str] = Field(default_factory=list)  # [] = everyone; else those departments
    pinned: bool = False  # pinned notes sort to the top for the on-call team
    note_date: str  # the date the note is about / valid from (YYYY-MM-DD)
    expires_at: str  # retention date; after this the note moves to Trash
    status: NoteStatus = "active"
    trashed_at: datetime | None = None
    links: list[NoteLink] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("created_at", "updated_at", "trashed_at", mode="before")
    @classmethod
    def _normalize_utc(cls, value: object) -> object:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class NoteOut(Note):
    department_names: list[str] = Field(default_factory=list)  # [] = Everyone
    links_out: list[NoteLinkOut] = Field(default_factory=list)
    days_left: int = 0  # days until it moves to Trash (0 or less = due)
    purge_on: str | None = None  # date a trashed note is deleted for good
    can_edit: bool = False  # author or administrator


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default="", max_length=4000)
    department_ids: list[str] = Field(default_factory=list)
    pinned: bool = False
    note_date: str | None = Field(default=None, pattern=ISO_DATE)
    expires_at: str | None = Field(default=None, pattern=ISO_DATE)
    links: list[NoteLink] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=4000)
    note_date: str | None = Field(default=None, pattern=ISO_DATE)
    expires_at: str | None = Field(default=None, pattern=ISO_DATE)
    links: list[NoteLink] | None = None
    department_ids: list[str] | None = None
    pinned: bool | None = None
