"""Методист-студия: отдельная точка входа для методистов без основного портала."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import UserRole

router = APIRouter()

METHODIST_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 часов


class MethodistLoginRequest(BaseModel):
    email: str
    password: str


class MethodistLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    full_name: str
    email: str


@router.post("/login", response_model=MethodistLoginResponse)
def methodist_login(payload: MethodistLoginRequest, db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    if user.role != UserRole.METHODIST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для методистов",
        )

    from datetime import timedelta

    token = auth.create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=METHODIST_TOKEN_EXPIRE_MINUTES),
    )
    return MethodistLoginResponse(
        access_token=token,
        full_name=user.full_name or user.email,
        email=user.email,
    )
