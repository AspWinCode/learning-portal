"""
Static site generator for TirSkix Academy public website.

Reads published SeoPages and BlogPosts from the database,
renders Jinja2 templates, and writes HTML to OUTPUT_DIR
(mounted Docker volume served by Caddy).
"""
from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models import BlogCategory, BlogPost, BlogPostStatus, SeoPage, SeoPageStatus

log = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"
OUTPUT_DIR = Path(os.getenv("PUBLIC_SITE_OUTPUT_DIR", "/app/public_site"))


# ─── Jinja2 filters ──────────────────────────────────────────────────────────

def _datefmt(value: datetime | str | None) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    MONTHS_RU = [
        "", "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]
    return f"{value.day} {MONTHS_RU[value.month]} {value.year}"


def _build_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["datefmt"] = _datefmt
    return env


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _write(path: Path, html: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    log.debug("wrote %s", path)


def _copy_static() -> None:
    dst = OUTPUT_DIR / "static"
    if dst.exists():
        shutil.rmtree(dst)
    if STATIC_DIR.exists():
        shutil.copytree(str(STATIC_DIR), str(dst))
        log.debug("copied static/ → %s", dst)


# ─── Page generators ─────────────────────────────────────────────────────────

def _generate_index(env: Environment, db: Session) -> None:
    recent_posts = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category), joinedload(BlogPost.tags))
        .filter(BlogPost.status == BlogPostStatus.PUBLISHED)
        .order_by(BlogPost.published_at.desc())
        .limit(3)
        .all()
    )
    tmpl = env.get_template("index.html")
    html = tmpl.render(
        blog_posts=recent_posts,
        current_year=datetime.now().year,
    )
    _write(OUTPUT_DIR / "index.html", html)
    log.info("generated index.html")


def _generate_seo_pages(env: Environment, db: Session) -> None:
    pages = (
        db.query(SeoPage)
        .filter(SeoPage.status == SeoPageStatus.PUBLISHED)
        .all()
    )
    tmpl = env.get_template("page.html")
    for page in pages:
        html = tmpl.render(page=page, current_year=datetime.now().year)
        _write(OUTPUT_DIR / f"{page.slug}.html", html)
    log.info("generated %d seo pages", len(pages))


def _generate_blog_list(env: Environment, db: Session) -> None:
    posts = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category), joinedload(BlogPost.tags))
        .filter(BlogPost.status == BlogPostStatus.PUBLISHED)
        .order_by(BlogPost.published_at.desc())
        .all()
    )
    categories = db.query(BlogCategory).order_by(BlogCategory.name).all()
    tmpl = env.get_template("blog/list.html")
    html = tmpl.render(
        posts=posts,
        categories=categories,
        current_category=None,
        current_year=datetime.now().year,
    )
    blog_dir = OUTPUT_DIR / "blog"
    blog_dir.mkdir(parents=True, exist_ok=True)
    _write(blog_dir / "index.html", html)
    log.info("generated blog/index.html (%d posts)", len(posts))


def _generate_blog_posts(env: Environment, db: Session) -> None:
    posts = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.category), joinedload(BlogPost.tags))
        .filter(BlogPost.status == BlogPostStatus.PUBLISHED)
        .all()
    )
    tmpl = env.get_template("blog/post.html")
    for post in posts:
        html = tmpl.render(post=post, current_year=datetime.now().year)
        _write(OUTPUT_DIR / "blog" / f"{post.slug}.html", html)
    log.info("generated %d blog posts", len(posts))


# ─── Public entrypoint ───────────────────────────────────────────────────────

def generate_site() -> dict:
    """
    Generate the full static site. Returns a summary dict with counts and timing.
    Called from the Dramatiq actor and the API endpoint.
    """
    started_at = datetime.now()
    log.info("SSG: starting generation → %s", OUTPUT_DIR)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    env = _build_env()

    db: Session = SessionLocal()
    try:
        _copy_static()
        _generate_index(env, db)
        _generate_seo_pages(env, db)
        _generate_blog_list(env, db)
        _generate_blog_posts(env, db)
    finally:
        db.close()

    elapsed = (datetime.now() - started_at).total_seconds()
    log.info("SSG: done in %.2fs", elapsed)

    return {
        "status": "ok",
        "output_dir": str(OUTPUT_DIR),
        "elapsed_seconds": round(elapsed, 2),
        "generated_at": datetime.now().isoformat(),
    }
