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
    current_user: User = Depends(auth.require_permission("admin_tools.reset_trainer_password")),
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
    if auth.resolve_effective_role(user) != UserRole.TRAINER:
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


ELEVATED_ROLES = {UserRole.ADMIN, UserRole.OWNER}


@router.post(
    "/reset-user-password/{user_id}",
    status_code=status.HTTP_200_OK,
)
async def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("admin_tools.reset_any_password")),
) -> Dict[str, str]:
    """Сброс пароля для любого не-привилегированного пользователя (кроме admin/owner)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if auth.resolve_effective_role(user) in ELEVATED_ROLES:
        raise HTTPException(status_code=403, detail="Нельзя сбрасывать пароль администраторам и владельцам")

    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(10))

    user.hashed_password = auth.get_password_hash(temp_password)
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        db,
        current_user.id,
        action_type="reset_user_password",
        entity_type="user",
        entity_id=user.id,
        details={"user_email": user.email, "user_role": user.role},
    )

    try:
        await notify_user(
            db,
            user.id,
            f"Вам установлен новый временный пароль для входа в портал: {temp_password}",
        )
    except Exception:
        pass
    return {"temporary_password": temp_password}

