import os
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.models import Transcription, TranscriptionStatus, User
from app.schemas.transcription import TranscriptionResponse, TranscriptionsListResponse
from app.database import get_db
from app.services.transcription_service import TRANSCRIPTION_STORAGE_ROOT, ensure_storage_root

router = APIRouter()

MAX_UPLOAD_BYTES = int(os.getenv("TRANSCRIPTION_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mp4", ".aac"}


def _safe_name(value: str, fallback: str = "audio") -> str:
    name = re.sub(r"[\r\n\t]+", " ", str(value or "")).strip()
    name = name.replace("/", " ").replace("\\", " ").strip()
    return (name or fallback)[:255]


def _to_response(row: Transcription) -> TranscriptionResponse:
    return TranscriptionResponse(
        id=row.id,
        filename=row.filename,
        content_type=row.content_type,
        size_bytes=int(row.size_bytes or 0),
        status=row.status.value if isinstance(row.status, TranscriptionStatus) else row.status,
        language=row.language,
        text=row.text,
        error_message=row.error_message,
        owner_id=row.owner_id,
        owner_name=row.owner.full_name if row.owner else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/items", response_model=TranscriptionsListResponse)
async def list_transcriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("transcription.access")),
):
    rows = (
        db.query(Transcription)
        .options(joinedload(Transcription.owner))
        .order_by(Transcription.created_at.desc())
        .limit(200)
        .all()
    )
    return TranscriptionsListResponse(items=[_to_response(row) for row in rows])


@router.get("/items/{transcription_id}", response_model=TranscriptionResponse)
async def get_transcription(
    transcription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("transcription.access")),
):
    row = (
        db.query(Transcription)
        .options(joinedload(Transcription.owner))
        .filter(Transcription.id == transcription_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return _to_response(row)


@router.post("/items", response_model=TranscriptionResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("transcription.access")),
):
    filename = _safe_name(file.filename or "audio")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {extension or 'unknown'}")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Max upload size is {MAX_UPLOAD_BYTES} bytes")

    ensure_storage_root()
    storage_key = f"{uuid4().hex}{extension}"
    path = (TRANSCRIPTION_STORAGE_ROOT / storage_key).resolve()
    if TRANSCRIPTION_STORAGE_ROOT not in path.parents:
        raise HTTPException(status_code=500, detail="Invalid storage path")
    path.write_bytes(data)

    row = Transcription(
        filename=filename,
        storage_key=storage_key,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        status=TranscriptionStatus.PENDING,
        owner_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["owner"])

    from app.background_tasks import task_transcribe_audio

    task_transcribe_audio.send(row.id)

    return _to_response(row)


@router.delete("/items/{transcription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transcription(
    transcription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("transcription.access")),
):
    row = db.query(Transcription).filter(Transcription.id == transcription_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Transcription not found")
    audio_path = (TRANSCRIPTION_STORAGE_ROOT / row.storage_key).resolve()
    if TRANSCRIPTION_STORAGE_ROOT in audio_path.parents and audio_path.exists():
        audio_path.unlink()
    db.delete(row)
    db.commit()
