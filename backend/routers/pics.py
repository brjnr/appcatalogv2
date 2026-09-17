"""PIC (person in charge) endpoints — scoped reads, admin-only mutations."""

import re
from calendar import monthrange
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.dates import today_iso
from lib.db import db
from lib.visibility import app_name_map, pic_is_visible, visible_app_ids
from models.infra import (
    Pic,
    PicCreate,
    PicOut,
    PicUpdate,
    RefSummary,
    StandbyEntryOut,
)

router = APIRouter()


async def _to_out(doc: dict) -> PicOut:
    app_ids = list(doc.get("application_ids") or [])
    schedule = list(doc.get("standby_schedule") or [])
    # Resolve names for both assignments and standby rows in one lookup.
    names = await app_name_map({*app_ids, *[s.get("application_id", "") for s in schedule]})

    # Server links live on servers.pic_ids — single source of truth.
    server_docs = await db.servers.find({"pic_ids": doc["id"]}, {"id": 1, "name": 1}).to_list(500)

    base = Pic(**doc)
    return PicOut(
        **base.model_dump(),
        applications=[
            RefSummary(id=app_id, name=names[app_id])
            for app_id in sorted(app_ids, key=lambda i: names.get(i, "").lower())
            if app_id in names
        ],
        servers=[
            RefSummary(id=s["id"], name=s["name"])
            for s in sorted(server_docs, key=lambda s: s["name"].lower())
        ],
        standby_schedule_out=[
            StandbyEntryOut(
                date=entry["date"],
                application_id=entry.get("application_id", ""),
                notes=entry.get("notes", ""),
                application_name=names.get(entry.get("application_id", ""), "—"),
            )
            for entry in sorted(schedule, key=lambda e: e.get("date", ""))
        ],
    )


async def _resolve_department(payload: dict) -> None:
    """Department is picked from the managed list; keep the denormalised name in step."""
    if "department_id" not in payload:
        return
    department_id = payload.get("department_id") or ""
    if not department_id:
        payload["department"] = ""
        return
    doc = await db.departments.find_one({"id": department_id}, {"name": 1})
    if not doc:
        raise HTTPException(status_code=422, detail="department does not exist")
    payload["department"] = doc["name"]


async def _validate_apps(app_ids: list[str] | None) -> None:
    if app_ids:
        found = await db.apps.count_documents({"id": {"$in": list(set(app_ids))}})
        if found != len(set(app_ids)):
            raise HTTPException(status_code=422, detail="one or more applications do not exist")


async def _sync_server_links(pic_id: str, server_ids: list[str]) -> None:
    """Server↔PIC is stored on the server; mirror the admin's PIC-side edit onto servers."""
    if server_ids:
        found = await db.servers.count_documents({"id": {"$in": list(set(server_ids))}})
        if found != len(set(server_ids)):
            raise HTTPException(status_code=422, detail="one or more servers do not exist")
    await db.servers.update_many({"pic_ids": pic_id}, {"$pull": {"pic_ids": pic_id}})
    if server_ids:
        await db.servers.update_many(
            {"id": {"$in": list(set(server_ids))}}, {"$addToSet": {"pic_ids": pic_id}}
        )


class StandbyCalendarEntry(BaseModel):
    """One standby shift flattened across all PICs, for the calendar view."""

    date: str
    pic_id: str
    pic_name: str
    pic_initials: str
    pic_department_id: str = ""
    pic_department: str = ""
    application_id: str
    application_name: str
    notes: str = ""


class StandbyCalendar(BaseModel):
    month: str  # YYYY-MM
    entries: list[StandbyCalendarEntry]


class StandbyShiftInput(BaseModel):
    pic_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    application_id: str
    notes: str = Field(default="", max_length=300)


class StandbyMoveInput(BaseModel):
    pic_id: str
    application_id: str
    from_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    to_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


