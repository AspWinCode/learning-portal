import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.auth import require_permission
from app.database import get_db
from app.models import MediaFile
from app.routers.action_log import log_action
from app.schemas.media import MediaFileResponse

router = APIRouter()

MEDIA_ROOT = Path(os.getenv("PUBLIC_SITE_OUTPUT_DIR", "/app/public_site")) / "uploads"
ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/svg+xml", "image/avif",
}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


def _ensure_dir() -> None:
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)


def _to_response(m: MediaFile) -> MediaFileResponse:
    name = m.uploaded_by.first_name + " " + m.uploaded_by.last_name if m.uploaded_by else None
    return MediaFileResponse(
        id=m.id,
        filename=m.filename,
        original_name=m.original_name,
        size=m.size,
        mime_type=m.mime_type,
        url=f"/api/v1/media/files/{m.filename}",
        created_at=m.created_at,
        uploaded_by_name=name,
    )


@router.get("/", response_model=List[MediaFileResponse])
def list_media(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.access")),
):
    files = (
        db.query(MediaFile)
        .options(joinedload(MediaFile.uploaded_by))
        .order_by(MediaFile.created_at.desc())
        .all()
    )
    return [_to_response(f) for f in files]


@router.post("/upload", response_model=MediaFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Тип файла не поддерживается: {file.content_type}",
        )

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой (максимум 10 МБ)",
        )

    ext = Path(file.filename or "file").suffix.lower() or ".jpg"
    unique_name = f"{uuid.uuid4().hex}{ext}"

    _ensure_dir()
    dest = MEDIA_ROOT / unique_name
    dest.write_bytes(data)

    record = MediaFile(
        filename=unique_name,
        original_name=file.filename or unique_name,
        size=len(data),
        mime_type=file.content_type,
        uploaded_by_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    db.refresh(record, ["uploaded_by"])

    log_action(db, current_user.id, "media_upload", f"Загружен файл: {file.filename}")
    return _to_response(record)


@router.get("/files/{filename}")
def serve_file(filename: str):
    _ensure_dir()
    # Sanitise: no path traversal
    safe_name = Path(filename).name
    path = MEDIA_ROOT / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(str(path))


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    record = db.get(MediaFile, media_id)
    if not record:
        raise HTTPException(status_code=404, detail="Файл не найден")

    path = MEDIA_ROOT / record.filename
    if path.exists():
        path.unlink()

    log_action(db, current_user.id, "media_delete", f"Удалён файл: {record.original_name}")
    db.delete(record)
    db.commit()
