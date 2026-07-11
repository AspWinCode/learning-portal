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
from app.models import BlogCategory, BlogPost, BlogPostStatus, SeoPage, SeoPageStatus, SeoRedirect

log = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"
OUTPUT_DIR = Path(os.getenv("PUBLIC_SITE_OUTPUT_DIR", "/app/public_site"))
ACADEMY_DOMAIN = os.getenv("ACADEMY_DOMAIN", "localhost")
BASE_URL = f"http://{ACADEMY_DOMAIN}"


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


# ─── sitemap / robots / redirects ────────────────────────────────────────────

def _generate_sitemap(db: Session) -> None:
    pages = (
        db.query(SeoPage)
        .filter(SeoPage.status == SeoPageStatus.PUBLISHED)
        .all()
    )
    posts = (
        db.query(BlogPost)
        .filter(BlogPost.status == BlogPostStatus.PUBLISHED)
        .order_by(BlogPost.published_at.desc())
        .all()
    )

    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    def _url(loc: str, priority: str = "0.7", freq: str = "weekly") -> str:
        return (
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <changefreq>{freq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
        )

    lines.append(_url(f"{BASE_URL}/", priority="1.0", freq="daily"))
    lines.append(_url(f"{BASE_URL}/blog/", priority="0.8", freq="daily"))

    for page in pages:
        lines.append(_url(f"{BASE_URL}/{page.slug}"))

    for post in posts:
        lastmod = ""
        if post.published_at:
            lastmod = f"\n    <lastmod>{post.published_at.strftime('%Y-%m-%d')}</lastmod>"
        lines.append(
            f"  <url>\n"
            f"    <loc>{BASE_URL}/blog/{post.slug}</loc>{lastmod}\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>0.6</priority>\n"
            f"  </url>"
        )

    lines.append("</urlset>")
    _write(OUTPUT_DIR / "sitemap.xml", "\n".join(lines))
    log.info("generated sitemap.xml (%d pages + %d posts)", len(pages), len(posts))


def _generate_robots_txt() -> None:
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "\n"
        f"Sitemap: {BASE_URL}/sitemap.xml\n"
    )
    (OUTPUT_DIR / "robots.txt").write_text(content, encoding="utf-8")
    log.info("generated robots.txt")


_REDIRECT_TEMPLATE = """\
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Переадресация...</title>
  <meta http-equiv="refresh" content="0; url={to_url}">
  <link rel="canonical" href="{to_url}">
  <meta name="robots" content="noindex">
</head>
<body>
  <script>window.location.replace("{to_url_js}")</script>
  <p>Страница перемещена: <a href="{to_url}">{to_url}</a></p>
</body>
</html>
"""


def _generate_redirects(db: Session) -> None:
    redirects = (
        db.query(SeoRedirect)
        .filter(SeoRedirect.is_active == True)  # noqa: E712
        .all()
    )
    count = 0
    for r in redirects:
        # from_path like "/old-page" → write to OUTPUT_DIR/old-page.html
        path = r.from_path.lstrip("/")
        if not path:
            continue
        # Escape for JS string
        to_url_js = r.to_url.replace("\\", "\\\\").replace('"', '\\"')
        html = _REDIRECT_TEMPLATE.format(to_url=r.to_url, to_url_js=to_url_js)
        _write(OUTPUT_DIR / f"{path}.html", html)
        count += 1
    log.info("generated %d redirect stubs", count)


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
        _generate_redirects(db)
        _generate_sitemap(db)
        _generate_robots_txt()
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
