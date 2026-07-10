import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import AppSetting, Note, User
from app.schemas.notes import NoteCreate, NoteResponse, NoteUpdate

router = APIRouter()

NOTES_ENABLED_ROLES_KEY = "notes_enabled_roles"
DEFAULT_ENABLED_ROLES = ["owner"]


def _get_enabled_roles(db: Session) -> list[str]:
    setting = db.query(AppSetting).filter(AppSetting.key == NOTES_ENABLED_ROLES_KEY).first()
    if not setting or not setting.value:
        return DEFAULT_ENABLED_ROLES
    try:
        roles = json.loads(setting.value)
        if "owner" not in roles:
            roles = ["owner"] + roles
        return roles
    except (ValueError, TypeError):
        return DEFAULT_ENABLED_ROLES


def _check_notes_access(user: User, db: Session) -> None:
    effective_role = auth.resolve_effective_role(user).value
    if effective_role in ("owner", "admin"):
        return
    enabled_roles = _get_enabled_roles(db)
    if effective_role not in enabled_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заметки недоступны для вашей роли",
        )


@router.get("", response_model=List[NoteResponse])
async def list_notes(
    q: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _check_notes_access(current_user, db)
    query = db.query(Note).filter(Note.user_id == current_user.id)
    search = (q or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            Note.title.ilike(like) | Note.content.ilike(like)
        )
    return query.order_by(Note.updated_at.desc()).all()


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _check_notes_access(current_user, db)
    note = Note(
        user_id=current_user.id,
        title=(payload.title or "Без названия").strip()[:512] or "Без названия",
        content=payload.content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _check_notes_access(current_user, db)
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        note.title = (data["title"].strip()[:512]) or "Без названия"
    if "content" in data:
        note.content = data["content"]
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _check_notes_access(current_user, db)
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    db.delete(note)
    db.commit()
