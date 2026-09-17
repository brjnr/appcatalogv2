"""Pydantic models for servers and PICs (person in charge)."""

from datetime import datetime, timezone
import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

ServerStatus = Literal["Active", "Maintenance", "Decommissioned"]
# Site role: primary data center, disaster-recovery center, cloud, or co-location.
ServerLocation = Literal["DC", "DRC", "Cloud", "Co-location"]
ServerEnvironment = Literal["Production", "Staging", "Development", "DR", "Internal"]
PicStatus = Literal["Active", "Inactive"]


class RefSummary(BaseModel):
    """Lightweight cross-entity reference used to make everything clickable."""

    id: str
    name: str
    initials: str | None = None


class StandbyEntry(BaseModel):
    """One standby shift: a date, the application covered, optional notes."""

    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")  # ISO date, server-anchored
    application_id: str
    notes: str = Field(default="", max_length=300)


class StandbyEntryOut(StandbyEntry):
    application_name: str = ""


class ServerTicket(BaseModel):
    """A Jira ticket ever raised against this server, and who executed it."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    jira_id: str = Field(min_length=1, max_length=40)  # e.g. INFRA-1042
    url: str = Field(default="", max_length=500)
    summary: str = Field(default="", max_length=300)
    executed_by: str = Field(default="", max_length=120)
    status: str = Field(default="Open", max_length=40)
    requested_on: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServerTicketInput(BaseModel):
    jira_id: str = Field(min_length=1, max_length=40)
    url: str = Field(default="", max_length=500)
    summary: str = Field(default="", max_length=300)
    executed_by: str = Field(default="", max_length=120)
    status: str = Field(default="Open", max_length=40)
    requested_on: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")


TICKET_STATUSES = ["Open", "In Progress", "Done", "Cancelled"]


# --------------------------------------------------------------------------- servers


class Server(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    hostname: str = ""
    ip_address: str = ""
    vm_name: str = ""
    os: str = ""
    os_version: str = ""
    server_type: str = ""
    environment: ServerEnvironment = "Production"
    location: ServerLocation = "DC"
    status: ServerStatus = "Active"
    cpu: str = ""
    ram: str = ""
    storage: str = ""
    datacenter: str = ""
    cluster: str = ""
    virtualization: str = ""
    description: str = ""
    # Manually-entered lifecycle dates (ISO ``YYYY-MM-DD``). ``date_created``
    # captures when the server was provisioned; ``date_decommissioned`` and
    # ``decommission_notes`` are only meaningful when ``status`` == "Decommissioned".
    date_created: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    date_decommissioned: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    decommission_notes: str = Field(default="", max_length=1000)
    application_ids: list[str] = Field(default_factory=list)
    pic_ids: list[str] = Field(default_factory=list)
    tickets: list[ServerTicket] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_utc(cls, value: object) -> object:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class ServerOut(Server):
    """Server plus resolved relations so the UI can link straight through."""

    applications: list[RefSummary] = Field(default_factory=list)
    pics: list[RefSummary] = Field(default_factory=list)


class ServerCreate(BaseModel):
    # Registration needs nothing but a name — applications and PICs can be linked later.
    name: str = Field(min_length=1, max_length=120)
    hostname: str = Field(default="", max_length=200)
    ip_address: str = Field(default="", max_length=60)
    vm_name: str = Field(default="", max_length=120)
    os: str = Field(default="", max_length=80)
    os_version: str = Field(default="", max_length=60)
    server_type: str = Field(default="", max_length=60)
    environment: ServerEnvironment = "Production"
    location: ServerLocation = "DC"
    status: ServerStatus = "Active"
    cpu: str = Field(default="", max_length=60)
    ram: str = Field(default="", max_length=60)
    storage: str = Field(default="", max_length=60)
    datacenter: str = Field(default="", max_length=120)
    cluster: str = Field(default="", max_length=120)
    virtualization: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=2000)
    date_created: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    date_decommissioned: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    decommission_notes: str = Field(default="", max_length=1000)
    application_ids: list[str] = Field(default_factory=list)
    pic_ids: list[str] = Field(default_factory=list)


class ServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    hostname: str | None = Field(default=None, max_length=200)
    ip_address: str | None = Field(default=None, max_length=60)
    vm_name: str | None = Field(default=None, max_length=120)
    os: str | None = Field(default=None, max_length=80)
    os_version: str | None = Field(default=None, max_length=60)
    server_type: str | None = Field(default=None, max_length=60)
    environment: ServerEnvironment | None = None
    location: ServerLocation | None = None
    status: ServerStatus | None = None
    cpu: str | None = Field(default=None, max_length=60)
    ram: str | None = Field(default=None, max_length=60)
    storage: str | None = Field(default=None, max_length=60)
    datacenter: str | None = Field(default=None, max_length=120)
    cluster: str | None = Field(default=None, max_length=120)
    virtualization: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    date_created: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    date_decommissioned: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    decommission_notes: str | None = Field(default=None, max_length=1000)
    application_ids: list[str] | None = None
    pic_ids: list[str] | None = None


# ------------------------------------------------------------------------------ pics


class Pic(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    initials: str
    employee_id: str = ""
    email: str = ""
    phone: str = ""
    department_id: str = ""  # -> departments.id; groups the standby calendar
    department: str = ""  # denormalised department name, kept in sync by the backend
    position: str = ""
    status: PicStatus = "Active"
    application_ids: list[str] = Field(default_factory=list)
    standby_schedule: list[StandbyEntry] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_utc(cls, value: object) -> object:
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class PicOut(Pic):
    """PIC plus resolved relations. Servers are derived from servers.pic_ids so the
    Server↔PIC link has a single source of truth."""

    applications: list[RefSummary] = Field(default_factory=list)
    servers: list[RefSummary] = Field(default_factory=list)
    standby_schedule_out: list[StandbyEntryOut] = Field(default_factory=list)


def normalize_initials(value: str) -> str:
    return value.strip().upper()


class PicCreate(BaseModel):
    # Registration needs only a name + initials; applications/servers come later.
    name: str = Field(min_length=1, max_length=120)
    initials: str = Field(min_length=1, max_length=3)
    employee_id: str = Field(default="", max_length=40)
    email: EmailStr | Literal[""] = ""
    phone: str = Field(default="", max_length=40)
    department_id: str = Field(default="", max_length=60)
    position: str = Field(default="", max_length=120)
    status: PicStatus = "Active"
    application_ids: list[str] = Field(default_factory=list)
    server_ids: list[str] = Field(default_factory=list)
    standby_schedule: list[StandbyEntry] = Field(default_factory=list)

    @field_validator("initials")
    @classmethod
    def _upper_initials(cls, value: str) -> str:
        cleaned = normalize_initials(value)
        if not cleaned.isalnum():
            raise ValueError("initials must be 1-3 letters or digits")
        return cleaned


class PicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    initials: str | None = Field(default=None, min_length=1, max_length=3)
    employee_id: str | None = Field(default=None, max_length=40)
    email: EmailStr | Literal[""] | None = None
    phone: str | None = Field(default=None, max_length=40)
    department_id: str | None = Field(default=None, max_length=60)
    position: str | None = Field(default=None, max_length=120)
    status: PicStatus | None = None
    application_ids: list[str] | None = None
    server_ids: list[str] | None = None
    standby_schedule: list[StandbyEntry] | None = None

    @field_validator("initials")
    @classmethod
    def _upper_initials(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = normalize_initials(value)
        if not cleaned.isalnum():
            raise ValueError("initials must be 1-3 letters or digits")
        return cleaned
