import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import SeoPage, SeoPageStatus, User
from app.routers.action_log import log_action
from app.schemas.seo import SeoPageCreate, SeoPageListResponse, SeoPageResponse, SeoPageUpdate

router = APIRouter()

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _validate_slug(slug: str) -> str:
    value = (slug or "").strip().lower()
    if not value or not SLUG_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Slug может содержать только латинские буквы, цифры и дефис",
        )
    return value


def _check_slug_unique(db: Session, slug: str, exclude_id: Optional[int] = None) -> None:
    query = db.query(SeoPage).filter(SeoPage.slug == slug)
    if exclude_id is not None:
        query = query.filter(SeoPage.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Страница с таким slug уже существует")


@router.get("", response_model=SeoPageListResponse)
async def list_seo_pages(
    q: Optional[str] = Query(None, max_length=255),
    status_filter: Optional[SeoPageStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("seo.access")),
):
    query = db.query(SeoPage)
    search = (q or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(SeoPage.title.ilike(like) | SeoPage.slug.ilike(like))
    if status_filter:
        query = query.filter(SeoPage.status == status_filter.value)
    total = query.count()
    items = query.order_by(SeoPage.updated_at.desc()).all()
    return {"total": total, "items": items}


@router.get("/{page_id}", response_model=SeoPageResponse)
async def get_seo_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("seo.access")),
):
    page = db.query(SeoPage).filter(SeoPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")
    return page


@router.post("", response_model=SeoPageResponse, status_code=status.HTTP_201_CREATED)
async def create_seo_page(
    payload: SeoPageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("seo.manage")),
):
    slug = _validate_slug(payload.slug)
    _check_slug_unique(db, slug)
    page = SeoPage(
        title=payload.title.strip(),
        slug=slug,
        status=payload.status.value,
        h1=payload.h1,
        content=payload.content,
        seo_title=payload.seo_title,
        seo_description=payload.seo_description,
        canonical=payload.canonical,
        robots=payload.robots,
        og_title=payload.og_title,
        og_description=payload.og_description,
        og_image=payload.og_image,
        author_id=current_user.id,
        published_at=datetime.now(timezone.utc) if payload.status == SeoPageStatus.PUBLISHED else None,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    log_action(db, current_user.id, "create", "seo_page", page.id, {"slug": page.slug})
    return page


@router.patch("/{page_id}", response_model=SeoPageResponse)
async def update_seo_page(
    page_id: int,
    payload: SeoPageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("seo.manage")),
):
    page = db.query(SeoPage).filter(SeoPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    data = payload.model_dump(exclude_unset=True)

    if "slug" in data and data["slug"] is not None:
        slug = _validate_slug(data["slug"])
        _check_slug_unique(db, slug, exclude_id=page.id)
        page.slug = slug

    if "title" in data and data["title"] is not None:
        page.title = data["title"].strip()

    if "status" in data and data["status"] is not None:
        new_status = data["status"]
        if new_status == SeoPageStatus.PUBLISHED and page.status != SeoPageStatus.PUBLISHED.value:
            page.published_at = datetime.now(timezone.utc)
        page.status = new_status.value if hasattr(new_status, "value") else new_status

    for field in (
        "h1",
        "content",
        "seo_title",
        "seo_description",
        "canonical",
        "robots",
        "og_title",
        "og_description",
        "og_image",
    ):
        if field in data:
            setattr(page, field, data[field])

    db.commit()
    db.refresh(page)
    log_action(db, current_user.id, "update", "seo_page", page.id, {"slug": page.slug})
    return page


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_seo_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("seo.manage")),
):
    page = db.query(SeoPage).filter(SeoPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")
    db.delete(page)
    db.commit()
    log_action(db, current_user.id, "delete", "seo_page", page_id, {"slug": page.slug})
