from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordReset(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str = Field(..., min_length=8)


class ParentInviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1)


class ParentInviteResponse(BaseModel):
    user_id: int
    email: str
    full_name: str
    invite_link: str


class SetPasswordByInvite(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


__all__ = [name for name in globals() if not name.startswith("_")]
