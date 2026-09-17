"""Notes / memo endpoints.

Every logged-in user sees all notes; only the author or an administrator may edit or
delete one. Notes are temporary: past `expires_at` they move to Trash automatically and
are purged after TRASH_RETENTION_DAYS.
"""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import require_user
from lib.dates import today_iso
from lib.db import db
from models.notes import (
    DEFAULT_VALID_DAYS,
    TRASH_RETENTION_DAYS,
    Note,
    NoteCreate,
    NoteLinkOut,
    NoteOut,
    NoteUpdate,
)

router = APIRouter()

_COLLECTIONS = {"application": "apps", "server": "servers", "pic": "pics"}


def _date_add(iso: str, days: int) -> str:
    return (datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


def _days_between(start: str, end: str) -> int:
    return (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days


async def _sweep() -> None:
    """Expire due notes into Trash, then purge Trash older than the retention window."""
    today = today_iso()
    now = datetime.now(timezone.utc)
    await db.notes.update_many(
        {"status": "active", "expires_at": {"$lt": today}},
        {"$set": {"status": "trashed", "trashed_at": now, "updated_at": now}},
    )
    await db.notes.delete_many(
        {"status": "trashed", "trashed_at": {"$lt": now - timedelta(days=TRASH_RETENTION_DAYS)}}
    )


async def _resolve_links(docs: list[dict]) -> dict[tuple[str, str], str]:
    """Resolve display names for every linked application / server / PIC in one pass."""
    wanted: dict[str, set[str]] = {"application": set(), "server": set(), "pic": set()}
    for doc in docs:
        for link in doc.get("links") or []:
            kind = link.get("kind")
            if kind in wanted:
                wanted[kind].add(link.get("id", ""))

    names: dict[tuple[str, str], str] = {}
    for kind, ids in wanted.items():
        if not ids:
            continue
        rows = await db[_COLLECTIONS[kind]].find(
            {"id": {"$in": list(ids)}}, {"id": 1, "name": 1}
        ).to_list(2000)
        for row in rows:
            names[(kind, row["id"])] = row["name"]
    return names


def _can_edit(doc: dict, user: dict) -> bool:
    """Author, anyone in a department the note was shared with, or an administrator."""
    if user["role"] == "administrator" or doc.get("author_id") == user["id"]:
        return True
    shared = doc.get("department_ids") or []
    mine = user.get("department_id") or ""
    return bool(mine) and mine in shared


def _visibility_filter(user: dict) -> dict:
    """Admins see everything; everyone else sees company-wide notes, their department's
    notes, and their own."""
    if user["role"] == "administrator":
        return {}
    return {
        "$or": [
            {"department_ids": {"$size": 0}},
            {"department_ids": {"$exists": False}},
            {"department_ids": user.get("department_id") or "__none__"},
            {"author_id": user["id"]},
        ]
    }


def _to_out(
    doc: dict,
    user: dict,
    names: dict[tuple[str, str], str],
    department_names: dict[str, str] | None = None,
) -> NoteOut:
    today = today_iso()
    base = Note(**doc)
    trashed_at = base.trashed_at
    return NoteOut(
        **base.model_dump(),
        links_out=[
            NoteLinkOut(
                kind=link.kind, id=link.id, name=names.get((link.kind, link.id), "(removed)")
            )
            for link in base.links
        ],
        days_left=_days_between(today, base.expires_at),
        purge_on=(
            (trashed_at + timedelta(days=TRASH_RETENTION_DAYS)).strftime("%Y-%m-%d")
            if trashed_at
            else None
        ),
        department_names=[
            (department_names or {}).get(department_id, "(removed)")
            for department_id in base.department_ids
        ],
        can_edit=_can_edit(doc, user),
    )


async def _validate_links(links: list) -> None:
    for link in links or []:
        kind = link.kind if hasattr(link, "kind") else link["kind"]
        link_id = link.id if hasattr(link, "id") else link["id"]
        if not await db[_COLLECTIONS[kind]].find_one({"id": link_id}, {"id": 1}):
            raise HTTPException(status_code=422, detail=f"linked {kind} does not exist")


async def _department_names() -> dict[str, str]:
    docs = await db.departments.find({}, {"id": 1, "name": 1}).to_list(500)
    return {d["id"]: d["name"] for d in docs}


async def _validate_departments(department_ids: list[str] | None) -> None:
    if not department_ids:
        return
    unique = list(set(department_ids))
    found = await db.departments.count_documents({"id": {"$in": unique}})
    if found != len(unique):
        raise HTTPException(status_code=422, detail="one or more departments do not exist")


async def _load_editable(note_id: str, user: dict) -> dict:
    doc = await db.notes.find_one({"id": note_id})
    if not doc:
        raise HTTPException(status_code=404, detail="note not found")
    if not _can_edit(doc, user):
        raise HTTPException(
            status_code=403,
            detail="only the author, their department, or an administrator can change this note",
        )
    return doc


SORTS: dict[str, tuple[str, int]] = {
    "newest": ("note_date", -1),
    "oldest": ("note_date", 1),
    "expiring": ("expires_at", 1),
    "recently_updated": ("updated_at", -1),
    "title": ("title", 1),
}


@router.get("/notes", response_model=list[NoteOut])
async def list_notes(
    view: str = "active",
    q: str | None = None,
    sort: str = "newest",
    department_id: str | None = None,
    user: dict = Depends(require_user),
):
    if view not in {"active", "trash"}:
        raise HTTPException(status_code=422, detail="view must be 'active' or 'trash'")
    if sort not in SORTS:
        raise HTTPException(status_code=422, detail=f"sort must be one of {sorted(SORTS)}")
    await _sweep()

    conditions: list[dict] = [
        {"status": "trashed" if view == "trash" else "active"},
        _visibility_filter(user),
    ]
    if department_id:
        conditions.append({"department_ids": department_id})
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        conditions.append({"$or": [{"title": rx}, {"body": rx}, {"author_name": rx}]})
    query = {"$and": [c for c in conditions if c]}

    field, direction = SORTS[sort]
    # Pinned notes always float to the top, then the chosen sort applies.
    docs = await db.notes.find(query).sort([("pinned", -1), (field, direction)]).to_list(1000)
    names = await _resolve_links(docs)
    departments = await _department_names()
    return [_to_out(doc, user, names, departments) for doc in docs]


class NoteAlert(BaseModel):
    id: str
    title: str
    expires_at: str
    days_left: int
    pinned: bool
    targets: list[str]  # names of the linked applications / servers


class NoteAlerts(BaseModel):
    within_days: int
    count: int
    items: list[NoteAlert]


@router.get("/notes/alerts", response_model=NoteAlerts)
async def note_alerts(within_days: int = 2, user: dict = Depends(require_user)):
    """Notes about an application or server that expire within `within_days` — drives the
    navbar badge."""
    if within_days < 0 or within_days > 30:
        raise HTTPException(status_code=422, detail="within_days must be between 0 and 30")
    await _sweep()
    today = today_iso()
    horizon = _date_add(today, within_days)

    query = {
        "$and": [
            {"status": "active"},
            {"expires_at": {"$lte": horizon}},
            {"links.kind": {"$in": ["application", "server"]}},
            _visibility_filter(user),
        ]
    }
    docs = await db.notes.find(query).sort([("pinned", -1), ("expires_at", 1)]).to_list(200)
    names = await _resolve_links(docs)
    items = [
        NoteAlert(
            id=doc["id"],
            title=doc["title"],
            expires_at=doc["expires_at"],
            days_left=_days_between(today, doc["expires_at"]),
            pinned=bool(doc.get("pinned")),
            targets=[
                names.get((link.get("kind", ""), link.get("id", "")), "(removed)")
                for link in (doc.get("links") or [])
                if link.get("kind") in {"application", "server"}
            ],
        )
        for doc in docs
    ]
    return NoteAlerts(within_days=within_days, count=len(items), items=items)


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(input: NoteCreate, user: dict = Depends(require_user)):
    await _validate_links(input.links)
    await _validate_departments(input.department_ids)
    today = today_iso()
    note_date = input.note_date or today
    expires_at = input.expires_at or _date_add(note_date, DEFAULT_VALID_DAYS)
    if _days_between(note_date, expires_at) < 0:
        raise HTTPException(status_code=422, detail="expiry date cannot precede the note date")

    note = Note(
        title=input.title.strip(),
        body=input.body,
        author_id=user["id"],
        author_name=user["name"],
        department_ids=input.department_ids,
        pinned=input.pinned,
        note_date=note_date,
        expires_at=expires_at,
        links=input.links,
    )
    await db.notes.insert_one(note.model_dump())
    names = await _resolve_links([note.model_dump()])
    return _to_out(note.model_dump(), user, names, await _department_names())


@router.put("/notes/{note_id}", response_model=NoteOut)
async def update_note(note_id: str, input: NoteUpdate, user: dict = Depends(require_user)):
    doc = await _load_editable(note_id, user)
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if input.links is not None:
        await _validate_links(input.links)
    if input.department_ids is not None:
        await _validate_departments(input.department_ids)

    note_date = changes.get("note_date") or doc["note_date"]
    expires_at = changes.get("expires_at") or doc["expires_at"]
    if _days_between(note_date, expires_at) < 0:
        raise HTTPException(status_code=422, detail="expiry date cannot precede the note date")

    changes["updated_at"] = datetime.now(timezone.utc)
    doc.update(changes)
    await db.notes.update_one({"id": note_id}, {"$set": changes})
    names = await _resolve_links([doc])
    return _to_out(doc, user, names, await _department_names())


@router.patch("/notes/{note_id}/pin", response_model=NoteOut)
async def toggle_pin(note_id: str, user: dict = Depends(require_user)):
    """Pin/unpin a note so the on-call team sees it first."""
    doc = await _load_editable(note_id, user)
    pinned = not bool(doc.get("pinned"))
    changes = {"pinned": pinned, "updated_at": datetime.now(timezone.utc)}
    doc.update(changes)
    await db.notes.update_one({"id": note_id}, {"$set": changes})
    names = await _resolve_links([doc])
    return _to_out(doc, user, names, await _department_names())


@router.post("/notes/{note_id}/restore", response_model=NoteOut)
async def restore_note(note_id: str, user: dict = Depends(require_user)):
    """Pull a note back out of Trash; a lapsed retention date is pushed forward."""
    doc = await _load_editable(note_id, user)
    today = today_iso()
    expires_at = doc["expires_at"]
    if _days_between(today, expires_at) < 0:
        expires_at = _date_add(today, DEFAULT_VALID_DAYS)
    changes = {
        "status": "active",
        "trashed_at": None,
        "expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc),
    }
    doc.update(changes)
    await db.notes.update_one({"id": note_id}, {"$set": changes})
    names = await _resolve_links([doc])
    return _to_out(doc, user, names, await _department_names())


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, permanent: bool = False, user: dict = Depends(require_user)):
    """Soft-delete into Trash; `permanent=true` (or deleting from Trash) removes it for good."""
    doc = await _load_editable(note_id, user)
    if permanent or doc["status"] == "trashed":
        await db.notes.delete_one({"id": note_id})
    else:
        now = datetime.now(timezone.utc)
        await db.notes.update_one(
            {"id": note_id},
            {"$set": {"status": "trashed", "trashed_at": now, "updated_at": now}},
        )
    return None
