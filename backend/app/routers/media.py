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

from app.auth import require_any_permission
from app.models import User

router = APIRouter()

_DISK_ROOT = Path(os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")).resolve()
MEDIA_ROOT = _DISK_ROOT / "media"
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_AUDIO_BYTES = 60 * 1024 * 1024  # 60 MB
MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_DOC_BYTES = 20 * 1024 * 1024  # 20 MB
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg"}
VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
DOC_TYPES = {"application/pdf"}
ALLOWED_TYPES = IMAGE_TYPES | AUDIO_TYPES | VIDEO_TYPES | DOC_TYPES
EXT_MAP = {
    "jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "gif": "gif", "svg": "svg",
    "wav": "wav", "mp3": "mp3", "ogg": "ogg",
    "mp4": "mp4", "mov": "mov", "webm": "webm",
    "pdf": "pdf",
}
CONTENT_TYPE_MAP = {
    "jpg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "gif": "image/gif", "svg": "image/svg+xml",
    "wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "pdf": "application/pdf",
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
    current_user: User = Depends(require_any_permission("seo.manage", "kodex.manage", "technolab.manage")),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Неподдерживаемый тип файла: {file.content_type}. Разрешены: JPEG, PNG, WebP, GIF, SVG, WAV, MP3, OGG, MP4, MOV, WebM, PDF")

    if file.content_type in VIDEO_TYPES:
        max_bytes = MAX_VIDEO_BYTES
    elif file.content_type in AUDIO_TYPES:
        max_bytes = MAX_AUDIO_BYTES
    elif file.content_type in DOC_TYPES:
        max_bytes = MAX_DOC_BYTES
    else:
        max_bytes = MAX_IMAGE_BYTES
    data = await file.read(max_bytes + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Файл слишком большой (макс. {max_bytes // (1024 * 1024)} МБ)")

    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    raw_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    ext = EXT_MAP.get(raw_ext) or DEFAULT_EXT_BY_CONTENT_TYPE.get(file.content_type, "bin")
    key = f"{uuid4().hex}.{ext}"

    dest = (MEDIA_ROOT / key).resolve()
    if MEDIA_ROOT not in dest.parents:
        raise HTTPException(status_code=500, detail="Ошибка хранилища")

    dest.write_bytes(data)
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
