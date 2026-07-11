"""
CMS router — manages landing page content (home, faq, o-nas, etc.).
Content is stored as JSON blobs per page slug.
"""
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CmsPage
from app.auth import require_permission
from app.models import User

LANDING_URL = os.getenv("LANDING_URL", "https://tirskix-academy.com")
LANDING_REVALIDATE_SECRET = os.getenv("LANDING_REVALIDATE_SECRET", "")

router = APIRouter()

# ── Known pages with their labels ──────────────────────────────────────────
KNOWN_PAGES = {
    "home":                              "Главная страница",
    "faq":                               "FAQ — Частые вопросы",
    "o-nas":                             "О нас",
    "kontakty":                          "Контакты",
    "game-studio":                       "Трек · Игровая студия",
    "kodeks":                            "Трек · Кодэкс",
    "technolab":                         "Трек · ТехноЛаб",
    "besplatnyj-probnyj-urok":          "Бесплатный пробный урок",
    "individualnye-zanyatiya":           "Индивидуальные занятия",
    "podgotovka-k-oge-po-informatike":   "Подготовка к ОГЭ",
    "podgotovka-k-ege-po-informatike":   "Подготовка к ЕГЭ",
    "dostizheniya-uchenikov":            "Достижения учеников",
    "aktivnosti":                        "Активности",
    "igrovye-dzhemy":                    "Игровые джемы",
    "programmirovanie-dlya-detej":       "Программирование для детей",
    "python-dlya-detej":                 "Python для детей",
    "razrabotka-igr-na-python":          "Разработка игр на Python",
    "backend-razrabotka":                "Backend-разработка",
    "frontend-razrabotka":               "Frontend-разработка",
    "napravleniya-razrabotki":           "Направления разработки",
    "legal-oferta":                      "Юридическое · Публичная оферта",
    "legal-privacy":                     "Юридическое · Политика конфиденциальности",
    "legal-terms":                       "Юридическое · Пользовательское соглашение",
    "header":                            "Шапка · Навигация",
    "footer":                            "Подвал · Футер",
    "branding":                          "Брендинг · Цвета",
}


class CmsRevalidateIn(BaseModel):
    slug: Optional[str] = None  # None or "*" = revalidate all


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


@router.post("/revalidate")
async def revalidate_cache(
    payload: CmsRevalidateIn = CmsRevalidateIn(),
    current_user: User = Depends(require_permission("seo.manage")),
):
    """Trigger Next.js on-demand ISR revalidation for a landing page."""
    if not LANDING_REVALIDATE_SECRET:
        raise HTTPException(status_code=503, detail="Revalidation not configured (LANDING_REVALIDATE_SECRET missing)")

    url = f"{LANDING_URL}/api/revalidate?secret={LANDING_REVALIDATE_SECRET}"
    body = {"slug": payload.slug or "*"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=body)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Landing returned {resp.status_code}: {resp.text[:200]}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach landing: {exc}")

    return {"ok": True, "revalidated": body["slug"]}
