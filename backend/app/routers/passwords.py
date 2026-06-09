from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import PasswordEntry, User
from app.schemas.passwords import (
    PasswordEntryCreate,
    PasswordEntryResponse,
    PasswordEntryUpdate,
    PasswordSecretResponse,
)
from app.services.password_vault_crypto import decrypt_password, encrypt_password

router = APIRouter()


def _clean_text(value: Optional[str], max_len: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).replace("\r", " ").replace("\n", " ").strip()
    if max_len is not None:
        cleaned = cleaned[:max_len]
    return cleaned or None


def _to_response(row: PasswordEntry) -> PasswordEntryResponse:
    return PasswordEntryResponse(
        id=row.id,
        name=row.name,
        website_url=row.website_url,
        login=row.login,
        note=row.note,
        owner_id=row.owner_id,
        owner_name=row.owner.full_name if row.owner else None,
        has_password=bool(row.encrypted_password),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_entry(db: Session, entry_id: int) -> PasswordEntry:
    row = (
        db.query(PasswordEntry)
        .options(joinedload(PasswordEntry.owner))
        .filter(PasswordEntry.id == entry_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Password entry not found")
    return row


@router.get("", response_model=List[PasswordEntryResponse])
async def list_password_entries(
    q: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("passwords.access")),
):
    query = db.query(PasswordEntry).options(joinedload(PasswordEntry.owner))
    search = (q or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                PasswordEntry.name.ilike(like),
                PasswordEntry.website_url.ilike(like),
                PasswordEntry.login.ilike(like),
                PasswordEntry.note.ilike(like),
            )
        )
    rows = query.order_by(PasswordEntry.name.asc(), PasswordEntry.created_at.desc()).all()
    return [_to_response(row) for row in rows]


@router.post("", response_model=PasswordEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_password_entry(
    payload: PasswordEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("passwords.manage")),
):
    row = PasswordEntry(
        name=_clean_text(payload.name, 255) or "Untitled",
        website_url=_clean_text(payload.website_url, 2048),
        login=_clean_text(payload.login, 255),
        encrypted_password=encrypt_password(payload.password),
        note=payload.note.strip() if payload.note else None,
        owner_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["owner"])
    return _to_response(row)


@router.patch("/{entry_id}", response_model=PasswordEntryResponse)
async def update_password_entry(
    entry_id: int,
    payload: PasswordEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("passwords.manage")),
):
    row = _get_entry(db, entry_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        row.name = _clean_text(data["name"], 255) or row.name
    if "website_url" in data:
        row.website_url = _clean_text(data["website_url"], 2048)
    if "login" in data:
        row.login = _clean_text(data["login"], 255)
    if "password" in data and data["password"] is not None:
        row.encrypted_password = encrypt_password(data["password"])
    if "note" in data:
        row.note = data["note"].strip() if data["note"] else None
    db.commit()
    db.refresh(row)
    db.refresh(row, ["owner"])
    return _to_response(row)


@router.get("/{entry_id}/secret", response_model=PasswordSecretResponse)
async def reveal_password_secret(
    entry_id: int,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    if not (auth.has_permission(current_user, "passwords.reveal") or auth.has_permission(current_user, "passwords.manage")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    row = _get_entry(db, entry_id)
    return PasswordSecretResponse(id=row.id, password=decrypt_password(row.encrypted_password))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_password_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("passwords.manage")),
):
    row = _get_entry(db, entry_id)
    db.delete(row)
    db.commit()
    return None
