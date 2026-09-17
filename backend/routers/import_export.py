"""Bulk import / export for the primary catalog entities.

Design notes
------------
- Export gives you a downloadable ``.xlsx`` template per entity with headers,
  an example row, and (where relevant) a reference sheet listing category /
  department IDs to copy into the ``id`` columns.
- Import accepts ``.xlsx`` or ``.csv``. The file is parsed entirely in memory
  (``BytesIO``) and the ``UploadFile`` is closed as soon as we finish reading
  it — nothing lands on disk, so ephemeral disk is never a leak vector.
- Rows are treated as upserts: a non-empty ``id`` column updates that
  document, otherwise a new row is created. Every row's outcome is returned
  in the response so an admin can spot bad rows without leaving the page.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from pydantic import ValidationError

from lib.auth import require_admin
from lib.db import db
from models.catalog import AppCreate
from models.categories import CategoryCreate
from models.infra import PicCreate, ServerCreate

router = APIRouter()

# Hard cap for uploads — the global RequestSizeLimit is set higher for JSON,
# but bulk sheets get their own tighter ceiling here.
MAX_IMPORT_BYTES = 3 * 1024 * 1024
MAX_IMPORT_ROWS = 1000

# Column schemas per entity: (header, help). Keep header names stable — imports
# match by exact header, and exports use these as the sheet's first row.
ENTITY_SCHEMAS: dict[str, list[tuple[str, str]]] = {
    "categories": [
        ("id", "leave blank to create; fill to update an existing category"),
        ("name", "required, unique"),
        ("description", "optional"),
        ("icon", "lucide icon name — e.g. Layers, Server, ShieldAlert"),
        ("status", "active | inactive"),
    ],
    "applications": [
        ("id", "leave blank to create; fill to update"),
        ("name", "required"),
        ("description", "optional"),
        ("category_id", "required — see Categories reference sheet"),
        ("environment", "Production | Staging | Internal | Cloud | On-Premises"),
        ("status", "Active | Maintenance | Deprecated"),
        ("url", "required, http(s) URL"),
        ("icon", "lucide icon name"),
    ],
    "servers": [
        ("id", "leave blank to create; fill to update"),
        ("name", "required"),
        ("hostname", ""),
        ("ip_address", ""),
        ("vm_name", ""),
        ("os", ""),
        ("os_version", ""),
        ("server_type", ""),
        ("environment", "Production | Staging | Development | DR | Internal"),
        ("location", "DC | DRC | Cloud | Co-location"),
        ("status", "Active | Maintenance | Decommissioned"),
        ("cpu", ""),
        ("ram", ""),
        ("storage", ""),
        ("datacenter", ""),
        ("cluster", ""),
        ("virtualization", ""),
        ("description", ""),
        ("date_created", "YYYY-MM-DD"),
        ("date_decommissioned", "YYYY-MM-DD"),
        ("decommission_notes", ""),
    ],
    "pics": [
        ("id", "leave blank to create; fill to update"),
        ("name", "required"),
        ("initials", "1-3 letters/digits"),
        ("employee_id", ""),
        ("email", ""),
        ("phone", ""),
        ("department_id", "see Departments reference sheet"),
        ("position", ""),
        ("status", "Active | Inactive"),
    ],
}

# One example row per entity so the template is self-documenting.
EXAMPLE_ROWS: dict[str, dict[str, Any]] = {
    "categories": {
        "name": "Example Category",
        "description": "Description shown on category cards",
        "icon": "Layers",
        "status": "active",
    },
    "applications": {
        "name": "Example App",
        "description": "Short description",
        "category_id": "<paste id from Categories sheet>",
        "environment": "Production",
        "status": "Active",
        "url": "https://example.internal.corp",
        "icon": "AppWindow",
    },
    "servers": {
        "name": "EXAMPLE-01",
        "hostname": "example-01.internal.corp",
        "ip_address": "10.10.10.10",
        "environment": "Production",
        "location": "DC",
        "status": "Active",
        "date_created": "2024-01-15",
    },
    "pics": {
        "name": "Example Person",
        "initials": "EP",
        "email": "example.person@corp.com",
        "status": "Active",
    },
}


# ------------------------------------------------------------------- export


def _write_help_sheet(wb: Workbook, entity: str) -> None:
    """Second sheet in the template: field-by-field guidance."""
    ws = wb.create_sheet("How to fill")
    ws.append(["Column", "Guidance"])
    for header, help_text in ENTITY_SCHEMAS[entity]:
        ws.append([header, help_text])
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 80


async def _write_reference_sheet(wb: Workbook, entity: str) -> None:
    """Third sheet: copy-pasteable lookup values for foreign-key columns."""
    if entity == "applications":
        ws = wb.create_sheet("Categories reference")
        ws.append(["id", "name", "status"])
        cats = await db.categories.find({}, {"id": 1, "name": 1, "status": 1}).sort("name", 1).to_list(500)
        for c in cats:
            ws.append([c.get("id", ""), c.get("name", ""), c.get("status", "")])
        ws.column_dimensions["A"].width = 40
        ws.column_dimensions["B"].width = 30
    elif entity == "pics":
        ws = wb.create_sheet("Departments reference")
        ws.append(["id", "name", "status"])
        deps = await db.departments.find({}, {"id": 1, "name": 1, "status": 1}).sort("name", 1).to_list(500)
        for d in deps:
            ws.append([d.get("id", ""), d.get("name", ""), d.get("status", "")])
        ws.column_dimensions["A"].width = 40
        ws.column_dimensions["B"].width = 30


async def _build_workbook(entity: str, include_data: bool) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = entity.capitalize()
    headers = [h for h, _ in ENTITY_SCHEMAS[entity]]
    ws.append(headers)
    ws.freeze_panes = "A2"
    for i, h in enumerate(headers, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = max(14, len(h) + 4)

    if include_data:
        # Live export: dump every row in the collection so an admin can edit
        # and re-upload with the ``id`` column filled in.
        cursor = _entity_cursor(entity)
        async for doc in cursor:
            ws.append([_stringify(doc.get(h)) for h in headers])
    else:
        example = EXAMPLE_ROWS.get(entity, {})
        ws.append([_stringify(example.get(h, "")) for h in headers])

    _write_help_sheet(wb, entity)
    await _write_reference_sheet(wb, entity)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _entity_cursor(entity: str):
    """Motor cursor for the collection backing ``entity``."""
    return {
        "categories": db.categories.find({}, projection={"_id": 0}).sort("name", 1),
        "applications": db.apps.find({}, projection={"_id": 0}).sort("name", 1),
        "servers": db.servers.find({}, projection={"_id": 0}).sort("name", 1),
        "pics": db.pics.find({}, projection={"_id": 0}).sort("name", 1),
    }[entity]


def _stringify(value: Any) -> Any:
    """Coerce Mongo values into cell-safe primitives."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(v) for v in value)
    if isinstance(value, dict):
        # Keep the file simple — dict values are rare in exportable fields.
        return ""
    return value


