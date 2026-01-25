from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import auth
from app.models import AppSetting, User
from app.schemas import LogoResponse, LogoUpdate


router = APIRouter()

LOGO_KEY = "site_logo_data_url"


@router.get("/logo", response_model=LogoResponse)
async def get_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    setting = db.query(AppSetting).filter(AppSetting.key == LOGO_KEY).first()
    return {"data_url": setting.value if setting else None}


@router.post("/logo", response_model=LogoResponse)
async def set_logo(
    body: LogoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"])),
):
    data_url = (body.data_url or "").strip()
    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Logo must be a data:image/* data URL")

    # Ограничение размера (~200KB base64), чтобы не раздувать БД
    if len(data_url) > 250_000:
        raise HTTPException(status_code=400, detail="Logo is too large (max ~200KB)")

    setting = db.query(AppSetting).filter(AppSetting.key == LOGO_KEY).first()
    if not setting:
        setting = AppSetting(key=LOGO_KEY, value=data_url)
        db.add(setting)
    else:
        setting.value = data_url
        db.add(setting)

    db.commit()
    db.refresh(setting)
    return {"data_url": setting.value}


