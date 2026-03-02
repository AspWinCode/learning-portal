from __future__ import annotations

import secrets
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, UserRole
from app.routers.action_log import log_action
from app.services.telegram import notify_user

router = APIRouter()


@router.post(
    "/reset-trainer-password/{user_id}",
    status_code=status.HTTP_200_OK,
)
async def reset_trainer_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"])),
) -> Dict[str, str]:
    """
    Админский сброс пароля тренера:
    - генерирует временный пароль;
    - меняет пароль тренера;
    - логирует событие в ActionLog;
    - если у тренера привязан Telegram, отправляет туда временный пароль.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != UserRole.TRAINER:
        raise HTTPException(status_code=400, detail="Можно сбрасывать пароль только тренерам")

    # Генерация временного пароля: буквы + цифры, 10 символов
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(10))

    user.hashed_password = auth.get_password_hash(temp_password)
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        db,
        current_user.id,
        action_type="reset_trainer_password",
        entity_type="user",
        entity_id=user.id,
        details={"trainer_email": user.email},
    )

    # Отправляем временный пароль в Telegram, если тренер привязан
    try:
        await notify_user(
            db,
            user.id,
            f"Вам установлен новый временный пароль для входа в портал: {temp_password}",
        )
    except Exception:
        # не блокируем основной поток
        pass
    return {"temporary_password": temp_password}