@router.get("/exports/{entity}/template")
async def download_template(entity: str, _: dict = Depends(require_admin)):
    """Download an empty ``.xlsx`` template with headers + one example row."""
    if entity not in ENTITY_SCHEMAS:
        raise HTTPException(status_code=404, detail="unknown entity")
    data = await _build_workbook(entity, include_data=False)
    return _xlsx_response(data, f"{entity}-template.xlsx")


@router.get("/exports/{entity}")
async def download_export(entity: str, _: dict = Depends(require_admin)):
    """Download a live ``.xlsx`` of every row, ready for edit + re-import."""
    if entity not in ENTITY_SCHEMAS:
        raise HTTPException(status_code=404, detail="unknown entity")
    data = await _build_workbook(entity, include_data=True)
    return _xlsx_response(data, f"{entity}-export.xlsx")


def _xlsx_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ------------------------------------------------------------------- import


async def _read_upload_bytes(file: UploadFile) -> bytes:
    """Read the whole upload into memory with a hard cap, then close the handle."""
    buffer = io.BytesIO()
    total = 0
    try:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_IMPORT_BYTES:
                raise HTTPException(status_code=413, detail="upload exceeds 3 MB limit")
            buffer.write(chunk)
    finally:
        # Explicit close — the SpooledTemporaryFile behind UploadFile releases
        # any backing temp file immediately, so the sheet never persists.
        await file.close()
    return buffer.getvalue()


def _rows_from_bytes(filename: str, data: bytes) -> list[dict[str, Any]]:
    """Parse XLSX or CSV bytes into a list of dicts keyed by the header row."""
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        return _rows_from_xlsx(data)
    if name.endswith(".csv") or name.endswith(".tsv"):
        return _rows_from_csv(data, delimiter="\t" if name.endswith(".tsv") else ",")
    # Try to sniff — first bytes of an xlsx are the ZIP magic ``PK``.
    if data[:2] == b"PK":
        return _rows_from_xlsx(data)
    return _rows_from_csv(data, delimiter=",")


