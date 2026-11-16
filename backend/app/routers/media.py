"""
Media router — image/audio upload for CMS pages, rich-text editors (notes, Kodex theory)
and ТехноЛаб lecture attachments. Upload requires seo.manage, kodex.manage or
technolab.manage; serving files is public (no auth). Files stored under DISK_STORAGE_ROOT/media/.
"""
import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_any_permission
from app.database import get_db
from app.models import User
from app.routers.action_log import log_action

router = APIRouter()

_DISK_ROOT = Path(os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")).resolve()
MEDIA_ROOT = _DISK_ROOT / "media"
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_AUDIO_BYTES = 60 * 1024 * 1024  # 60 MB
MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_DOC_BYTES = 100 * 1024 * 1024  # 100 MB
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg"}
VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
DOC_TYPES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv", "application/rtf", "application/zip", "application/x-rar-compressed",
    "application/vnd.rar", "application/x-7z-compressed", "application/octet-stream",
}
ALLOWED_TYPES = IMAGE_TYPES | AUDIO_TYPES | VIDEO_TYPES | DOC_TYPES
EXT_MAP = {
    "jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "gif": "gif", "svg": "svg",
    "wav": "wav", "mp3": "mp3", "ogg": "ogg",
    "mp4": "mp4", "mov": "mov", "webm": "webm",
    "pdf": "pdf", "doc": "doc", "docx": "docx", "ppt": "ppt", "pptx": "pptx",
    "xls": "xls", "xlsx": "xlsx", "txt": "txt", "csv": "csv", "rtf": "rtf",
    "zip": "zip", "rar": "rar", "7z": "7z",
}
CONTENT_TYPE_MAP = {
    "jpg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "gif": "image/gif", "svg": "image/svg+xml",
    "wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "pdf": "application/pdf", "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "txt": "text/plain", "csv": "text/csv", "rtf": "application/rtf",
    "zip": "application/zip", "rar": "application/x-rar-compressed", "7z": "application/x-7z-compressed",
}
DEFAULT_EXT_BY_CONTENT_TYPE = {v: k for k, v in CONTENT_TYPE_MAP.items()}
DEFAULT_EXT_BY_CONTENT_TYPE["audio/x-wav"] = "wav"

PORTAL_BASE_URL = os.getenv("PORTAL_BASE_URL", "https://tirskix.space")


class MediaUploadOut(BaseModel):
    url: str
    key: str


@router.post("/upload", response_model=MediaUploadOut)
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_permission("seo.manage", "kodex.manage", "technolab.manage", "codelab.manage", "media.upload")
    ),
):
    content_type = file.content_type or "application/octet-stream"
    raw_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if content_type not in ALLOWED_TYPES:
        if not raw_ext:
            raise HTTPException(status_code=415, detail=f"Неподдерживаемый тип файла: {content_type}")

    if content_type in VIDEO_TYPES:
        max_bytes = MAX_VIDEO_BYTES
    elif content_type in AUDIO_TYPES:
        max_bytes = MAX_AUDIO_BYTES
    elif content_type in DOC_TYPES or raw_ext not in {"jpg", "jpeg", "png", "webp", "gif", "svg"}:
        max_bytes = MAX_DOC_BYTES
    else:
        max_bytes = MAX_IMAGE_BYTES
    data = await file.read(max_bytes + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Файл слишком большой (макс. {max_bytes // (1024 * 1024)} МБ)")

    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    ext = EXT_MAP.get(raw_ext) or raw_ext or DEFAULT_EXT_BY_CONTENT_TYPE.get(content_type, "bin")
    key = f"{uuid4().hex}.{ext}"

    dest = (MEDIA_ROOT / key).resolve()
    if MEDIA_ROOT not in dest.parents:
        raise HTTPException(status_code=500, detail="Ошибка хранилища")

    dest.write_bytes(data)
    log_action(
        db, current_user.id, "upload", "media_file", None,
        {"key": key, "filename": file.filename, "content_type": file.content_type, "size_bytes": len(data)},
    )
    return MediaUploadOut(url=f"{PORTAL_BASE_URL}/api/v1/media/files/{key}", key=key)


@router.get("/files/{key}")
async def serve_media(key: str):
    if "/" in key or "\\" in key or ".." in key:
        raise HTTPException(status_code=400, detail="Неверный ключ")

    path = (MEDIA_ROOT / key).resolve()
    if MEDIA_ROOT not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")

    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    ct = CONTENT_TYPE_MAP.get(ext, "application/octet-stream")

    return FileResponse(path, media_type=ct, headers={"Cache-Control": "public, max-age=31536000, immutable"})
