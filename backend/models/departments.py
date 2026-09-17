"""Pydantic models for departments — the organisational unit a PIC belongs to.

Departments drive the standby calendar grouping ("who is on standby in this department
today / tomorrow"), so they are a managed entity rather than free text.
"""

from datetime import datetime, timezone
import uuid
from typing import Literal

from pydantic import BaseModel, Field

DepartmentStatus = Literal["active", "inactive"]


class Department(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: DepartmentStatus = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DepartmentOut(Department):
    pic_count: int = 0  # how many PICs sit in this department


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    status: DepartmentStatus = "active"


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    status: DepartmentStatus | None = None
