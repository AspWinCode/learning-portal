import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.schemas.auth import (
    ParentInviteRequest,
    ParentInviteResponse,
    PasswordReset,
    PasswordResetConfirm,
    SetPasswordByInvite,
    Token,
    UserLogin,
)
from app.schemas.users import UserResponse
from app.services.telegram import notify_user
from app.services.email_sender import is_email_configured, send_email

router = APIRouter()


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    raw = str(authorization or "").strip()
    if not raw:
        return None
    parts = raw.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email, "role": user.role.value},
        expires_delta=access_token_expires,
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/guest", response_model=Token)
async def guest_login():
    access_token_expires = timedelta(hours=auth.GUEST_TOKEN_EXPIRE_HOURS)
    access_token = auth.create_access_token(
        data={"sub": "guest", "role": "guest"},
        expires_delta=access_token_expires,
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(
    token: str = Depends(auth.oauth2_scheme),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.blacklist_token(token)
    return {"message": "Logged out"}


@router.post("/password-reset")
@limiter.limit("5/minute")
async def password_reset(
    request: Request,
    payload: PasswordReset,
    db: Session = Depends(get_db),
):
    return await _password_reset_request_impl(payload, db)


def _hash_reset_code(code: str) -> str:
    raw = f"{auth.SECRET_KEY}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _hash_invite_token(token: str) -> str:
    raw = f"{auth.SECRET_KEY}:invite:{token}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _now_for(expires_at: datetime) -> datetime:
    if expires_at and getattr(expires_at, "tzinfo", None) is not None:
        return datetime.now(expires_at.tzinfo)
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _password_reset_request_impl(payload: PasswordReset, db: Session):
    user = auth.get_user_by_email(db, payload.email)

    if user:
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15)

        user.password_reset_code_hash = _hash_reset_code(code)
        user.password_reset_expires_at = expires_at
        db.add(user)
        db.commit()
        db.refresh(user)

        if user.telegram_chat_id:
            try:
                await notify_user(
                    db,
                    user.id,
                    f"Код для сброса пароля: {code}\nДействителен 15 минут.",
                )
            except Exception:
                pass

        if is_email_configured():
            try:
                send_email(
                    to_email=user.email,
                    subject="Сброс пароля",
                    body=(
                        f"Ваш код для сброса пароля: {code}\n\n"
                        f"Код действителен 15 минут.\n\n"
                        f"Если вы не запрашивали сброс пароля — проигнорируйте это письмо."
                    ),
                )
            except Exception:
                pass

    return {"message": "Если email существует, код для сброса пароля отправлен"}


@router.post("/password-reset/request")
@limiter.limit("5/minute")
async def password_reset_request(
    request: Request,
    payload: PasswordReset,
    db: Session = Depends(get_db),
):
    return await _password_reset_request_impl(payload, db)


@router.post("/password-reset/confirm")
async def password_reset_confirm(
    body: PasswordResetConfirm,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    try:
        auth.validate_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    user = auth.get_user_by_email(db, body.email)
    if not user:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    if not user.password_reset_code_hash or not user.password_reset_expires_at:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    now = _now_for(user.password_reset_expires_at)
    if user.password_reset_expires_at < now:
        user.password_reset_code_hash = None
        user.password_reset_expires_at = None
        db.add(user)
        db.commit()
        raise HTTPException(status_code=400, detail="Код просрочен, запросите новый")

    expected = user.password_reset_code_hash
    provided = _hash_reset_code(body.code.strip())
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=400, detail="Неверный код или email")

    user.hashed_password = auth.get_password_hash(body.new_password)
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    db.add(user)
    db.commit()

    bearer_token = _extract_bearer_token(authorization)
    if bearer_token:
        try:
            auth.blacklist_token(bearer_token)
        except Exception:
            pass

    return {"message": "Пароль изменён"}


@router.post("/set-password-by-invite")
async def set_password_by_invite(
    body: SetPasswordByInvite,
    db: Session = Depends(get_db),
):
    try:
        auth.validate_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    token_hash = _hash_invite_token(body.token.strip())
    user = db.query(User).filter(
        User.invite_token_hash == token_hash,
        User.invite_token_expires_at.isnot(None),
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или просрочена")
    now = _now_for(user.invite_token_expires_at)
    if user.invite_token_expires_at < now:
        user.invite_token_hash = None
        user.invite_token_expires_at = None
        db.add(user)
        db.commit()
        raise HTTPException(status_code=400, detail="Ссылка просрочена")
    user.hashed_password = auth.get_password_hash(body.new_password)
    user.invite_token_hash = None
    user.invite_token_expires_at = None
    db.add(user)
    db.commit()
    return {"message": "Пароль установлен. Можно войти в кабинет."}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(auth.get_current_active_user)):
    return UserResponse.model_validate(current_user)