def _rows_from_xlsx(data: bytes) -> list[dict[str, Any]]:
    try:
        wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"not a readable .xlsx file: {exc}") from exc
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        headers = [str(h).strip() if h is not None else "" for h in next(rows_iter)]
    except StopIteration:
        return []
    out: list[dict[str, Any]] = []
    for row in rows_iter:
        if row is None or all((v is None or v == "") for v in row):
            continue
        record = {}
        for i, header in enumerate(headers):
            if not header:
                continue
            value = row[i] if i < len(row) else None
            record[header] = _normalize_cell(value)
        if record:
            out.append(record)
        if len(out) >= MAX_IMPORT_ROWS:
            break
    return out


def _rows_from_csv(data: bytes, delimiter: str = ",") -> list[dict[str, Any]]:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    out: list[dict[str, Any]] = []
    for row in reader:
        record = {(k or "").strip(): _normalize_cell(v) for k, v in row.items() if k}
        if any(v not in ("", None) for v in record.values()):
            out.append(record)
        if len(out) >= MAX_IMPORT_ROWS:
            break
    return out


def _normalize_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, str):
        return value.strip()
    return value


class ImportRowResult(dict):
    """Loose dict-like row report so we don't need a Pydantic model per row."""


async def _import_categories(rows: list[dict]) -> list[dict]:
    results: list[dict] = []
    now = datetime.now(timezone.utc)
    for i, row in enumerate(rows, start=2):
        try:
            payload = CategoryCreate(
                name=str(row.get("name") or "").strip(),
                description=str(row.get("description") or ""),
                icon=str(row.get("icon") or "Layers"),
                status=(str(row.get("status") or "active").lower() or "active"),  # type: ignore[arg-type]
            )
        except ValidationError as ve:
            results.append({"row": i, "status": "error", "detail": ve.errors()[0]["msg"]})
            continue
        row_id = str(row.get("id") or "").strip()
        if row_id:
            update = {**payload.model_dump(), "updated_at": now}
            res = await db.categories.update_one({"id": row_id}, {"$set": update})
            if res.matched_count:
                results.append({"row": i, "status": "updated", "id": row_id, "name": payload.name})
                continue
        # create — enforce name uniqueness
        clash = await db.categories.find_one({"name": payload.name})
        if clash:
            results.append({"row": i, "status": "skipped", "detail": "name already exists"})
            continue
        new_id = str(uuid.uuid4())
        await db.categories.insert_one(
            {**payload.model_dump(), "id": new_id, "icon_url": None, "created_at": now, "updated_at": now}
        )
        results.append({"row": i, "status": "created", "id": new_id, "name": payload.name})
    return results


async def _import_applications(rows: list[dict]) -> list[dict]:
    results: list[dict] = []
    now = datetime.now(timezone.utc)
    for i, row in enumerate(rows, start=2):
        try:
            payload = AppCreate(
                name=str(row.get("name") or "").strip(),
                description=str(row.get("description") or ""),
                category_id=str(row.get("category_id") or "").strip(),
                environment=(str(row.get("environment") or "Production")),  # type: ignore[arg-type]
                status=(str(row.get("status") or "Active")),  # type: ignore[arg-type]
                url=str(row.get("url") or "").strip(),
                icon=str(row.get("icon") or "AppWindow"),
            )
        except ValidationError as ve:
            results.append({"row": i, "status": "error", "detail": ve.errors()[0]["msg"]})
            continue
        if not await db.categories.find_one({"id": payload.category_id}, {"id": 1}):
            results.append({"row": i, "status": "error", "detail": "unknown category_id"})
            continue
        row_id = str(row.get("id") or "").strip()
        if row_id:
            update = {**payload.model_dump(), "updated_at": now}
            res = await db.apps.update_one({"id": row_id}, {"$set": update})
            if res.matched_count:
                results.append({"row": i, "status": "updated", "id": row_id, "name": payload.name})
                continue
        new_id = str(uuid.uuid4())
        await db.apps.insert_one(
            {
                **payload.model_dump(),
                "id": new_id,
                "category_name": "",
                "usage_count": 0,
                "favorite_count": 0,
                "created_at": now,
                "updated_at": now,
            }
        )
        results.append({"row": i, "status": "created", "id": new_id, "name": payload.name})
    return results