async def _standby_entries(
    user: dict, predicate
) -> list[StandbyCalendarEntry]:
    """Flatten every PIC's schedule, keeping the rows `predicate(date)` accepts and the
    applications this user is allowed to see."""
    allowed = await visible_app_ids(user)
    docs = await db.pics.find().sort("name", 1).to_list(1000)
    app_names = await app_name_map(
        {e.get("application_id", "") for d in docs for e in (d.get("standby_schedule") or [])}
    )

    entries: list[StandbyCalendarEntry] = []
    for pic in docs:
        for entry in pic.get("standby_schedule") or []:
            date = entry.get("date", "")
            app_id = entry.get("application_id", "")
            if not date or not predicate(date):
                continue
            if allowed is not None and app_id not in allowed:
                continue
            entries.append(
                StandbyCalendarEntry(
                    date=date,
                    pic_id=pic["id"],
                    pic_name=pic["name"],
                    pic_initials=pic.get("initials", ""),
                    pic_department_id=pic.get("department_id", ""),
                    pic_department=pic.get("department", ""),
                    application_id=app_id,
                    application_name=app_names.get(app_id, "—"),
                    notes=entry.get("notes", ""),
                )
            )
    entries.sort(key=lambda e: (e.date, e.pic_name))
    return entries


@router.get("/standby", response_model=StandbyCalendar)
async def standby_calendar(month: str | None = None, user: dict = Depends(require_user)):
    """On-call roster for a month (defaults to the current month, server-anchored).
    Scoped: a normal user only sees shifts for applications assigned to them."""
    target = month or today_iso()[:7]
    if len(target) != 7 or target[4] != "-":
        raise HTTPException(status_code=422, detail="month must be formatted YYYY-MM")

    entries = await _standby_entries(user, lambda date: date.startswith(target))
    return StandbyCalendar(month=target, entries=entries)


class StandbyUpcoming(BaseModel):
    today: str
    days: int
    entries: list[StandbyCalendarEntry]


@router.get("/standby/upcoming", response_model=StandbyUpcoming)
async def standby_upcoming(days: int = 7, user: dict = Depends(require_user)):
    """Who is on standby today and over the next `days` days (server-anchored today)."""
    if days < 1 or days > 31:
        raise HTTPException(status_code=422, detail="days must be between 1 and 31")
    today = today_iso()
    horizon = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=days - 1)).strftime("%Y-%m-%d")
    entries = await _standby_entries(user, lambda date: today <= date <= horizon)
    return StandbyUpcoming(today=today, days=days, entries=entries)


async def _assert_shift_refs(pic_id: str, application_id: str) -> None:
    if not await db.pics.find_one({"id": pic_id}, {"id": 1}):
        raise HTTPException(status_code=404, detail="PIC not found")
    if not await db.apps.find_one({"id": application_id}, {"id": 1}):
        raise HTTPException(status_code=422, detail="application does not exist")


