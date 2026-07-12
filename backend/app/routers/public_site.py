from fastapi import APIRouter, BackgroundTasks, Depends

from app.auth import require_permission
from app.models import User
from app.schemas.public_site import PublishResponse

router = APIRouter()


def _run_generate() -> None:
    from app.public_site.generator import generate_site
    generate_site()


@router.post("/publish", response_model=PublishResponse, status_code=202)
def publish_site(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_permission("seo.manage")),
):
    """Trigger static site generation. Runs as a FastAPI background task."""
    background_tasks.add_task(_run_generate)
    return PublishResponse(status="queued", message="Генерация сайта запущена")


@router.get("/status", response_model=PublishResponse)
def site_status(
    current_user: User = Depends(require_permission("seo.access")),
):
    """Return whether the output directory exists and its mtime."""
    import os
    from app.public_site.generator import OUTPUT_DIR

    index = OUTPUT_DIR / "index.html"
    if index.exists():
        mtime = os.path.getmtime(index)
        from datetime import datetime
        built_at = datetime.fromtimestamp(mtime).isoformat()
        return PublishResponse(status="published", message=f"Последняя публикация: {built_at}", built_at=built_at)
    return PublishResponse(status="never", message="Сайт ещё не публиковался")
