"""
CMS router — manages landing page content (home, faq, o-nas, etc.).
Content is stored as JSON blobs per page slug.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CmsPage
from app.auth import require_permission
from app.models import User

router = APIRouter()

# ── Known pages with their labels ──────────────────────────────────────────
KNOWN_PAGES = {
    "home":    "Главная страница",
    "faq":     "FAQ — Частые вопросы",
    "o-nas":   "О нас",
    "kontakty": "Контакты",
}


class CmsPageOut(BaseModel):
    slug: str
    label: str
    content: Any
    updated_at: datetime | None

    class Config:
        from_attributes = True


class CmsPagePut(BaseModel):
    content: Any


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_or_create(db: Session, slug: str) -> CmsPage:
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        label = KNOWN_PAGES.get(slug, slug)
        page = CmsPage(slug=slug, label=label, content={})
        db.add(page)
        db.commit()
        db.refresh(page)
    return page


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/pages", response_model=list[CmsPageOut])
def list_pages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    """Return all known pages (existing + placeholders for not-yet-created)."""
    existing = {p.slug: p for p in db.query(CmsPage).all()}
    result = []
    for slug, label in KNOWN_PAGES.items():
        if slug in existing:
            result.append(existing[slug])
        else:
            result.append(CmsPage(slug=slug, label=label, content={}, updated_at=None))
    return result


@router.get("/pages/{slug}", response_model=CmsPageOut)
def get_page(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        label = KNOWN_PAGES.get(slug, slug)
        return CmsPage(slug=slug, label=label, content={}, updated_at=None)
    return page


@router.put("/pages/{slug}", response_model=CmsPageOut)
def upsert_page(
    slug: str,
    payload: CmsPagePut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    if slug not in KNOWN_PAGES:
        raise HTTPException(status_code=400, detail=f"Неизвестная страница: {slug}")
    page = _get_or_create(db, slug)
    page.content = payload.content
    page.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(page)
    return page
