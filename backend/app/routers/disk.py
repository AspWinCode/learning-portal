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
from app.models import DiskFolderAccess, DiskItem, User
from app.schemas.disk import (
    DiskAccessGrantCreate,
    DiskAccessGrantResponse,
    DiskFolderCreate,
    DiskItemResponse,
    DiskItemsResponse,
    DiskItemUpdate,
)

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


def _build_breadcrumbs(db: Session, parent_id: Optional[int], user: User) -> List[DiskItemResponse]:
    # Не раскрываем названия предков выше точки, где у пользователя есть грант.
    cutoff_id = None if _has_disk_bypass(user) else _find_granting_ancestor(db, user, parent_id) if parent_id else None
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
        if cutoff_id is not None and item.id == cutoff_id:
            break
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


def _has_disk_bypass(user: User) -> bool:
    """disk.manage обходит ACL целиком — как у admin/owner сегодня."""
    return auth.has_permission(user, "disk.manage")


def _has_direct_grant(db: Session, user: User, folder_id: int) -> bool:
    effective_role = auth.resolve_effective_role(user).value
    return (
        db.query(DiskFolderAccess.id)
        .filter(
            DiskFolderAccess.folder_id == folder_id,
            DiskFolderAccess.can_view.is_(True),
            or_(DiskFolderAccess.user_id == user.id, DiskFolderAccess.role == effective_role),
        )
        .first()
        is not None
    )


def _find_granting_ancestor(db: Session, user: User, item_id: int) -> Optional[int]:
    """Возвращает id папки на уровне item_id или выше, где есть прямой ACL-грант
    для пользователя. None — доступа нет ни на одном уровне."""
    current_id: Optional[int] = item_id
    seen: set[int] = set()
    while current_id is not None:
        if current_id in seen:
            break
        seen.add(current_id)
        if _has_direct_grant(db, user, current_id):
            return current_id
        parent = db.query(DiskItem.parent_id).filter(DiskItem.id == current_id).first()
        current_id = parent[0] if parent else None
    return None


def _ensure_can_view_item(db: Session, user: User, item: DiskItem) -> None:
    if _has_disk_bypass(user):
        return
    if _find_granting_ancestor(db, user, item.id) is None:
        raise HTTPException(status_code=404, detail="Disk item not found")


def _ensure_can_view_folder(db: Session, user: User, folder_id: Optional[int]) -> None:
    """folder_id=None — корень диска: у него нет ACL-записи, в корне просматриваются
    только элементы, явно выданные пользователю (см. list_disk_items)."""
    if folder_id is None or _has_disk_bypass(user):
        return
    if _find_granting_ancestor(db, user, folder_id) is None:
        raise HTTPException(status_code=404, detail="Disk item not found")


@router.get("/items", response_model=DiskItemsResponse)
async def list_disk_items(
    parent_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.access")),
):
    if parent_id is not None:
        _assert_folder(db, parent_id)
    _ensure_can_view_folder(db, current_user, parent_id)
    bypass = _has_disk_bypass(current_user)

    q = db.query(DiskItem).options(joinedload(DiskItem.owner)).filter(DiskItem.deleted_at.is_(None))
    search_value = (search or "").strip()
    if search_value:
        like = f"%{search_value}%"
        q = q.filter(or_(DiskItem.name.ilike(like), DiskItem.content_type.ilike(like)))
    elif parent_id is None and not bypass:
        # Корень диска для ограниченного пользователя: только явно выданные ему
        # папки/файлы (у корня самого по себе ACL-записи нет, наследовать не от кого).
        granted_ids = {
            row[0]
            for row in db.query(DiskFolderAccess.folder_id)
            .filter(
                DiskFolderAccess.can_view.is_(True),
                or_(
                    DiskFolderAccess.user_id == current_user.id,
                    DiskFolderAccess.role == auth.resolve_effective_role(current_user).value,
                ),
            )
            .all()
        }
        q = q.filter(DiskItem.id.in_(granted_ids)) if granted_ids else q.filter(False)
    else:
        q = q.filter(DiskItem.parent_id == parent_id)
    rows = q.order_by(DiskItem.item_type.asc(), DiskItem.name.asc(), DiskItem.created_at.desc()).all()

    if search_value and not bypass:
        rows = [item for item in rows if _find_granting_ancestor(db, current_user, item.id) is not None]

    return DiskItemsResponse(
        items=[_item_to_response(item) for item in rows],
        breadcrumbs=[] if search_value else _build_breadcrumbs(db, parent_id, current_user),
    )