async def _import_servers(rows: list[dict]) -> list[dict]:
    results: list[dict] = []
    now = datetime.now(timezone.utc)
    for i, row in enumerate(rows, start=2):
        base: dict[str, Any] = {
            "name": str(row.get("name") or "").strip(),
            "hostname": str(row.get("hostname") or ""),
            "ip_address": str(row.get("ip_address") or ""),
            "vm_name": str(row.get("vm_name") or ""),
            "os": str(row.get("os") or ""),
            "os_version": str(row.get("os_version") or ""),
            "server_type": str(row.get("server_type") or ""),
            "environment": str(row.get("environment") or "Production"),
            "location": str(row.get("location") or "DC"),
            "status": str(row.get("status") or "Active"),
            "cpu": str(row.get("cpu") or ""),
            "ram": str(row.get("ram") or ""),
            "storage": str(row.get("storage") or ""),
            "datacenter": str(row.get("datacenter") or ""),
            "cluster": str(row.get("cluster") or ""),
            "virtualization": str(row.get("virtualization") or ""),
            "description": str(row.get("description") or ""),
            "date_created": str(row.get("date_created") or ""),
            "date_decommissioned": str(row.get("date_decommissioned") or ""),
            "decommission_notes": str(row.get("decommission_notes") or ""),
        }
        try:
            ServerCreate(**{k: v for k, v in base.items() if k in ServerCreate.model_fields})
        except ValidationError as ve:
            results.append({"row": i, "status": "error", "detail": ve.errors()[0]["msg"]})
            continue
        row_id = str(row.get("id") or "").strip()
        if row_id:
            update = {**base, "updated_at": now}
            res = await db.servers.update_one({"id": row_id}, {"$set": update})
            if res.matched_count:
                results.append({"row": i, "status": "updated", "id": row_id, "name": base["name"]})
                continue
        new_id = str(uuid.uuid4())
        await db.servers.insert_one(
            {
                **base,
                "id": new_id,
                "application_ids": [],
                "pic_ids": [],
                "tickets": [],
                "created_at": now,
                "updated_at": now,
            }
        )
        results.append({"row": i, "status": "created", "id": new_id, "name": base["name"]})
    return results


async def _import_pics(rows: list[dict]) -> list[dict]:
    results: list[dict] = []
    now = datetime.now(timezone.utc)
    for i, row in enumerate(rows, start=2):
        raw_email = str(row.get("email") or "").strip()
        try:
            payload = PicCreate(
                name=str(row.get("name") or "").strip(),
                initials=str(row.get("initials") or "").strip(),
                employee_id=str(row.get("employee_id") or ""),
                email=(raw_email or ""),  # type: ignore[arg-type]
                phone=str(row.get("phone") or ""),
                department_id=str(row.get("department_id") or ""),
                position=str(row.get("position") or ""),
                status=(str(row.get("status") or "Active")),  # type: ignore[arg-type]
            )
        except ValidationError as ve:
            results.append({"row": i, "status": "error", "detail": ve.errors()[0]["msg"]})
            continue
        row_id = str(row.get("id") or "").strip()
        doc = {**payload.model_dump(), "server_ids": [], "standby_schedule": [], "updated_at": now}
        # PIC schema stores "department" name too — keep it in sync when possible.
        if payload.department_id:
            dep = await db.departments.find_one({"id": payload.department_id}, {"name": 1})
            doc["department"] = dep["name"] if dep else ""
        if row_id:
            res = await db.pics.update_one({"id": row_id}, {"$set": doc})
            if res.matched_count:
                results.append({"row": i, "status": "updated", "id": row_id, "name": payload.name})
                continue
        new_id = str(uuid.uuid4())
        await db.pics.insert_one({**doc, "id": new_id, "created_at": now})
        results.append({"row": i, "status": "created", "id": new_id, "name": payload.name})
    return results


IMPORTERS = {
    "categories": _import_categories,
    "applications": _import_applications,
    "servers": _import_servers,
    "pics": _import_pics,
}


@router.post("/imports/{entity}")
async def import_entity(entity: str, file: UploadFile, _: dict = Depends(require_admin)):
    """Parse the uploaded sheet in memory and upsert every row.

    Returns a per-row report ({row, status, id?, name?, detail?}) so admins
    can see exactly which lines created, updated, were skipped or errored.
    The uploaded file is closed immediately after reading — nothing persists
    to disk.
    """
    if entity not in IMPORTERS:
        raise HTTPException(status_code=404, detail="unknown entity")
    data = await _read_upload_bytes(file)
    rows = _rows_from_bytes(file.filename or "", data)
    if not rows:
        raise HTTPException(status_code=400, detail="no data rows detected")
    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=413, detail=f"too many rows (max {MAX_IMPORT_ROWS})")
    results = await IMPORTERS[entity](rows)
    summary = {
        "created": sum(1 for r in results if r.get("status") == "created"),
        "updated": sum(1 for r in results if r.get("status") == "updated"),
        "skipped": sum(1 for r in results if r.get("status") == "skipped"),
        "errors": sum(1 for r in results if r.get("status") == "error"),
    }
    return {"entity": entity, "rows": len(rows), "summary": summary, "results": results}
