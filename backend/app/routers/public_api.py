"""
Public read-only API — no authentication required.
Exposes published blog posts and safe site settings for the landing site.
"""
import re as _re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import BlogPost, BlogPostStatus, BlogCategory, SiteSettings, CmsPage, Lead, LeadStatus, User, UserRole
from app.utils.phone import validate_phone_for_lead
from app.services.person_sync import sync_lead_person

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────

class PublicCategoryOut(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class PublicPostSummary(BaseModel):
    id: int
    slug: str
    title: str
    excerpt: Optional[str] = None
    cover_image: Optional[str] = None
    published_at: Optional[str] = None
    category: Optional[PublicCategoryOut] = None

    class Config:
        from_attributes = True


class PublicPostDetail(PublicPostSummary):
    content: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    og_image: Optional[str] = None
    canonical: Optional[str] = None


class PublicSettingsOut(BaseModel):
    site_title: Optional[str] = None
    site_description: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    vk_url: Optional[str] = None
    tg_url: Optional[str] = None
    inst_url: Optional[str] = None
    ga_measurement_id: Optional[str] = None
    ym_counter_id: Optional[str] = None
    vk_pixel_id: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Helpers ────────────────────────────────────────────────────────────────

def _serialize_post_summary(p: BlogPost) -> dict:
    return {
        "id": p.id,
        "slug": p.slug,
        "title": p.title,
        "excerpt": p.excerpt,
        "cover_image": p.cover_image,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug} if p.category else None,
    }


def _serialize_post_detail(p: BlogPost) -> dict:
    d = _serialize_post_summary(p)
    d.update({
        "content": p.content,
        "seo_title": p.seo_title,
        "seo_description": p.seo_description,
        "og_title": p.og_title,
        "og_description": p.og_description,
        "og_image": p.og_image,
        "canonical": p.canonical,
    })
    return d


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/blog/posts", response_model=list[PublicPostSummary])
def list_published_posts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category_slug: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category))
        .filter(BlogPost.status == BlogPostStatus.PUBLISHED)
    )
    if category_slug:
        q = q.join(BlogCategory).filter(BlogCategory.slug == category_slug)
    posts = q.order_by(BlogPost.published_at.desc()).offset(offset).limit(limit).all()
    return [_serialize_post_summary(p) for p in posts]


@router.get("/blog/posts/{slug}", response_model=PublicPostDetail)
def get_published_post(slug: str, db: Session = Depends(get_db)):
    post = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category))
        .filter(BlogPost.slug == slug, BlogPost.status == BlogPostStatus.PUBLISHED)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    return _serialize_post_detail(post)


@router.get("/site-settings", response_model=PublicSettingsOut)
def get_public_settings(db: Session = Depends(get_db)):
    s = db.get(SiteSettings, 1)
    if not s:
        return PublicSettingsOut()
    return s


@router.get("/cms/{slug}")
def get_cms_page(slug: str, db: Session = Depends(get_db)):
    page = db.query(CmsPage).filter(CmsPage.slug == slug).first()
    if not page:
        return {}
    return page.content


# ── Site lead (from landing site forms) ─────────────────────────────────────

_SITE_TRACK_SOURCE = {
    "game-studio":  "Сайт_Игровая студия",
    "kodeks":       "Сайт_Кодэкс",
    "technolab":    "Сайт_ТехноЛаб",
    "oge":          "Сайт_ОГЭ",
    "ege":          "Сайт_ЕГЭ",
    "individual":   "Сайт_Индивидуальные",
    "contact-form": "Сайт_Контакты",
}


class SiteLeadRequest(BaseModel):
    name: str
    contact: str          # phone or email
    track: Optional[str] = None
    message: Optional[str] = None


@router.post("/leads/site-lead", status_code=201)
def submit_site_lead(payload: SiteLeadRequest, db: Session = Depends(get_db)):
    """Accept a lead from landing site forms (TrialForm / ContactForm). No auth required."""
    name = payload.name.strip()
    contact = payload.contact.strip()
    if len(name) < 2 or len(contact) < 5:
        raise HTTPException(status_code=422, detail="Укажите имя и контакт")

    is_email = bool(_re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", contact))
    if is_email:
        phone_val = ""
        phone_norm = None
        email_val = contact
    else:
        phone_val, phone_err = validate_phone_for_lead(contact)
        if phone_err:
            phone_val = contact
            phone_norm = None
        else:
            phone_norm = phone_val
        email_val = None

    source_label = _SITE_TRACK_SOURCE.get(payload.track or "", "Сайт")

    owner = (
        db.query(User)
        .filter(User.role.in_([UserRole.SALES, UserRole.OWNER, UserRole.ADMIN]))
        .order_by(User.id)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=500, detail="Не настроен пользователь для приёма заявок")

    parts = []
    if payload.track:
        parts.append(f"Трек: {payload.track}")
    if payload.message and payload.message.strip():
        parts.append(payload.message.strip())

    lead = Lead(
        owner_id=owner.id,
        contact_name=name,
        phone=phone_val,
        phone_normalized=phone_norm,
        email=email_val,
        source=source_label,
        status=LeadStatus.NEW,
        tags=["site_lead"],
        comment="\n\n".join(parts) or None,
    )
    db.add(lead)
    db.flush()
    sync_lead_person(db, lead)
    db.commit()
    db.refresh(lead)
    return {"lead_id": lead.id}
