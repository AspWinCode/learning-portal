from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.abonements import AbonementResponse
from app.schemas.common import DiscountType, StudentStatus
from app.schemas.programs import ProgramSummaryResponse
from app.schemas.users import UserResponse


class StudentBase(BaseModel):
    full_name: str


class StudentCreate(StudentBase):
    parent_id: Optional[int] = None
    abonement_id: Optional[int] = None
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    parent_id: Optional[int] = None
    status: Optional[StudentStatus] = None
    abonement_id: Optional[int] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    training_start_date: Optional[date] = None


class StudentResponse(StudentBase):
    id: int
    parent_id: Optional[int] = None
    from_lead_id: Optional[int] = None
    abonement_id: Optional[int] = None
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0
    status: StudentStatus
    training_start_date: Optional[date] = None
    created_at: datetime
    parent: Optional[UserResponse] = None
    abonement: Optional[AbonementResponse] = None
    programs: Optional[List[ProgramSummaryResponse]] = []
    in_group: bool = False

    model_config = ConfigDict(from_attributes=True)


class StudentListResponse(BaseModel):
    total: int
    items: List[StudentResponse]
    skip: int
    limit: int


class StudentWithParentParentPayload(BaseModel):
    id: Optional[int] = None
    full_name: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None


class StudentWithParentStudentPayload(BaseModel):
    full_name: str = Field(..., min_length=1)
    abonement_id: Optional[int] = None
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0


class StudentWithParentCreate(BaseModel):
    student: StudentWithParentStudentPayload
    parent: StudentWithParentParentPayload

    @field_validator("parent", mode="before")
    @classmethod
    def parent_allow_int(cls, v: Any) -> Any:
        if isinstance(v, int):
            return {"id": v, "full_name": "—", "email": None}
        return v


class ParentInfoInResponse(BaseModel):
    id: int
    full_name: str
    email: str


class StudentWithParentResponse(BaseModel):
    student: StudentResponse
    parent: ParentInfoInResponse


class InviteParentResponse(BaseModel):
    invite_link: str


class StudentAccountCreate(BaseModel):
    name: str


class StudentAccountUpdate(BaseModel):
    name: Optional[str] = None


class StudentAccountTransactionResponse(BaseModel):
    id: int
    account_id: int
    amount: float
    kind: str
    note: Optional[str] = None
    lesson_attendance_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StudentAccountResponse(BaseModel):
    id: int
    student_id: int
    name: str
    balance: float
    created_at: datetime
    updated_at: Optional[datetime] = None
    transactions: Optional[List[StudentAccountTransactionResponse]] = []

    model_config = ConfigDict(from_attributes=True)


class StudentAccountPaymentRequest(BaseModel):
    amount: float = Field(..., gt=0)
    note: Optional[str] = None


class StudentAccountDeductRequest(BaseModel):
    amount: float = Field(..., gt=0)
    note: Optional[str] = None
    lesson_attendance_id: Optional[int] = None


class StudentActivityLogResponse(BaseModel):
    id: int
    student_id: int
    event_type: str
    title: str
    description: Optional[str] = None
    created_at: datetime
    actor_user_id: Optional[int] = None
    actor_user_name: Optional[str] = None
    payload_json: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [name for name in globals() if not name.startswith("_")]