@router.post("/folders", response_model=DiskItemResponse, status_code=status.HTTP_201_CREATED)
async def create_disk_folder(
    payload: DiskFolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.manage")),
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
    current_user: User = Depends(auth.require_permission("disk.manage")),
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
    current_user: User = Depends(auth.require_permission("disk.manage")),
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
    inline: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.access")),
):
    item = _get_active_item(db, item_id)
    _ensure_can_view_item(db, current_user, item)
    if item.item_type != "file" or not item.storage_key:
        raise HTTPException(status_code=404, detail="File not found")
    path = (DISK_STORAGE_ROOT / item.storage_key).resolve()
    if DISK_STORAGE_ROOT not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Stored file is missing")
    encoded_name = quote(item.name)
    disposition = "inline" if inline else "attachment"
    return FileResponse(
        path,
        media_type=item.content_type or "application/octet-stream",
        filename=item.name,
        headers={"Content-Disposition": f'{disposition}; filename="{encoded_name}"; filename*=UTF-8\'\'{encoded_name}'},
    )


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_disk_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.manage")),
):
    item = _get_active_item(db, item_id)
    _soft_delete_tree(db, item, datetime.now(timezone.utc))
    db.commit()
    return None


@router.get("/items/{item_id}/access", response_model=List[DiskAccessGrantResponse])
async def list_disk_folder_access(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.manage_access")),
):
    folder = _get_active_item(db, item_id)
    if folder.item_type != "folder":
        raise HTTPException(status_code=400, detail="Access grants apply to folders only")
    rows = (
        db.query(DiskFolderAccess)
        .options(joinedload(DiskFolderAccess.user))
        .filter(DiskFolderAccess.folder_id == folder.id)
        .order_by(DiskFolderAccess.created_at.desc())
        .all()
    )
    return [
        DiskAccessGrantResponse(
            id=row.id,
            folder_id=row.folder_id,
            user_id=row.user_id,
            user_name=row.user.full_name if row.user else None,
            role=row.role,
            can_view=row.can_view,
            created_by_id=row.created_by_id,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/items/{item_id}/access", response_model=DiskAccessGrantResponse, status_code=status.HTTP_201_CREATED)
async def grant_disk_folder_access(
    item_id: int,
    payload: DiskAccessGrantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.manage_access")),
):
    folder = _get_active_item(db, item_id)
    if folder.item_type != "folder":
        raise HTTPException(status_code=400, detail="Access grants apply to folders only")
    if not payload.user_id and not payload.role:
        raise HTTPException(status_code=400, detail="Specify either user_id or role")
    if payload.user_id and payload.role:
        raise HTTPException(status_code=400, detail="Specify only one of user_id or role")
    if payload.user_id:
        grantee = db.query(User).filter(User.id == payload.user_id).first()
        if not grantee:
            raise HTTPException(status_code=404, detail="User not found")
    row = DiskFolderAccess(
        folder_id=folder.id,
        user_id=payload.user_id,
        role=payload.role,
        can_view=True,
        created_by_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["user"])
    return DiskAccessGrantResponse(
        id=row.id,
        folder_id=row.folder_id,
        user_id=row.user_id,
        user_name=row.user.full_name if row.user else None,
        role=row.role,
        can_view=row.can_view,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
    )


@router.delete("/access/{access_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_disk_folder_access(
    access_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("disk.manage_access")),
):
    row = db.query(DiskFolderAccess).filter(DiskFolderAccess.id == access_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Access grant not found")
    db.delete(row)
    db.commit()
    return None
