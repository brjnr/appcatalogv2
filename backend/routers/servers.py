"""Server inventory endpoints — scoped reads, admin-only mutations."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.db import db
from lib.visibility import app_name_map, server_is_visible, visible_app_ids
from models.infra import (
    RefSummary,
    Server,
    ServerCreate,
    ServerOut,
    ServerTicket,
    ServerTicketInput,
    ServerUpdate,
)

router = APIRouter()


async def _to_out(doc: dict) -> ServerOut:
    app_ids = list(doc.get("application_ids") or [])
    pic_ids = list(doc.get("pic_ids") or [])
    names = await app_name_map(app_ids)
    pics = []
    if pic_ids:
        pic_docs = await db.pics.find({"id": {"$in": pic_ids}}).to_list(200)
        pics = [
            RefSummary(id=p["id"], name=p["name"], initials=p.get("initials"))
            for p in sorted(pic_docs, key=lambda p: p["name"].lower())
        ]
    base = Server(**doc)
    return ServerOut(
        **base.model_dump(),
        applications=[
            RefSummary(id=app_id, name=names[app_id])
            for app_id in sorted(app_ids, key=lambda i: names.get(i, "").lower())
            if app_id in names
        ],
        pics=pics,
    )


async def _validate_links(app_ids: list[str] | None, pic_ids: list[str] | None) -> None:
    if app_ids:
        found = await db.apps.count_documents({"id": {"$in": list(set(app_ids))}})
        if found != len(set(app_ids)):
            raise HTTPException(status_code=422, detail="one or more applications do not exist")
    if pic_ids:
        found = await db.pics.count_documents({"id": {"$in": list(set(pic_ids))}})
        if found != len(set(pic_ids)):
            raise HTTPException(status_code=422, detail="one or more PICs do not exist")


class MapNode(BaseModel):
    id: str
    name: str
    kind: str  # "application" | "server"
    meta: str = ""  # category for apps, location/environment for servers
    location: str = ""  # site role (DC/DRC/Cloud/Co-location) — servers only


class MapEdge(BaseModel):
    application_id: str
    server_id: str


class DependencyMap(BaseModel):
    applications: list[MapNode]
    servers: list[MapNode]
    edges: list[MapEdge]
    shared_server_ids: list[str]  # servers used by more than one application


@router.get("/dependency-map", response_model=DependencyMap)
async def dependency_map(user: dict = Depends(require_user)):
    """Application ↔ server graph, scoped to what this user may see. Powers the visual
    map of which applications share which servers."""
    allowed = await visible_app_ids(user)
    server_docs = await db.servers.find().sort("name", 1).to_list(2000)
    servers = [s for s in server_docs if server_is_visible(s, allowed)]

    app_ids: set[str] = set()
    for s in servers:
        for app_id in s.get("application_ids") or []:
            if allowed is None or app_id in allowed:
                app_ids.add(app_id)

    app_docs = (
        await db.apps.find({"id": {"$in": list(app_ids)}}).sort("name", 1).to_list(2000)
        if app_ids
        else []
    )
    cats = await db.categories.find({}, {"id": 1, "name": 1}).to_list(500)
    cat_names = {c["id"]: c["name"] for c in cats}

    edges: list[MapEdge] = []
    for s in servers:
        for app_id in s.get("application_ids") or []:
            if app_id in app_ids:
                edges.append(MapEdge(application_id=app_id, server_id=s["id"]))

    return DependencyMap(
        applications=[
            MapNode(
                id=a["id"],
                name=a["name"],
                kind="application",
                meta=cat_names.get(a.get("category_id", ""), "Uncategorized"),
            )
            for a in app_docs
        ],
        servers=[
            MapNode(
                id=s["id"],
                name=s["name"],
                kind="server",
                meta=f"{s.get('location', 'DC')} · {s.get('environment', '')}".strip(" ·"),
                location=s.get("location", "DC"),
            )
            for s in servers
        ],
        edges=edges,
        shared_server_ids=[
            s["id"]
            for s in servers
            if len([a for a in (s.get("application_ids") or []) if a in app_ids]) > 1
        ],
    )


@router.get("/servers", response_model=list[ServerOut])
async def list_servers(
    q: str | None = None,
    application_id: str | None = None,
    user: dict = Depends(require_user),
):
    query: dict = {}
    if application_id:
        query["application_ids"] = application_id
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"hostname": rx}, {"ip_address": rx}, {"vm_name": rx}]

    allowed = await visible_app_ids(user)
    docs = await db.servers.find(query).sort("name", 1).to_list(2000)
    visible = [d for d in docs if server_is_visible(d, allowed)]
    return [await _to_out(d) for d in visible]


@router.get("/servers/{server_id}", response_model=ServerOut)
async def get_server(server_id: str, user: dict = Depends(require_user)):
    doc = await db.servers.find_one({"id": server_id})
    if not doc:
        raise HTTPException(status_code=404, detail="server not found")
    allowed = await visible_app_ids(user)
    if not server_is_visible(doc, allowed):
        raise HTTPException(
            status_code=403,
            detail="access denied: this server belongs to applications not assigned to you",
        )
    return await _to_out(doc)


@router.post("/servers", response_model=ServerOut, status_code=201)
async def create_server(input: ServerCreate, _: dict = Depends(require_admin)):
    await _validate_links(input.application_ids, input.pic_ids)
    server = Server(**input.model_dump())
    await db.servers.insert_one(server.model_dump())
    return await _to_out(server.model_dump())


@router.put("/servers/{server_id}", response_model=ServerOut)
async def update_server(server_id: str, input: ServerUpdate, _: dict = Depends(require_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    await _validate_links(changes.get("application_ids"), changes.get("pic_ids"))
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.servers.find_one_and_update(
        {"id": server_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="server not found")
    return await _to_out(doc)


@router.delete("/servers/{server_id}", status_code=204)
async def delete_server(server_id: str, _: dict = Depends(require_admin)):
    result = await db.servers.delete_one({"id": server_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="server not found")
    return None


# ------------------------------------------------------------------ Jira tickets per server


async def _ticket_server(server_id: str) -> dict:
    doc = await db.servers.find_one({"id": server_id})
    if not doc:
        raise HTTPException(status_code=404, detail="server not found")
    return doc


@router.post("/servers/{server_id}/tickets", response_model=ServerOut, status_code=201)
async def add_server_ticket(
    server_id: str, input: ServerTicketInput, _: dict = Depends(require_admin)
):
    """Record a Jira ticket raised against this server (admin only)."""
    await _ticket_server(server_id)
    ticket = ServerTicket(**input.model_dump())
    await db.servers.update_one(
        {"id": server_id},
        {
            "$push": {"tickets": ticket.model_dump()},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )
    return await _to_out(await _ticket_server(server_id))


@router.put("/servers/{server_id}/tickets/{ticket_id}", response_model=ServerOut)
async def update_server_ticket(
    server_id: str,
    ticket_id: str,
    input: ServerTicketInput,
    _: dict = Depends(require_admin),
):
    doc = await _ticket_server(server_id)
    tickets = list(doc.get("tickets") or [])
    match = next((t for t in tickets if t.get("id") == ticket_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="ticket not found")
    match.update(input.model_dump())
    match["updated_at"] = datetime.now(timezone.utc)
    await db.servers.update_one(
        {"id": server_id},
        {"$set": {"tickets": tickets, "updated_at": datetime.now(timezone.utc)}},
    )
    return await _to_out(await _ticket_server(server_id))


@router.delete("/servers/{server_id}/tickets/{ticket_id}", response_model=ServerOut)
async def delete_server_ticket(
    server_id: str, ticket_id: str, _: dict = Depends(require_admin)
):
    doc = await _ticket_server(server_id)
    if not any(t.get("id") == ticket_id for t in (doc.get("tickets") or [])):
        raise HTTPException(status_code=404, detail="ticket not found")
    await db.servers.update_one(
        {"id": server_id},
        {
            "$pull": {"tickets": {"id": ticket_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )
    return await _to_out(await _ticket_server(server_id))
