from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app import auth
from app.models import User
from app.services.telegram import issue_link_code, build_deep_link

router = APIRouter()


class TelegramLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime
    deep_link_url: Optional[str] = None


@router.post("/link-code", response_model=TelegramLinkCodeResponse)
async def get_link_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "trainer", "parent"])),
):
    """Выдать одноразовый код для привязки Telegram через /start <code>"""
    code, expires_at = issue_link_code(db, current_user, ttl_minutes=10)
    return {
        "code": code,
        "expires_at": expires_at,
        "deep_link_url": build_deep_link(code),
    }


@router.post("/unlink")
async def unlink(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "trainer", "parent"])),
):
    """Отвязать Telegram от текущего пользователя"""
    current_user.telegram_chat_id = None
    current_user.telegram_link_code = None
    current_user.telegram_link_code_expires_at = None
    db.add(current_user)
    db.commit()
    return {"message": "Telegram unlinked"}


