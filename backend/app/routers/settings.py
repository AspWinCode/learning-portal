from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from app.database import get_db
from app import auth
from app.models import AppSetting, User
from app.schemas import LogoResponse, LogoUpdate


router = APIRouter()

LOGO_KEY = "site_logo_data_url"
DISTRICTS_KEY = "b2b_districts"
REFUSED_REASONS_KEY = "sales_refused_reasons"


class B2BDistrictsResponse(BaseModel):
    items: List[str]


class B2BDistrictsUpdate(BaseModel):
    items: List[str]


class RefusedReasonsResponse(BaseModel):
    items: List[str]


class RefusedReasonsUpdate(BaseModel):
    items: List[str]


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


@router.get("/b2b-districts", response_model=B2BDistrictsResponse)
async def get_b2b_districts(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    setting = db.query(AppSetting).filter(AppSetting.key == DISTRICTS_KEY).first()
    if not setting or not (setting.value or "").strip():
        return B2BDistrictsResponse(items=[])
    try:
        data = json.loads(setting.value)
        if isinstance(data, list):
            items = [str(x) for x in data]
        else:
            items = []
    except Exception:
        items = []
    return B2BDistrictsResponse(items=items)


@router.post("/b2b-districts", response_model=B2BDistrictsResponse)
async def set_b2b_districts(
    body: B2BDistrictsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    items = [s.strip() for s in body.items if s and s.strip()]
    raw = json.dumps(items, ensure_ascii=False)
    setting = db.query(AppSetting).filter(AppSetting.key == DISTRICTS_KEY).first()
    if not setting:
        setting = AppSetting(key=DISTRICTS_KEY, value=raw)
        db.add(setting)
    else:
        setting.value = raw
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return B2BDistrictsResponse(items=items)


@router.get("/refused-reasons", response_model=RefusedReasonsResponse)
async def get_refused_reasons(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    setting = db.query(AppSetting).filter(AppSetting.key == REFUSED_REASONS_KEY).first()
    if not setting or not (setting.value or "").strip():
        return RefusedReasonsResponse(items=[])
    try:
        data = json.loads(setting.value)
        if isinstance(data, list):
            items = [str(x) for x in data]
        else:
            items = []
    except Exception:
        items = []
    return RefusedReasonsResponse(items=items)


@router.post("/refused-reasons", response_model=RefusedReasonsResponse)
async def set_refused_reasons(
    body: RefusedReasonsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    items = [s.strip() for s in body.items if s and s.strip()]
    raw = json.dumps(items, ensure_ascii=False)
    setting = db.query(AppSetting).filter(AppSetting.key == REFUSED_REASONS_KEY).first()
    if not setting:
        setting = AppSetting(key=REFUSED_REASONS_KEY, value=raw)
        db.add(setting)
    else:
        setting.value = raw
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return RefusedReasonsResponse(items=items)


