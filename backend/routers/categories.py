"""App category management (RBAC access units) with hardened icon upload.

Security posture (2026-02):
- Icon upload rejects SVG entirely (SVG is active content and cannot be safely
  served under the same origin as authenticated cookies without a full sanitizer).
- Uploads are streamed with a hard byte cap so a client cannot exhaust memory,
  are validated against magic bytes and dimensions via Pillow, and are written
  atomically (tmp file + rename) so a crash mid-upload cannot leave a partial
  file at the served path.
"""

import io
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pymongo import ReturnDocument

from lib.auth import require_admin, require_user
from lib.db import db
from models.categories import AppCategory, CategoryCreate, CategoryUpdate

router = APIRouter()

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
# Image types we actively decode and re-serve. SVG is intentionally absent.
ALLOWED_ICON_TYPES: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
PIL_TO_EXT: dict[str, str] = {
    "PNG": ".png",
    "JPEG": ".jpg",
    "WEBP": ".webp",
}
MAX_ICON_BYTES = 2 * 1024 * 1024
MAX_ICON_DIMENSION = 2048  # generous cap; typical icons are <=512
UPLOAD_CHUNK = 64 * 1024


def _unique_name_query(name: str, exclude_id: str | None = None) -> dict:
    query = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    return query


def _remove_icon_files(category_id: str) -> None:
    """Remove any previously stored icon for this category (all extensions)."""
    for old in UPLOADS_DIR.glob(f"{category_id}.*"):
        try:
            old.unlink(missing_ok=True)
        except OSError:
            pass


async def _read_upload_bounded(file: UploadFile) -> bytes:
    """Stream the upload into memory with a hard byte cap.

    Reading in chunks lets us short-circuit before a 10 MB file exhausts the
    request buffer; the ``RequestSizeLimitMiddleware`` in server.py is a second
    line of defence for the whole request body.
    """
    buffer = io.BytesIO()
    total = 0
    while True:
        chunk = await file.read(UPLOAD_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_ICON_BYTES:
            raise HTTPException(status_code=413, detail="icon image must be 2 MB or smaller")
        buffer.write(chunk)
    return buffer.getvalue()


def _validate_image(data: bytes) -> str:
    """Return the canonical extension (.png/.jpg/.webp) for validated bytes.

    Raises HTTPException on any mismatch. Uses Pillow's magic-byte detection
    and a re-open through ``load()`` so a truncated or malformed payload
    fails fast instead of being served back to another user.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()  # cheap header check
        with Image.open(io.BytesIO(data)) as img:
            img.load()  # forces a full decode
            fmt = (img.format or "").upper()
            width, height = img.size
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=415, detail="uploaded file is not a valid image")

    ext = PIL_TO_EXT.get(fmt)
    if not ext:
        raise HTTPException(
            status_code=415, detail="unsupported image type — use PNG, JPEG, or WebP"
        )
    if width <= 0 or height <= 0 or width > MAX_ICON_DIMENSION or height > MAX_ICON_DIMENSION:
        raise HTTPException(
            status_code=422, detail=f"icon dimensions must be 1x1 to {MAX_ICON_DIMENSION}x{MAX_ICON_DIMENSION}"
        )
    return ext


def _atomic_write(target: Path, data: bytes) -> None:
    """Write ``data`` to ``target`` atomically with locked-down permissions."""
    UPLOADS_DIR.mkdir(exist_ok=True)
    tmp = target.with_suffix(target.suffix + f".{uuid.uuid4().hex}.tmp")
    with open(tmp, "wb") as fp:
        fp.write(data)
    try:
        os.chmod(tmp, 0o644)
    except OSError:
        pass
    os.replace(tmp, target)


@router.get("/categories", response_model=list[AppCategory])
async def list_categories(
    include_inactive: bool = False, user: dict = Depends(require_user)
):
    is_admin = user.get("role") == "administrator"
    query: dict = {} if (include_inactive and is_admin) else {"status": "active"}
    if not is_admin:
        # Normal users only ever see the categories assigned to them, so category
        # pills and filters never offer something the backend would refuse.
        query["id"] = {"$in": list(user.get("assigned_category_ids") or [])}
    docs = await db.categories.find(query).sort("name", 1).to_list(500)
    return [AppCategory(**d) for d in docs]


@router.post("/categories", response_model=AppCategory, status_code=201)
async def create_category(input: CategoryCreate, _: dict = Depends(require_admin)):
    name = input.name.strip()
    if await db.categories.find_one(_unique_name_query(name)):
        raise HTTPException(status_code=409, detail="a category with this name already exists")
    now = datetime.now(timezone.utc)
    doc = {
        **input.model_dump(),
        "name": name,
        "id": str(uuid.uuid4()),
        "icon_url": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.categories.insert_one(doc)
    return AppCategory(**doc)


@router.put("/categories/{category_id}", response_model=AppCategory)
async def update_category(category_id: str, input: CategoryUpdate, _: dict = Depends(require_admin)):
    target = await db.categories.find_one({"id": category_id})
    if not target:
        raise HTTPException(status_code=404, detail="category not found")
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="no fields to update")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if await db.categories.find_one(_unique_name_query(changes["name"], exclude_id=category_id)):
            raise HTTPException(status_code=409, detail="a category with this name already exists")
    changes["updated_at"] = datetime.now(timezone.utc)
    doc = await db.categories.find_one_and_update(
        {"id": category_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    return AppCategory(**doc)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, _: dict = Depends(require_admin)):
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=404, detail="category not found")
    used = await db.apps.count_documents({"category_id": category_id})
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"{used} application(s) still use this category — move or delete them first",
        )
    await db.categories.delete_one({"id": category_id})
    _remove_icon_files(category_id)
    return None


@router.post("/categories/{category_id}/icon", response_model=AppCategory)
async def upload_icon(category_id: str, file: UploadFile, _: dict = Depends(require_admin)):
    if not await db.categories.find_one({"id": category_id}):
        raise HTTPException(status_code=404, detail="category not found")

    # Reject SVG at the door — never trust the client-declared MIME.
    declared = (file.content_type or "").lower()
    if declared == "image/svg+xml" or (file.filename or "").lower().endswith(".svg"):
        raise HTTPException(
            status_code=415, detail="SVG icons are not supported — use PNG, JPEG, or WebP"
        )
    if declared and declared not in ALLOWED_ICON_TYPES:
        raise HTTPException(
            status_code=415, detail="unsupported image type — use PNG, JPEG, or WebP"
        )

    data = await _read_upload_bounded(file)
    ext = _validate_image(data)

    _remove_icon_files(category_id)
    _atomic_write(UPLOADS_DIR / f"{category_id}{ext}", data)

    doc = await db.categories.find_one_and_update(
        {"id": category_id},
        {
            "$set": {
                "icon_url": f"/api/uploads/{category_id}{ext}",
                "updated_at": datetime.now(timezone.utc),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return AppCategory(**doc)


@router.delete("/categories/{category_id}/icon", response_model=AppCategory)
async def remove_icon(category_id: str, _: dict = Depends(require_admin)):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="category not found")
    _remove_icon_files(category_id)
    updated = await db.categories.find_one_and_update(
        {"id": category_id},
        {"$set": {"icon_url": None, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return AppCategory(**updated)
