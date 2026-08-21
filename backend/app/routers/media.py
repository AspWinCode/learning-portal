"""
Media router — image upload for CMS pages and rich-text editors (notes, Kodex theory).
Upload requires seo.manage or kodex.manage; serving files is public (no auth).
Files stored under DISK_STORAGE_ROOT/media/.
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
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
EXT_MAP = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "gif": "gif", "svg": "svg"}

PORTAL_BASE_URL = os.getenv("PORTAL_BASE_URL", "https://tirskix.space")


class MediaUploadOut(BaseModel):
    url: str
    key: str


@router.post("/upload", response_model=MediaUploadOut)
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(require_any_permission("seo.manage", "kodex.manage")),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Неподдерживаемый тип файла: {file.content_type}. Разрешены: JPEG, PNG, WebP, GIF, SVG")

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 10 МБ)")

    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    raw_ext = (file.filename or "image").rsplit(".", 1)[-1].lower()
    ext = EXT_MAP.get(raw_ext, "jpg")
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
    ct = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp",
          "gif": "image/gif", "svg": "image/svg+xml"}.get(ext, "application/octet-stream")

    return FileResponse(path, media_type=ct, headers={"Cache-Control": "public, max-age=31536000, immutable"})
