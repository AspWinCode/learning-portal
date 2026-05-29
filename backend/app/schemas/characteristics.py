from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CharacteristicStatus
from app.schemas.students import StudentResponse
from app.schemas.users import UserResponse


class CharacteristicField(BaseModel):
    name: str
    label: str
    type: str
    required: bool = False
    options: Optional[List[str]] = None


class CharacteristicTemplateCreate(BaseModel):
    name: str
    fields: List[CharacteristicField]


class CharacteristicTemplateResponse(BaseModel):
    id: int
    name: str
    fields: List[CharacteristicField]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class CharacteristicCreate(BaseModel):
    student_id: int
    month: int = Field(..., ge=1, le=12)
    year: int
    data: Dict[str, Any]


class CharacteristicUpdate(BaseModel):
    data: Optional[Dict[str, Any]] = None
    status: Optional[CharacteristicStatus] = None


class CharacteristicApprove(BaseModel):
    comment: Optional[str] = None


class CharacteristicReject(BaseModel):
    comment: str


class CharacteristicResponse(BaseModel):
    id: int
    student_id: int
    trainer_id: int
    month: int
    year: int
    data: Dict[str, Any]
    status: CharacteristicStatus
    admin_comment: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None
    student: Optional[StudentResponse] = None
    trainer: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [name for name in globals() if not name.startswith("_")]
