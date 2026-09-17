"""Application catalog endpoints — RBAC-scoped reads, admin-only mutations.

Security posture (2026-02):
- ``list_apps`` uses bounded, indexed queries with pagination and enum-checked
  sort keys; free-text search input is length-capped and regex-escaped.
- Favorites live in their own collection (``favorites``) with a unique
  ``(user_id, app_id)`` index — a client can no longer inflate counts by
  replaying the toggle endpoint. Counts on ``apps.favorite_count`` are derived
  server-side from that collection.
"""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ASCENDING, DESCENDING, ReturnDocument

from lib.auth import allowed_category_ids, require_admin, require_user
from lib.db import db
from models.catalog import (
    Environment,
    AppCreate,
    AppUpdate,
    CatalogApp,
    FavoriteUpdate,
    SortId,
    Status,
)

router = APIRouter()

_MAX_QUERY_LEN = 120
_DEFAULT_LIMIT = 200
_MAX_LIMIT = 500

_SORT_TO_MONGO: dict[str, list[tuple[str, int]]] = {
    "name_asc": [("name", ASCENDING)],
    "name_desc": [("name", DESCENDING)],
    "most_used": [("usage_count", DESCENDING), ("name", ASCENDING)],
    "most_favorite": [("favorite_count", DESCENDING), ("name", ASCENDING)],
    "recently_added": [("created_at", DESCENDING), ("name", ASCENDING)],
    "recently_updated": [("updated_at", DESCENDING), ("name", ASCENDING)],
}


def _build_query(
    q: str | None, category_id: str | None, environment: str | None, status: str | None
) -> dict:
    query: dict = {}
    if category_id and category_id != "All":
        query["category_id"] = category_id
    if environment and environment != "All":
        query["environment"] = environment
    if status and status != "All":
        query["status"] = status
    if q and q.strip():
        needle = q.strip()[:_MAX_QUERY_LEN]
        rx = {"$regex": re.escape(needle), "$options": "i"}
        query["$or"] = [{"name": rx}, {"description": rx}]
    return query


async def _resolve_names(docs: list[dict]) -> list[CatalogApp]:
    """Attach resolved category_name to each app doc and build the response models."""
    ids = {d.get("category_id") for d in docs if d.get("category_id")}
    names: dict[str, str] = {}
    if ids:
        cats = await db.categories.find({"id": {"$in": list(ids)}}).to_list(500)
        names = {c["id"]: c["name"] for c in cats}
    out: list[CatalogApp] = []
    for d in docs:
        d = dict(d)
        d["category_name"] = names.get(d.get("category_id", ""), "Uncategorized")
        out.append(CatalogApp(**d))
    return out


def _scope_query(user: dict, base: dict) -> dict:
    """Enforce category visibility for normal users; admins see everything."""
    allowed = allowed_category_ids(user)
    if allowed is None:
        return base
    scoped = dict(base)
    scoped["category_id"] = {"$in": allowed}
    return scoped


async def _accessible_app(app_id: str, user: dict) -> dict:
    doc = await db.apps.find_one({"id": app_id})
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    allowed = allowed_category_ids(user)
    if allowed is not None and doc.get("category_id") not in allowed:
        raise HTTPException(
            status_code=403,
            detail="access denied: this application's category is not assigned to you",
        )
    return doc


async def _assert_category_exists(category_id: str) -> None:
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=422, detail="unknown category")


async def _recount_favorites(app_id: str) -> dict:
    """Set ``favorite_count`` to the authoritative value derived from the
    ``favorites`` collection. Returns the updated app document."""
    count = await db.favorites.count_documents({"app_id": app_id})
    doc = await db.apps.find_one_and_update(
        {"id": app_id},
        {"$set": {"favorite_count": int(count)}},
        return_document=ReturnDocument.AFTER,
    )
    return doc


@router.get("/apps", response_model=list[CatalogApp])
async def list_apps(
    q: str | None = Query(default=None, max_length=_MAX_QUERY_LEN),
    category_id: str | None = Query(default=None, max_length=80),
    environment: Environment | None = None,
    status: Status | None = None,
    sort: SortId = "name_asc",
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0, le=100_000),
    user: dict = Depends(require_user),
):
    query = _scope_query(user, _build_query(q, category_id, environment, status))
    cursor = (
        db.apps.find(query)
        .sort(_SORT_TO_MONGO.get(sort, _SORT_TO_MONGO["name_asc"]))
        .skip(offset)
        .limit(limit)
    )
    docs = await cursor.to_list(limit)
    return await _resolve_names(docs)


@router.get("/apps/{app_id}", response_model=CatalogApp)
async def get_app(app_id: str, user: dict = Depends(require_user)):
    doc = await _accessible_app(app_id, user)
    return (await _resolve_names([doc]))[0]


@router.post("/apps", response_model=CatalogApp, status_code=201)
async def create_app(input: AppCreate, _: dict = Depends(require_admin)):
    await _assert_category_exists(input.category_id)
    app_obj = CatalogApp(**input.model_dump())
    await db.apps.insert_one(app_obj.model_dump())
    return app_obj


@router.put("/apps/{app_id}", response_model=CatalogApp)
async def update_app(app_id: str, input: AppUpdate, _: dict = Depends(require_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "category_id" in changes:
        await _assert_category_exists(changes["category_id"])
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="application not found")
    return (await _resolve_names([doc]))[0]


@router.delete("/apps/{app_id}", status_code=204)
async def delete_app(app_id: str, _: dict = Depends(require_admin)):
    result = await db.apps.delete_one({"id": app_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="application not found")
    # Clean up the per-user favorite rows too so the count stays honest.
    await db.favorites.delete_many({"app_id": app_id})
    return None


@router.post("/apps/{app_id}/launch", response_model=CatalogApp)
async def launch_app(app_id: str, user: dict = Depends(require_user)):
    await _accessible_app(app_id, user)  # backend-enforced: no launching what you can't see
    doc = await db.apps.find_one_and_update(
        {"id": app_id}, {"$inc": {"usage_count": 1}}, return_document=ReturnDocument.AFTER
    )
    return (await _resolve_names([doc]))[0]


@router.post("/apps/{app_id}/favorite", response_model=CatalogApp)
async def toggle_favorite(app_id: str, input: FavoriteUpdate, user: dict = Depends(require_user)):
    await _accessible_app(app_id, user)
    if input.favorite:
        # Idempotent insert via update-with-upsert; the unique index makes a
        # replay a no-op instead of a double-count.
        await db.favorites.update_one(
            {"user_id": user["id"], "app_id": app_id},
            {
                "$setOnInsert": {
                    "user_id": user["id"],
                    "app_id": app_id,
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
    else:
        await db.favorites.delete_one({"user_id": user["id"], "app_id": app_id})
    doc = await _recount_favorites(app_id)
    return (await _resolve_names([doc]))[0]


@router.get("/apps/me/favorites", response_model=list[str])
async def my_favorite_ids(user: dict = Depends(require_user)):
    """List of app ids favourited by the current user — the frontend uses
    this to seed the star state without trusting localStorage."""
    docs = await db.favorites.find({"user_id": user["id"]}, {"app_id": 1}).to_list(2000)
    return [d["app_id"] for d in docs]
