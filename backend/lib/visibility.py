"""Shared visibility helpers for servers and PICs.

Normal users may only see infrastructure attached to applications in their assigned
categories; administrators see everything. Centralised here so the servers and pics
routers cannot drift apart.
"""

from lib.auth import allowed_category_ids
from lib.db import db


async def visible_app_ids(user: dict) -> set[str] | None:
    """Ids of applications this user may see. None = unrestricted (administrator)."""
    allowed = allowed_category_ids(user)
    if allowed is None:
        return None
    docs = await db.apps.find({"category_id": {"$in": allowed}}, {"id": 1}).to_list(5000)
    return {d["id"] for d in docs}


async def app_name_map(ids: set[str] | list[str]) -> dict[str, str]:
    ids = list(ids)
    if not ids:
        return {}
    docs = await db.apps.find({"id": {"$in": ids}}, {"id": 1, "name": 1}).to_list(5000)
    return {d["id"]: d["name"] for d in docs}


def server_is_visible(server: dict, allowed_apps: set[str] | None) -> bool:
    if allowed_apps is None:
        return True
    return bool(set(server.get("application_ids") or []) & allowed_apps)


async def pic_is_visible(pic: dict, allowed_apps: set[str] | None) -> bool:
    """A PIC is visible when they own a visible application, or a server that is
    itself visible to this user."""
    if allowed_apps is None:
        return True
    if set(pic.get("application_ids") or []) & allowed_apps:
        return True
    servers = await db.servers.find({"pic_ids": pic["id"]}, {"application_ids": 1}).to_list(2000)
    return any(set(s.get("application_ids") or []) & allowed_apps for s in servers)
