from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_permission
from app.database import get_db
from app.models import SeoRedirect
from app.routers.action_log import log_action
from app.schemas.seo import SeoRedirectCreate, SeoRedirectResponse, SeoRedirectUpdate

router = APIRouter()

PATH_RE = __import__("re").compile(r"^/[^\s]*$")


def _validate_path(path: str) -> str:
    p = (path or "").strip()
    if not p or not PATH_RE.match(p):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_path должен начинаться с / и не содержать пробелов",
        )
    return p


@router.get("/", response_model=List[SeoRedirectResponse])
def list_redirects(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.access")),
):
    return db.query(SeoRedirect).order_by(SeoRedirect.created_at.desc()).all()


@router.post("/", response_model=SeoRedirectResponse, status_code=status.HTTP_201_CREATED)
def create_redirect(
    payload: SeoRedirectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    from_path = _validate_path(payload.from_path)
    if payload.status_code not in (301, 302):
        raise HTTPException(status_code=422, detail="status_code должен быть 301 или 302")

    existing = db.query(SeoRedirect).filter(SeoRedirect.from_path == from_path).first()
    if existing:
        raise HTTPException(status_code=409, detail="Редирект для этого пути уже существует")

    redirect = SeoRedirect(
        from_path=from_path,
        to_url=payload.to_url.strip(),
        status_code=payload.status_code,
        is_active=payload.is_active,
    )
    db.add(redirect)
    db.commit()
    db.refresh(redirect)
    log_action(db, current_user.id, "redirect_create", f"{from_path} → {payload.to_url}")
    return redirect


@router.patch("/{redirect_id}", response_model=SeoRedirectResponse)
def update_redirect(
    redirect_id: int,
    payload: SeoRedirectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    redirect = db.get(SeoRedirect, redirect_id)
    if not redirect:
        raise HTTPException(status_code=404, detail="Редирект не найден")

    if payload.to_url is not None:
        redirect.to_url = payload.to_url.strip()
    if payload.status_code is not None:
        if payload.status_code not in (301, 302):
            raise HTTPException(status_code=422, detail="status_code должен быть 301 или 302")
        redirect.status_code = payload.status_code
    if payload.is_active is not None:
        redirect.is_active = payload.is_active

    db.commit()
    db.refresh(redirect)
    log_action(db, current_user.id, "redirect_update", f"id={redirect_id}")
    return redirect


@router.delete("/{redirect_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_redirect(
    redirect_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    redirect = db.get(SeoRedirect, redirect_id)
    if not redirect:
        raise HTTPException(status_code=404, detail="Редирект не найден")
    log_action(db, current_user.id, "redirect_delete", f"{redirect.from_path}")
    db.delete(redirect)
    db.commit()
