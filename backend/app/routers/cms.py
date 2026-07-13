"""
CMS router — manages landing page content (home, faq, o-nas, etc.).
Content is stored as JSON blobs per page slug, with full version history.
"""
import os
import re as _re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CmsPage, CmsPageVersion
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
    "blog":                              "Блог · Листинг",
    "header":                            "Шапка · Навигация",
    "footer":                            "Подвал · Футер",
    "branding":                          "Брендинг · Цвета",
    "announcement":                      "Объявление · Баннер",
}


_SLUG_RE = _re.compile(r'^[a-z0-9][a-z0-9-]*$')


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class CmsRevalidateIn(BaseModel):
    slug: Optional[str] = None  # None or "*" = revalidate all


class CmsPageCreate(BaseModel):
    slug: str
    label: str


class CmsVersionOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    published_at: Optional[datetime]
    created_by_id: Optional[int]

    class Config:
        from_attributes = True


class CmsPageOut(BaseModel):
    slug: str
    label: str
    content: Any
    updated_at: datetime | None
    # extended fields returned by GET /pages/{slug}
    draft_version: Optional[CmsVersionOut] = None
    published_version: Optional[CmsVersionOut] = None

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


def _is_custom(page: CmsPage) -> bool:
    return isinstance(page.content, dict) and page.content.get("_custom") is True


def _latest_version(db: Session, page_id: int, status: str) -> Optional[CmsPageVersion]:
    return (
        db.query(CmsPageVersion)
        .filter(CmsPageVersion.page_id == page_id, CmsPageVersion.status == status)
        .order_by(CmsPageVersion.created_at.desc())
        .first()
    )


async def _trigger_revalidate(slug: str) -> None:
    if not LANDING_REVALIDATE_SECRET:
        return
    url = f"{LANDING_URL}/api/revalidate?secret={LANDING_REVALIDATE_SECRET}"
    body = {"slug": slug}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(url, json=body)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/pages", response_model=list[CmsPageOut])
def list_pages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    """Return all known pages + custom user-created pages."""
    existing = {p.slug: p for p in db.query(CmsPage).all()}
    result = []
    for slug, label in KNOWN_PAGES.items():
        if slug in existing:
            result.append(existing[slug])
        else:
            result.append(CmsPage(slug=slug, label=label, content={}, updated_at=None))
    for slug, page in existing.items():
        if slug not in KNOWN_PAGES:
            result.append(page)
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
        return CmsPageOut(slug=slug, label=label, content={}, updated_at=None)

    draft = _latest_version(db, page.id, "draft")
    published = _latest_version(db, page.id, "published")

    out = CmsPageOut(
        slug=page.slug,
        label=page.label,
        content=published.content if published else page.content,
        updated_at=page.updated_at,
        draft_version=CmsVersionOut.model_validate(draft) if draft else None,
        published_version=CmsVersionOut.model_validate(published) if published else None,
    )
    return out


@router.get("/pages/{slug}/versions", response_model=list[CmsVersionOut])
def list_page_versions(
    slug: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        return []
    versions = (
        db.query(CmsPageVersion)
        .filter(CmsPageVersion.page_id == page.id)
        .order_by(CmsPageVersion.created_at.desc())
        .limit(limit)
        .all()
    )
    return versions


@router.post("/pages", response_model=CmsPageOut, status_code=201)
def create_custom_page(
    payload: CmsPageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    slug = payload.slug.strip().lower()
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Slug должен содержать только a–z, 0–9, дефис и начинаться с буквы/цифры")
    if slug in KNOWN_PAGES:
        raise HTTPException(status_code=400, detail=f"Slug «{slug}» зарезервирован системой")
    if db.query(CmsPage).filter(CmsPage.slug == slug).first():
        raise HTTPException(status_code=409, detail="Страница с таким slug уже существует")
    label = payload.label.strip() or slug
    page = CmsPage(slug=slug, label=label, content={"_custom": True})
    db.add(page)
    db.commit()
    db.refresh(page)
    return CmsPageOut(slug=page.slug, label=page.label, content=page.content, updated_at=page.updated_at)


@router.delete("/pages/{slug}", status_code=204)
def delete_custom_page(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    if slug in KNOWN_PAGES:
        raise HTTPException(status_code=400, detail="Нельзя удалить системную страницу")
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")
    if not _is_custom(page):
        raise HTTPException(status_code=400, detail="Нельзя удалить системную страницу")
    db.delete(page)
    db.commit()


@router.put("/pages/{slug}", response_model=CmsPageOut)
def upsert_page(
    slug: str,
    payload: CmsPagePut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    """Save a draft version. Does not affect the live site."""
    if slug not in KNOWN_PAGES:
        existing = db.query(CmsPage).filter(CmsPage.slug == slug).first()
        if not existing or not _is_custom(existing):
            raise HTTPException(status_code=400, detail=f"Неизвестная страница: {slug}")
    page = _get_or_create(db, slug)

    # legacy: keep cms_pages.content in sync so old read paths still work
    page.content = payload.content
    page.updated_at = datetime.now(timezone.utc)

    # create draft version
    version = CmsPageVersion(
        page_id=page.id,
        content=payload.content,
        status="draft",
        created_by_id=current_user.id,
    )
    db.add(version)
    db.commit()
    db.refresh(page)

    draft = _latest_version(db, page.id, "draft")
    published = _latest_version(db, page.id, "published")
    return CmsPageOut(
        slug=page.slug,
        label=page.label,
        content=page.content,
        updated_at=page.updated_at,
        draft_version=CmsVersionOut.model_validate(draft) if draft else None,
        published_version=CmsVersionOut.model_validate(published) if published else None,
    )


@router.post("/pages/{slug}/publish", response_model=CmsPageOut)
async def publish_page(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    """Promote the latest draft to published and trigger ISR revalidation."""
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    draft = _latest_version(db, page.id, "draft")
    if not draft:
        raise HTTPException(status_code=400, detail="Нет черновика для публикации")

    now = datetime.now(timezone.utc)
    draft.status = "published"
    draft.published_at = now

    # keep legacy content field in sync
    page.content = draft.content
    page.updated_at = now

    db.commit()
    db.refresh(draft)

    try:
        await _trigger_revalidate(slug)
    except Exception:
        pass  # revalidation is best-effort; don't roll back publish

    published = _latest_version(db, page.id, "published")
    return CmsPageOut(
        slug=page.slug,
        label=page.label,
        content=page.content,
        updated_at=page.updated_at,
        draft_version=None,
        published_version=CmsVersionOut.model_validate(published) if published else None,
    )


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
