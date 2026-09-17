"""User management + role/category assignment — administrator only."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from lib.auth import hash_password, require_admin
from lib.db import db
from models.users import UserCreate, UserOut, UserUpdate

router = APIRouter()


async def _department_name(department_id: str) -> str:
    if not department_id:
        return ""
    doc = await db.departments.find_one({"id": department_id}, {"name": 1})
    return doc["name"] if doc else ""


async def _validate_department(department_id: str | None) -> None:
    if not department_id:
        return
    if not await db.departments.find_one({"id": department_id}, {"id": 1}):
        raise HTTPException(status_code=422, detail="department does not exist")


def _out(doc: dict, department_name: str = "") -> UserOut:
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        username=doc.get("username", "") or "",
        email=doc["email"],
        role=doc.get("role", "normal_user"),
        assigned_category_ids=list(doc.get("assigned_category_ids") or []),
        department_id=doc.get("department_id", "") or "",
        department_name=department_name,
        is_active=bool(doc.get("is_active", True)),
    )


async def _validate_category_ids(ids: list[str]) -> None:
    if not ids:
        return
    found = await db.categories.count_documents({"id": {"$in": list(set(ids))}})
    if found != len(set(ids)):
        raise HTTPException(status_code=422, detail="one or more assigned categories do not exist")


async def _guard_last_admin(target: dict, changes: dict) -> None:
    losing_admin = target.get("role") == "administrator" and (
        changes.get("role") == "normal_user" or changes.get("is_active") is False
    )
    if not losing_admin:
        return
    admins = await db.users.count_documents({"role": "administrator", "is_active": True})
    if admins <= 1:
        raise HTTPException(
            status_code=400, detail="cannot remove or deactivate the last administrator"
        )


async def _assert_username_unique(username: str, exclude_id: str | None = None) -> None:
    query: dict = {"username": username}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    if await db.users.find_one(query, {"id": 1}):
        raise HTTPException(status_code=409, detail="a user with this username already exists")


@router.get("/users", response_model=list[UserOut])
async def list_users(_: dict = Depends(require_admin)):
    docs = await db.users.find().sort("name", 1).to_list(1000)
    departments = await db.departments.find({}, {"id": 1, "name": 1}).to_list(500)
    names = {d["id"]: d["name"] for d in departments}
    return [_out(d, names.get(d.get("department_id", ""), "")) for d in docs]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(input: UserCreate, _: dict = Depends(require_admin)):
    email = input.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="a user with this email already exists")
    await _assert_username_unique(input.username)
    await _validate_category_ids(input.assigned_category_ids)
    await _validate_department(input.department_id)
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "name": input.name.strip(),
        "username": input.username,
        "email": email,
        "role": input.role,
        "assigned_category_ids": input.assigned_category_ids,
        "department_id": input.department_id,
        "is_active": input.is_active,
        "password_hash": hash_password(input.password),
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    return _out(doc, await _department_name(input.department_id))


class BulkCategoryAssignment(BaseModel):
    """Assign or unassign one category across many users in a single request."""

    category_id: str = Field(min_length=1)
    user_ids: list[str] = Field(min_length=1)
    assign: bool = True


@router.post("/users/bulk-assign-category", response_model=list[UserOut])
async def bulk_assign_category(
    input: BulkCategoryAssignment, _: dict = Depends(require_admin)
):
    await _validate_category_ids([input.category_id])
    targets = await db.users.find({"id": {"$in": input.user_ids}}).to_list(1000)
    if len(targets) != len(set(input.user_ids)):
        raise HTTPException(status_code=404, detail="one or more users do not exist")

    now = datetime.now(timezone.utc)
    update = (
        {"$addToSet": {"assigned_category_ids": input.category_id}}
        if input.assign
        else {"$pull": {"assigned_category_ids": input.category_id}}
    )
    # Administrators are unrestricted, so assignments are meaningless for them.
    ids = [t["id"] for t in targets if t.get("role") != "administrator"]
    if ids:
        await db.users.update_many({"id": {"$in": ids}}, update)
        await db.users.update_many({"id": {"$in": ids}}, {"$set": {"updated_at": now}})

    docs = await db.users.find({"id": {"$in": input.user_ids}}).sort("name", 1).to_list(1000)
    departments = await db.departments.find({}, {"id": 1, "name": 1}).to_list(500)
    names = {d["id"]: d["name"] for d in departments}
    return [_out(d, names.get(d.get("department_id", ""), "")) for d in docs]


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, input: UserUpdate, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="user not found")

    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    # ``password_confirm`` never persists — the model validator already checked
    # that it matches ``password`` when both are provided.
    changes.pop("password_confirm", None)

    if "email" in changes:
        changes["email"] = changes["email"].lower()
        clash = await db.users.find_one({"email": changes["email"], "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(status_code=409, detail="a user with this email already exists")
    if "username" in changes:
        await _assert_username_unique(changes["username"], exclude_id=user_id)
    if "password" in changes:
        changes["password_hash"] = hash_password(changes.pop("password"))
    if "assigned_category_ids" in changes:
        await _validate_category_ids(changes["assigned_category_ids"])
    if "department_id" in changes:
        await _validate_department(changes["department_id"])
    if "name" in changes:
        changes["name"] = changes["name"].strip()

    await _guard_last_admin(target, changes)
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    return _out(doc, await _department_name(doc.get("department_id", "")))


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="user not found")
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="you cannot delete your own account")
    await _guard_last_admin(target, {"role": "normal_user"})
    await db.users.delete_one({"id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    return None
