import hmac
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.rate_limit import limiter
from app.schemas import Token, UserLogin, PasswordReset, PasswordResetConfirm, SetPasswordByInvite, UserResponse
from app.models import User
from app.services.telegram import notify_user

router = APIRouter()


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
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
        data={"sub": user.email, "role": user.role.value}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/guest", response_model=Token)
async def guest_login():
    """
    Guest login without credentials.
    Creates a JWT with role=guest, not tied to a DB user.
    """
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": "guest", "role": "guest"}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/password-reset")
@limiter.limit("5/minute")
async def password_reset(
    request: Request,
    payload: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Backward-compatible alias for request endpoint.
    """
    return await _password_reset_request_impl(payload, db)


def _hash_reset_code(code: str) -> str:
    raw = f"{auth.SECRET_KEY}:{code}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _hash_invite_token(token: str) -> str:
    raw = f"{auth.SECRET_KEY}:invite:{token}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _now_for(expires_at: datetime) -> datetime:
    # Сравнение naive/aware безопасно
    if expires_at and getattr(expires_at, "tzinfo", None) is not None:
        return datetime.now(expires_at.tzinfo)
    return datetime.utcnow()


async def _password_reset_request_impl(payload: PasswordReset, db: Session):
    user = auth.get_user_by_email(db, payload.email)

    if user:
        # 6-значный код, удобно вводить руками
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        user.password_reset_code_hash = _hash_reset_code(code)
        user.password_reset_expires_at = expires_at
        db.add(user)
        db.commit()
        db.refresh(user)

        sent_to_telegram = False
        if user.telegram_chat_id:
            try:
                await notify_user(
                    db,
                    user.id,
                    f"Код для сброса пароля: {code}\n"
                    f"Действителен 15 минут."
                )
                sent_to_telegram = True
            except Exception:
                sent_to_telegram = False

    # Всегда возвращаем успех (не раскрываем существование email)
    return {"message": "Если email существует, код для сброса пароля отправлен (в Telegram, если он привязан)"}


@router.post("/password-reset/request")
@limiter.limit("5/minute")
async def password_reset_request(
    request: Request,
    payload: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Step 1: Request password reset code.
    - If user has Telegram linked, send code there.
    - Otherwise code is not delivered (neutral response for security).
    """
    return await _password_reset_request_impl(payload, db)


@router.post("/password-reset/confirm")
async def password_reset_confirm(
    body: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Step 2: Confirm reset with code and set new password.
    """
    user = auth.get_user_by_email(db, body.email)
    if not user:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    if not user.password_reset_code_hash or not user.password_reset_expires_at:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    now = _now_for(user.password_reset_expires_at)
    if user.password_reset_expires_at < now:
        # очищаем просроченный код
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
    return {"message": "Пароль изменён"}


@router.post("/set-password-by-invite")
async def set_password_by_invite(
    body: SetPasswordByInvite,
    db: Session = Depends(get_db),
):
    """
    Установка пароля по ссылке-приглашению (для новых родителей).
    Токен приходит в ссылке из приглашения.
    """
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