@router.post("/standby", status_code=201, response_model=StandbyCalendarEntry)
async def add_standby_shift(input: StandbyShiftInput, _: dict = Depends(require_admin)):
    """Assign one on-call shift (admin only)."""
    await _assert_shift_refs(input.pic_id, input.application_id)
    existing = await db.pics.find_one(
        {
            "id": input.pic_id,
            "standby_schedule": {
                "$elemMatch": {"date": input.date, "application_id": input.application_id}
            },
        },
        {"id": 1},
    )
    if existing:
        raise HTTPException(status_code=409, detail="that PIC already covers this app on that date")

    await db.pics.update_one(
        {"id": input.pic_id},
        {
            "$push": {
                "standby_schedule": {
                    "date": input.date,
                    "application_id": input.application_id,
                    "notes": input.notes,
                }
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )
    pic = await db.pics.find_one({"id": input.pic_id})
    names = await app_name_map([input.application_id])
    return StandbyCalendarEntry(
        date=input.date,
        pic_id=input.pic_id,
        pic_name=pic["name"],
        pic_initials=pic.get("initials", ""),
        pic_department_id=pic.get("department_id", ""),
        pic_department=pic.get("department", ""),
        application_id=input.application_id,
        application_name=names.get(input.application_id, "—"),
        notes=input.notes,
    )


@router.patch("/standby/move", response_model=StandbyCalendarEntry)
async def move_standby_shift(input: StandbyMoveInput, _: dict = Depends(require_admin)):
    """Drag-and-drop reschedule: move one shift to another day (admin only)."""
    pic = await db.pics.find_one({"id": input.pic_id})
    if not pic:
        raise HTTPException(status_code=404, detail="PIC not found")

    schedule = list(pic.get("standby_schedule") or [])
    match = next(
        (
            e
            for e in schedule
            if e.get("date") == input.from_date
            and e.get("application_id") == input.application_id
        ),
        None,
    )
    if not match:
        raise HTTPException(status_code=404, detail="standby shift not found")
    if any(
        e.get("date") == input.to_date and e.get("application_id") == input.application_id
        for e in schedule
    ):
        raise HTTPException(status_code=409, detail="that shift already exists on the target date")

    moved = {**match, "date": input.to_date}
    schedule = [e for e in schedule if e is not match] + [moved]
    await db.pics.update_one(
        {"id": input.pic_id},
        {"$set": {"standby_schedule": schedule, "updated_at": datetime.now(timezone.utc)}},
    )
    names = await app_name_map([input.application_id])
    return StandbyCalendarEntry(
        date=input.to_date,
        pic_id=input.pic_id,
        pic_name=pic["name"],
        pic_initials=pic.get("initials", ""),
        pic_department_id=pic.get("department_id", ""),
        pic_department=pic.get("department", ""),
        application_id=input.application_id,
        application_name=names.get(input.application_id, "—"),
        notes=moved.get("notes", ""),
    )


@router.delete("/standby", status_code=204)
async def delete_standby_shift(
    pic_id: str,
    date: str,
    application_id: str,
    _: dict = Depends(require_admin),
):
    """Remove one on-call shift (admin only)."""
    result = await db.pics.update_one(
        {"id": pic_id},
        {
            "$pull": {"standby_schedule": {"date": date, "application_id": application_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PIC not found")
    return None


class StandbyRotateInput(BaseModel):
    """Auto-fill a month by rotating a department's PICs day by day."""

    department_id: str
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    application_id: str | None = None  # default: each PIC's first assigned application
    replace_existing: bool = False  # wipe that department's shifts in the month first
    include_weekends: bool = True


class StandbyRotateResult(BaseModel):
    month: str
    department_name: str
    pics_used: int
    created: int
    skipped: int
    entries: list[StandbyCalendarEntry]


@router.post("/standby/rotate", response_model=StandbyRotateResult)
async def rotate_standby(input: StandbyRotateInput, _: dict = Depends(require_admin)):
    """Round-robin every active PIC in a department across the days of the month."""
    department = await db.departments.find_one({"id": input.department_id})
    if not department:
        raise HTTPException(status_code=404, detail="department not found")

    pics = await db.pics.find(
        {"department_id": input.department_id, "status": "Active"}
    ).sort("name", 1).to_list(200)
    if not pics:
        raise HTTPException(
            status_code=422, detail="this department has no active PICs to rotate"
        )

    if input.application_id and not await db.apps.find_one({"id": input.application_id}, {"id": 1}):
        raise HTTPException(status_code=422, detail="application does not exist")

    year, month_no = (int(part) for part in input.month.split("-"))
    days_in_month = monthrange(year, month_no)[1]

    if input.replace_existing:
        for pic in pics:
            await db.pics.update_one(
                {"id": pic["id"]},
                {"$pull": {"standby_schedule": {"date": {"$regex": f"^{input.month}"}}}},
            )
            pic["standby_schedule"] = [
                e
                for e in (pic.get("standby_schedule") or [])
                if not str(e.get("date", "")).startswith(input.month)
            ]

    created = 0
    skipped = 0
    for index in range(days_in_month):
        day = index + 1
        date = f"{input.month}-{day:02d}"
        if not input.include_weekends and datetime.strptime(date, "%Y-%m-%d").weekday() >= 5:
            continue
        pic = pics[index % len(pics)]
        app_id = input.application_id or next(iter(pic.get("application_ids") or []), None)
        if not app_id:
            skipped += 1
            continue
        schedule = pic.get("standby_schedule") or []
        if any(e.get("date") == date and e.get("application_id") == app_id for e in schedule):
            skipped += 1
            continue
        entry = {"date": date, "application_id": app_id, "notes": "Auto-filled rotation"}
        schedule.append(entry)
        pic["standby_schedule"] = schedule
        await db.pics.update_one(
            {"id": pic["id"]},
            {"$push": {"standby_schedule": entry}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        created += 1

    app_names = await app_name_map(
        {e.get("application_id", "") for p in pics for e in (p.get("standby_schedule") or [])}
    )
    entries = [
        StandbyCalendarEntry(
            date=e["date"],
            pic_id=pic["id"],
            pic_name=pic["name"],
            pic_initials=pic.get("initials", ""),
            pic_department_id=pic.get("department_id", ""),
            pic_department=pic.get("department", ""),
            application_id=e.get("application_id", ""),
            application_name=app_names.get(e.get("application_id", ""), "—"),
            notes=e.get("notes", ""),
        )
        for pic in pics
        for e in (pic.get("standby_schedule") or [])
        if str(e.get("date", "")).startswith(input.month)
    ]
    entries.sort(key=lambda e: (e.date, e.pic_name))
    return StandbyRotateResult(
        month=input.month,
        department_name=department["name"],
        pics_used=len(pics),
        created=created,
        skipped=skipped,
        entries=entries,
    )


@router.get("/pics", response_model=list[PicOut])
async def list_pics(
    q: str | None = None,
    application_id: str | None = None,
    user: dict = Depends(require_user),
):
    query: dict = {}
    if application_id:
        query["application_ids"] = application_id
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"initials": rx}, {"email": rx}, {"employee_id": rx}]

    allowed = await visible_app_ids(user)
    docs = await db.pics.find(query).sort("name", 1).to_list(1000)
    out = []
    for doc in docs:
        if await pic_is_visible(doc, allowed):
            out.append(await _to_out(doc))
    return out


@router.get("/pics/{pic_id}", response_model=PicOut)
async def get_pic(pic_id: str, user: dict = Depends(require_user)):
    doc = await db.pics.find_one({"id": pic_id})
    if not doc:
        raise HTTPException(status_code=404, detail="PIC not found")
    allowed = await visible_app_ids(user)
    if not await pic_is_visible(doc, allowed):
        raise HTTPException(
            status_code=403,
            detail="access denied: this PIC is not linked to any application assigned to you",
        )
    return await _to_out(doc)


@router.post("/pics", response_model=PicOut, status_code=201)
async def create_pic(input: PicCreate, _: dict = Depends(require_admin)):
    await _validate_apps(input.application_ids)
    payload = input.model_dump()
    await _resolve_department(payload)
    server_ids = payload.pop("server_ids", [])
    pic = Pic(**payload)
    await db.pics.insert_one(pic.model_dump())
    await _sync_server_links(pic.id, server_ids)
    return await _to_out(pic.model_dump())


@router.put("/pics/{pic_id}", response_model=PicOut)
async def update_pic(pic_id: str, input: PicUpdate, _: dict = Depends(require_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if not await db.pics.find_one({"id": pic_id}):
        raise HTTPException(status_code=404, detail="PIC not found")

    server_ids = changes.pop("server_ids", None)
    await _resolve_department(changes)
    await _validate_apps(changes.get("application_ids"))
    if server_ids is not None:
        await _sync_server_links(pic_id, server_ids)

    if changes:
        changes["updated_at"] = datetime.now(timezone.utc)
        doc = await db.pics.find_one_and_update(
            {"id": pic_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
        )
    else:
        doc = await db.pics.find_one({"id": pic_id})
    return await _to_out(doc)


@router.delete("/pics/{pic_id}", status_code=204)
async def delete_pic(pic_id: str, _: dict = Depends(require_admin)):
    result = await db.pics.delete_one({"id": pic_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="PIC not found")
    await db.servers.update_many({"pic_ids": pic_id}, {"$pull": {"pic_ids": pic_id}})
    return None
