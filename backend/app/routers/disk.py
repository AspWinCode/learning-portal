import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import DiskItem, User
from app.schemas.disk import DiskFolderCreate, DiskItemResponse, DiskItemsResponse, DiskItemUpdate

router = APIRouter()

DISK_STORAGE_ROOT = Path(os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")).resolve()
MAX_UPLOAD_BYTES = int(os.getenv("DISK_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))


def _ensure_storage_root() -> None:
    DISK_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_name(value: str, fallback: str = "Без названия") -> str:
    name = re.sub(r"[\r\n\t]+", " ", str(value or "")).strip()
    name = name.replace("/", " ").replace("\\", " ").strip()
    return (name or fallback)[:255]


def _item_to_response(item: DiskItem) -> DiskItemResponse:
    return DiskItemResponse(
        id=item.id,
        name=item.name,
        item_type=item.item_type,
        parent_id=item.parent_id,
        content_type=item.content_type,
        size_bytes=int(item.size_bytes or 0),
        owner_id=item.owner_id,
        owner_name=item.owner.full_name if item.owner else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _get_active_item(db: Session, item_id: int) -> DiskItem:
    item = (
        db.query(DiskItem)
        .options(joinedload(DiskItem.owner))
        .filter(DiskItem.id == item_id, DiskItem.deleted_at.is_(None))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Disk item not found")
    return item


def _assert_folder(db: Session, folder_id: Optional[int]) -> Optional[DiskItem]:
    if folder_id is None:
        return None
    folder = _get_active_item(db, folder_id)
    if folder.item_type != "folder":
        raise HTTPException(status_code=400, detail="Parent must be a folder")
    return folder


def _build_breadcrumbs(db: Session, parent_id: Optional[int]) -> List[DiskItemResponse]:
    chain: List[DiskItem] = []
    current_id = parent_id
    seen: set[int] = set()
    while current_id is not None:
        if current_id in seen:
            break
        seen.add(current_id)
        item = _get_active_item(db, current_id)
        if item.item_type != "folder":
            break
        chain.append(item)
        current_id = item.parent_id
    return [_item_to_response(item) for item in reversed(chain)]


def _has_descendant(db: Session, root_id: int, possible_child_id: int) -> bool:
    stack = [root_id]
    seen: set[int] = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        children = db.query(DiskItem.id).filter(
            DiskItem.parent_id == current,
            DiskItem.deleted_at.is_(None),
        ).all()
        for child in children:
            child_id = int(child[0])
            if child_id == possible_child_id:
                return True
            stack.append(child_id)
    return False


def _soft_delete_tree(db: Session, item: DiskItem, deleted_at: datetime) -> None:
    item.deleted_at = deleted_at
    children = db.query(DiskItem).filter(DiskItem.parent_id == item.id, DiskItem.deleted_at.is_(None)).all()
    for child in children:
        _soft_delete_tree(db, child, deleted_at)


@router.get("/items", response_model=DiskItemsResponse)
async def list_disk_items(
    parent_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    if parent_id is not None:
        _assert_folder(db, parent_id)

    q = db.query(DiskItem).options(joinedload(DiskItem.owner)).filter(DiskItem.deleted_at.is_(None))
    search_value = (search or "").strip()
    if search_value:
        like = f"%{search_value}%"
        q = q.filter(or_(DiskItem.name.ilike(like), DiskItem.content_type.ilike(like)))
    else:
        q = q.filter(DiskItem.parent_id == parent_id)
    rows = q.order_by(DiskItem.item_type.asc(), DiskItem.name.asc(), DiskItem.created_at.desc()).all()
    return DiskItemsResponse(
        items=[_item_to_response(item) for item in rows],
        breadcrumbs=[] if search_value else _build_breadcrumbs(db, parent_id),
    )


@router.post("/folders", response_model=DiskItemResponse, status_code=status.HTTP_201_CREATED)
async def create_disk_folder(
    payload: DiskFolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    parent = _assert_folder(db, payload.parent_id)
    row = DiskItem(
        name=_safe_name(payload.name, "Новая папка"),
        item_type="folder",
        parent_id=parent.id if parent else None,
        owner_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["owner"])
    return _item_to_response(row)


@router.post("/files", response_model=DiskItemResponse, status_code=status.HTTP_201_CREATED)
async def upload_disk_file(
    parent_id: Optional[int] = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    parent = _assert_folder(db, parent_id)
    filename = _safe_name(file.filename or "file", "file")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Max upload size is {MAX_UPLOAD_BYTES} bytes")
    _ensure_storage_root()
    storage_key = f"{uuid4().hex}_{filename}"
    path = (DISK_STORAGE_ROOT / storage_key).resolve()
    if DISK_STORAGE_ROOT not in path.parents and path != DISK_STORAGE_ROOT:
        raise HTTPException(status_code=500, detail="Invalid storage path")
    path.write_bytes(data)
    row = DiskItem(
        name=filename,
        item_type="file",
        parent_id=parent.id if parent else None,
        storage_key=storage_key,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        owner_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["owner"])
    return _item_to_response(row)


@router.patch("/items/{item_id}", response_model=DiskItemResponse)
async def update_disk_item(
    item_id: int,
    payload: DiskItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    item = _get_active_item(db, item_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        item.name = _safe_name(data["name"], item.name)
    if "parent_id" in data:
        new_parent_id = data["parent_id"]
        parent = _assert_folder(db, new_parent_id)
        if parent and parent.id == item.id:
            raise HTTPException(status_code=400, detail="Item cannot be moved into itself")
        if parent and item.item_type == "folder" and _has_descendant(db, item.id, parent.id):
            raise HTTPException(status_code=400, detail="Folder cannot be moved into its descendant")
        item.parent_id = parent.id if parent else None
    db.commit()
    db.refresh(item)
    db.refresh(item, ["owner"])
    return _item_to_response(item)


@router.get("/files/{item_id}/download")
async def download_disk_file(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    item = _get_active_item(db, item_id)
    if item.item_type != "file" or not item.storage_key:
        raise HTTPException(status_code=404, detail="File not found")
    path = (DISK_STORAGE_ROOT / item.storage_key).resolve()
    if DISK_STORAGE_ROOT not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Stored file is missing")
    encoded_name = quote(item.name)
    return FileResponse(
        path,
        media_type=item.content_type or "application/octet-stream",
        filename=item.name,
        headers={"Content-Disposition": f'attachment; filename="{encoded_name}"; filename*=UTF-8\'\'{encoded_name}'},
    )


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_disk_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_workspace.access")),
):
    item = _get_active_item(db, item_id)
    _soft_delete_tree(db, item, datetime.now(timezone.utc))
    db.commit()
    return None
