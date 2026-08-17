import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import BlogCategory, BlogPost, BlogPostStatus, BlogTag, BlogPostTag
from app.schemas.blog import (
    BlogCategoryCreate,
    BlogCategoryResponse,
    BlogCategoryUpdate,
    BlogPostCreate,
    BlogPostListResponse,
    BlogPostResponse,
    BlogPostUpdate,
    BlogTagCreate,
    BlogTagResponse,
    BlogTagUpdate,
)
from app.auth import require_permission
from app.routers.action_log import log_action
from app.models import User

router = APIRouter()

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _assert_slug(slug: str, label: str) -> None:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail=f"{label}: slug должен содержать только строчные латинские буквы, цифры и дефисы")


# ════════════════════════════════════════════════════════════════════════════
# Categories
# ════════════════════════════════════════════════════════════════════════════

@router.get("/categories", response_model=list[BlogCategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    return db.query(BlogCategory).order_by(BlogCategory.name).all()


@router.post("/categories", response_model=BlogCategoryResponse, status_code=201)
def create_category(
    payload: BlogCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    _assert_slug(payload.slug, "Категория")
    if db.query(BlogCategory).filter(BlogCategory.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Категория с таким slug уже существует")
    cat = BlogCategory(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_action(db, current_user.id, "blog_category_create", "blog_category", cat.id, {"slug": cat.slug})
    return cat


@router.patch("/categories/{cat_id}", response_model=BlogCategoryResponse)
def update_category(
    cat_id: int,
    payload: BlogCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    cat = db.query(BlogCategory).filter(BlogCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data:
        _assert_slug(data["slug"], "Категория")
        dup = db.query(BlogCategory).filter(BlogCategory.slug == data["slug"], BlogCategory.id != cat_id).first()
        if dup:
            raise HTTPException(status_code=409, detail="Категория с таким slug уже существует")
    for k, v in data.items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    log_action(db, current_user.id, "blog_category_update", "blog_category", cat.id)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    cat = db.query(BlogCategory).filter(BlogCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    db.delete(cat)
    db.commit()
    log_action(db, current_user.id, "blog_category_delete", "blog_category", cat_id)


# ════════════════════════════════════════════════════════════════════════════
# Tags
# ════════════════════════════════════════════════════════════════════════════

@router.get("/tags", response_model=list[BlogTagResponse])
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    return db.query(BlogTag).order_by(BlogTag.name).all()


@router.post("/tags", response_model=BlogTagResponse, status_code=201)
def create_tag(
    payload: BlogTagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    _assert_slug(payload.slug, "Тег")
    if db.query(BlogTag).filter(BlogTag.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Тег с таким slug уже существует")
    tag = BlogTag(**payload.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    log_action(db, current_user.id, "blog_tag_create", "blog_tag", tag.id, {"slug": tag.slug})
    return tag


@router.patch("/tags/{tag_id}", response_model=BlogTagResponse)
def update_tag(
    tag_id: int,
    payload: BlogTagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    tag = db.query(BlogTag).filter(BlogTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data:
        _assert_slug(data["slug"], "Тег")
        dup = db.query(BlogTag).filter(BlogTag.slug == data["slug"], BlogTag.id != tag_id).first()
        if dup:
            raise HTTPException(status_code=409, detail="Тег с таким slug уже существует")
    for k, v in data.items():
        setattr(tag, k, v)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    tag = db.query(BlogTag).filter(BlogTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    db.delete(tag)
    db.commit()
    log_action(db, current_user.id, "blog_tag_delete", "blog_tag", tag_id)


# ════════════════════════════════════════════════════════════════════════════
# Posts
# ════════════════════════════════════════════════════════════════════════════

def _load_post(db: Session, post_id: int) -> BlogPost:
    post = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category), joinedload(BlogPost.tags))
        .filter(BlogPost.id == post_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    return post


def _apply_tags(db: Session, post: BlogPost, tag_ids: list[int]) -> None:
    db.query(BlogPostTag).filter(BlogPostTag.blog_post_id == post.id).delete()
    for tid in tag_ids:
        db.add(BlogPostTag(blog_post_id=post.id, blog_tag_id=tid))


@router.get("/posts", response_model=BlogPostListResponse)
def list_posts(
    status: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    q = db.query(BlogPost).options(joinedload(BlogPost.category), joinedload(BlogPost.tags))
    if status:
        q = q.filter(BlogPost.status == status)
    if category_id:
        q = q.filter(BlogPost.category_id == category_id)
    if search:
        q = q.filter(BlogPost.title.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(BlogPost.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/posts/{post_id}", response_model=BlogPostResponse)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.access")),
):
    return _load_post(db, post_id)


@router.post("/posts", response_model=BlogPostResponse, status_code=201)
def create_post(
    payload: BlogPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    _assert_slug(payload.slug, "Пост")
    if db.query(BlogPost).filter(BlogPost.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Пост с таким slug уже существует")

    data = payload.model_dump(exclude={"tag_ids"})
    post = BlogPost(**data, author_id=current_user.id)
    db.add(post)
    db.flush()

    if payload.tag_ids:
        _apply_tags(db, post, payload.tag_ids)

    db.commit()
    db.refresh(post)
    log_action(db, current_user.id, "blog_post_create", "blog_post", post.id, {"slug": post.slug})
    return _load_post(db, post.id)


@router.patch("/posts/{post_id}", response_model=BlogPostResponse)
def update_post(
    post_id: int,
    payload: BlogPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    post = _load_post(db, post_id)
    data = payload.model_dump(exclude_unset=True, exclude={"tag_ids"})

    if "slug" in data:
        _assert_slug(data["slug"], "Пост")
        dup = db.query(BlogPost).filter(BlogPost.slug == data["slug"], BlogPost.id != post_id).first()
        if dup:
            raise HTTPException(status_code=409, detail="Пост с таким slug уже существует")

    if "status" in data and data["status"] == BlogPostStatus.PUBLISHED and post.published_at is None:
        data["published_at"] = datetime.now(timezone.utc)

    for k, v in data.items():
        setattr(post, k, v)

    if payload.tag_ids is not None:
        _apply_tags(db, post, payload.tag_ids)

    db.commit()
    log_action(db, current_user.id, "blog_post_update", "blog_post", post_id, {"fields": list(data.keys())})
    return _load_post(db, post_id)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("seo.manage")),
):
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    db.delete(post)
    db.commit()
    log_action(db, current_user.id, "blog_post_delete", "blog_post", post_id)
