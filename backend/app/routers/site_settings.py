from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_permission
from app.database import get_db
from app.models import SiteSettings
from app.routers.action_log import log_action
from app.schemas.seo import SiteSettingsResponse, SiteSettingsUpdate

router = APIRouter()

_SINGLETON_ID = 1


def _get_or_create(db: Session) -> SiteSettings:
    obj = db.get(SiteSettings, _SINGLETON_ID)
    if not obj:
        obj = SiteSettings(id=_SINGLETON_ID)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj


@router.get("/", response_model=SiteSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.access")),
):
    return _get_or_create(db)


@router.patch("/", response_model=SiteSettingsResponse)
def update_settings(
    payload: SiteSettingsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("seo.manage")),
):
    obj = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    log_action(db, current_user.id, "site_settings_update", "Обновлены настройки сайта")
    return obj
