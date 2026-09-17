"""Department endpoints — readable by any signed-in user, admin-only mutations."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.db import db
from models.departments import (
    Department,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)

router = APIRouter()


async def _to_out(doc: dict) -> DepartmentOut:
    count = await db.pics.count_documents({"department_id": doc["id"]})
    return DepartmentOut(**Department(**doc).model_dump(), pic_count=count)


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(include_inactive: bool = False, _: dict = Depends(require_user)):
    query: dict = {} if include_inactive else {"status": "active"}
    docs = await db.departments.find(query).sort("name", 1).to_list(500)
    return [await _to_out(doc) for doc in docs]


@router.post("/departments", response_model=DepartmentOut, status_code=201)
async def create_department(input: DepartmentCreate, _: dict = Depends(require_admin)):
    name = input.name.strip()
    if await db.departments.find_one({"name": name}):
        raise HTTPException(status_code=409, detail="a department with that name already exists")
    department = Department(**{**input.model_dump(), "name": name})
    await db.departments.insert_one(department.model_dump())
    return await _to_out(department.model_dump())


@router.put("/departments/{department_id}", response_model=DepartmentOut)
async def update_department(
    department_id: str, input: DepartmentUpdate, _: dict = Depends(require_admin)
):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "name" in changes and changes["name"]:
        changes["name"] = changes["name"].strip()
        clash = await db.departments.find_one(
            {"name": changes["name"], "id": {"$ne": department_id}}
        )
        if clash:
            raise HTTPException(status_code=409, detail="a department with that name already exists")

    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.departments.find_one_and_update(
        {"id": department_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="department not found")

    # Keep the denormalised name on PICs in step with the rename.
    if "name" in changes:
        await db.pics.update_many(
            {"department_id": department_id}, {"$set": {"department": changes["name"]}}
        )
    return await _to_out(doc)


@router.delete("/departments/{department_id}", status_code=204)
async def delete_department(department_id: str, _: dict = Depends(require_admin)):
    assigned = await db.pics.count_documents({"department_id": department_id})
    if assigned:
        raise HTTPException(
            status_code=409,
            detail=f"{assigned} PIC(s) still belong to this department — move them first",
        )
    result = await db.departments.delete_one({"id": department_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="department not found")
    return None
