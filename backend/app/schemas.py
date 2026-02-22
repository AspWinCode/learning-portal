from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date, time
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    OWNER = "owner"
    TRAINER = "trainer"
    PARENT = "parent"
    GUEST = "guest"
    SALES = "sales"


class StudentStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacteristicStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AbonementStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class DiscountType(str, Enum):
    NONE = "none"
    AMOUNT = "amount"
    PERCENT = "percent"


# Sales enums
class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    NO_ANSWER = "no_answer"
    DEMO = "demo"
    INVOICE_SENT = "invoice_sent"
    WON = "won"
    LOST = "lost"
    THINKING = "thinking"
    REFUSED = "refused"
    TRIAL_SCHEDULED = "trial_scheduled"
    EVENT_REGISTERED = "event_registered"
    DECIDED_IMMEDIATELY = "decided_immediately"


class LeadTaskStatus(str, Enum):
    OPEN = "open"
    DONE = "done"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class EventStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class EventRegistrationStatus(str, Enum):
    REGISTERED = "registered"
    CANCELLED = "cancelled"


# Auth schemas
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
    new_password: str


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
    new_password: str = Field(..., min_length=6)


# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    trainer_rate: Optional[float] = None
    trainer_lessons: Optional[int] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    trainer_rate: Optional[float] = None
    trainer_lessons: Optional[int] = None

    class Config:
        from_attributes = True


# Abonement schemas
class AbonementBase(BaseModel):
    name: str
    price: float = 0.0
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0


class AbonementCreate(AbonementBase):
    pass


class AbonementUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    status: Optional[AbonementStatus] = None


class AbonementResponse(AbonementBase):
    id: int
    status: AbonementStatus
    created_at: datetime

    class Config:
        from_attributes = True


# Student schemas
class StudentBase(BaseModel):
    full_name: str


class StudentCreate(StudentBase):
    parent_id: Optional[int] = None
    abonement_id: Optional[int] = None


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    parent_id: Optional[int] = None
    status: Optional[StudentStatus] = None
    abonement_id: Optional[int] = None


class StudentResponse(StudentBase):
    id: int
    parent_id: Optional[int] = None
    abonement_id: Optional[int] = None
    status: StudentStatus
    created_at: datetime
    parent: Optional[UserResponse] = None
    abonement: Optional[AbonementResponse] = None
    programs: Optional[List["ProgramSummaryResponse"]] = []

    class Config:
        from_attributes = True


# Создание ученика вместе с родителем (композитный сценарий)
class StudentWithParentParentPayload(BaseModel):
    id: Optional[int] = None  # если задан — используем существующего
    full_name: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None  # обязателен при создании нового


class StudentWithParentStudentPayload(BaseModel):
    full_name: str = Field(..., min_length=1)
    abonement_id: Optional[int] = None


class StudentWithParentCreate(BaseModel):
    student: StudentWithParentStudentPayload
    parent: StudentWithParentParentPayload

    @field_validator("parent", mode="before")
    @classmethod
    def parent_allow_int(cls, v: Any) -> Any:
        """Если клиент по ошибке отправил parent как id (int), приводим к объекту."""
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


# Student accounts (счета учеников)
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

    class Config:
        from_attributes = True


class StudentAccountResponse(BaseModel):
    id: int
    student_id: int
    name: str
    balance: float
    created_at: datetime
    updated_at: Optional[datetime] = None
    transactions: Optional[List[StudentAccountTransactionResponse]] = []

    class Config:
        from_attributes = True


class StudentAccountPaymentRequest(BaseModel):
    amount: float
    note: Optional[str] = None


class StudentAccountDeductRequest(BaseModel):
    amount: float
    note: Optional[str] = None
    lesson_attendance_id: Optional[int] = None


class BankPaymentItem(BaseModel):
    """Один платёж из выписки (Точка Банк и др.): дата, сумма, ФИО плательщика (имя отчество или полное)."""
    date: str  # YYYY-MM-DD или любой формат, сохраняем в note
    amount: float
    payer_name: str


class BankPaymentImportRequest(BaseModel):
    payments: List[BankPaymentItem]


class BankPaymentImportResponse(BaseModel):
    """Результат зачисления платежей по матчу ФИО плательщика с карточкой ученика (parent_full_name)."""
    applied: List[dict]  # [{ "payer_name", "amount", "date", "student_id", "account_id", "student_name" }]
    no_match: List[dict]  # [{ "payer_name", "amount", "date" }]
    ambiguous: List[dict]  # [{ "payer_name", "amount", "date", "candidates": [{ "student_id", "student_name", "parent_full_name" }] }]


# Пропуски (воронка для sales)
class AbsenceFollowUpResponse(BaseModel):
    id: int
    lesson_attendance_id: int
    student_id: int
    group_id: int
    lesson_date: date
    stage: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    student_name: Optional[str] = None
    group_name: Optional[str] = None

    class Config:
        from_attributes = True


class AbsenceFollowUpStageUpdate(BaseModel):
    stage: str  # missed / assigned / made_up / missed_makeup


# --- Sales schemas ---


class LeadBase(BaseModel):
    contact_name: str
    phone: str
    parent_full_name: str = Field(..., min_length=1)  # ╨д╨Ш╨Ю ╤А╨╛╨┤╨╕╤В╨╡╨╗╤П тАФ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛
    parent_phone: str = Field(..., min_length=1)  # ╨в╨╡╨╗╨╡╤Д╨╛╨╜ ╤А╨╛╨┤╨╕╤В╨╡╨╗╤П тАФ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜
    child_full_name: Optional[str] = None
    child_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: str = Field(..., min_length=1)  # ╨У╨╛╤А╨╛╨┤ тАФ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜
    school_name: Optional[str] = None
    school_class: Optional[str] = None
    outreach_at: Optional[datetime] = None
    outreach_minutes: Optional[int] = None
    source: Optional[str] = None
    communication_channel: Optional[str] = None
    source_id: Optional[int] = None
    referral_name: Optional[str] = None
    tags: Optional[List[str]] = None
    abonement_id: Optional[int] = None
    desired_slot: Optional[str] = None
    comment: Optional[str] = None
    next_contact_at: Optional[datetime] = None
    questionnaire_filled: Optional[bool] = None


class LeadCreate(LeadBase):
    owner_id: Optional[int] = None  # admin may set; sales defaults to self
    status_option_id: Optional[int] = None


class LeadUpdate(BaseModel):
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    parent_full_name: Optional[str] = None
    child_full_name: Optional[str] = None
    parent_phone: Optional[str] = None
    child_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: Optional[str] = None
    school_name: Optional[str] = None
    school_class: Optional[str] = None
    outreach_at: Optional[datetime] = None
    outreach_minutes: Optional[int] = None
    source: Optional[str] = None
    communication_channel: Optional[str] = None
    source_id: Optional[int] = None
    referral_name: Optional[str] = None
    tags: Optional[List[str]] = None
    abonement_id: Optional[int] = None
    desired_slot: Optional[str] = None
    comment: Optional[str] = None
    next_contact_at: Optional[datetime] = None
    no_answer_attempt: Optional[int] = None
    pause_reason: Optional[str] = None
    status: Optional[LeadStatus] = None
    status_option_id: Optional[int] = None
    lost_reason: Optional[str] = None
    questionnaire_filled: Optional[bool] = None


class LeadStatusOptionBase(BaseModel):
    name: str
    base_status: LeadStatus
    is_active: bool = True


class LeadStatusOptionCreate(BaseModel):
    name: str
    base_status: LeadStatus


class LeadStatusOptionUpdate(BaseModel):
    name: Optional[str] = None
    base_status: Optional[LeadStatus] = None
    is_active: Optional[bool] = None


class LeadStatusOptionResponse(LeadStatusOptionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class LeadResponse(BaseModel):
    """╨б╤Е╨╡╨╝╨░ ╨╛╤В╨▓╨╡╤В╨░ ╨┐╨╛ ╨╗╨╕╨┤╤Г: ╨▓╤Б╨╡ ╨┐╨╛╨╗╤П ╨║╨╛╨╜╤В╨░╨║╤В╨░ ╨┤╨╛╨┐╤Г╤Б╨║╨░╤О╤В None ╨┤╨╗╤П ╤Б╤В╨░╤А╤Л╤Е ╨╖╨░╨┐╨╕╤Б╨╡╨╣ ╨▓ ╨С╨Ф."""
    id: int
    owner_id: int
    contact_name: str
    phone: str
    parent_full_name: Optional[str] = None
    child_full_name: Optional[str] = None
    parent_phone: Optional[str] = None
    child_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: Optional[str] = None
    school_name: Optional[str] = None
    school_class: Optional[str] = None
    outreach_at: Optional[datetime] = None
    outreach_minutes: Optional[int] = None
    source: Optional[str] = None
    communication_channel: Optional[str] = None
    source_id: Optional[int] = None
    referral_name: Optional[str] = None
    tags: Optional[List[str]] = None
    abonement_id: Optional[int] = None
    desired_slot: Optional[str] = None
    comment: Optional[str] = None
    next_contact_at: Optional[datetime] = None
    no_answer_attempt: Optional[int] = None
    questionnaire_filled: bool = False
    status: LeadStatus
    status_option_id: Optional[int] = None
    status_option: Optional[LeadStatusOptionResponse] = None
    pause_reason: Optional[str] = None
    lost_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    abonement: Optional[AbonementResponse] = None

    class Config:
        from_attributes = True


class LeadTaskBase(BaseModel):
    template_id: Optional[int] = None
    status_option_id: Optional[int] = None
    note: Optional[str] = None
    channel: Optional[str] = None
    due_at: Optional[datetime] = None


class LeadTaskCreate(LeadTaskBase):
    pass


class LeadTaskUpdate(BaseModel):
    status: Optional[LeadTaskStatus] = None
    note: Optional[str] = None
    channel: Optional[str] = None
    due_at: Optional[datetime] = None


class LeadTaskResponse(LeadTaskBase):
    id: int
    lead_id: int
    owner_id: int
    status: LeadTaskStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LeadSourceBase(BaseModel):
    name: str
    is_active: bool = True


class LeadSourceCreate(BaseModel):
    name: str


class LeadSourceUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class LeadSourceResponse(LeadSourceBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SalesCityBase(BaseModel):
    name: str
    is_active: bool = True


class SalesCityCreate(BaseModel):
    name: str


class SalesCityUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class SalesCityResponse(SalesCityBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SalesSchoolBase(BaseModel):
    name: str
    is_active: bool = True


class SalesSchoolCreate(BaseModel):
    name: str


class SalesSchoolUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class SalesSchoolResponse(SalesSchoolBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class LeadTaskTemplateBase(BaseModel):
    name: str
    is_active: bool = True


class LeadTaskTemplateCreate(BaseModel):
    name: str


class LeadTaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class LeadTaskTemplateResponse(LeadTaskTemplateBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class LeadTaskStatusOptionBase(BaseModel):
    name: str
    is_closed: bool = False
    is_active: bool = True


class LeadTaskStatusOptionCreate(BaseModel):
    name: str
    is_closed: bool = False


class LeadTaskStatusOptionUpdate(BaseModel):
    name: Optional[str] = None
    is_closed: Optional[bool] = None
    is_active: Optional[bool] = None


class LeadTaskStatusOptionResponse(LeadTaskStatusOptionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class LeadImportResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str] = []


class LeadInfoTemplateCreate(BaseModel):
    name: str
    body: str


class LeadInfoTemplateUpdate(BaseModel):
    name: Optional[str] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None


class LeadInfoTemplateResponse(BaseModel):
    id: int
    name: str
    body: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SalesInstructionBase(BaseModel):
    title: str
    body: str


class SalesInstructionCreate(SalesInstructionBase):
    pass


class SalesInstructionUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None


class SalesInstructionResponse(SalesInstructionBase):
    id: int
    created_by_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Student cards (личные карточки ученика)
class StudentCardBase(BaseModel):
    student_id: Optional[int] = None  # привязка к ученику — ФИО из карточки показывается везде
    student_full_name: str
    birth_date: Optional[date] = None
    student_phone: Optional[str] = None
    telegram: Optional[str] = None
    gender: Optional[str] = None
    on_grant: bool = False
    format_type: Optional[str] = None  # group / individual
    city: Optional[str] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    parent_full_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_phone_2: Optional[str] = None
    parent_telegram: Optional[str] = None
    parent_email: Optional[str] = None
    student_email: Optional[str] = None
    preferred_messenger: Optional[str] = None  # max / telegram / sms
    comment: Optional[str] = None
    source: Optional[str] = None  # откуда пришел
    abonement_id: Optional[int] = None
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0


class StudentCardCreate(StudentCardBase):
    pass


class StudentCardUpdate(BaseModel):
    student_id: Optional[int] = None
    student_full_name: Optional[str] = None
    birth_date: Optional[date] = None
    student_phone: Optional[str] = None
    telegram: Optional[str] = None
    gender: Optional[str] = None
    on_grant: Optional[bool] = None
    format_type: Optional[str] = None
    city: Optional[str] = None
    school: Optional[str] = None
    grade: Optional[str] = None
    parent_full_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_phone_2: Optional[str] = None
    parent_telegram: Optional[str] = None
    parent_email: Optional[str] = None
    student_email: Optional[str] = None
    preferred_messenger: Optional[str] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    abonement_id: Optional[int] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None


class StudentCardResponse(StudentCardBase):
    id: int
    archived: bool
    parent_cabinet_open: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    abonement: Optional["AbonementResponse"] = None

    class Config:
        from_attributes = True


class OpenParentCabinetResponse(BaseModel):
    already_open: bool = False
    student_id: int
    parent_id: int
    invite_link: Optional[str] = None


class StudentCardImportResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str] = []


class LeadSendInfoRequest(BaseModel):
    template_id: Optional[int] = None
    channel: str = "messenger"
    message: str
    follow_up_at: datetime
    pause_reason: Optional[str] = None


class LeadQuickCommunicationCreate(BaseModel):
    channel: str = "messenger"
    message: Optional[str] = None
    follow_up_at: Optional[datetime] = None


class LeadContactResultRequest(BaseModel):
    outcome: str
    note: Optional[str] = None
    follow_up_at: Optional[datetime] = None


class LeadPostVisitOutcomeRequest(BaseModel):
    outcome: Literal["agreed", "thinking", "declined"]
    follow_up_at: Optional[datetime] = None
    lost_reason: Optional[str] = None


class LeadCommunicationResponse(BaseModel):
    id: int
    lead_id: int
    sent_by: int
    template_id: Optional[int] = None
    channel: str
    message: str
    pause_reason: Optional[str] = None
    follow_up_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class SalesQueueTaskItem(BaseModel):
    task_id: int
    lead_id: int
    lead_name: str
    lead_phone: str
    due_at: Optional[datetime] = None
    note: Optional[str] = None


class SalesQueueRegistrationItem(BaseModel):
    registration_id: int
    event_id: int
    event_title: str
    lead_id: int
    lead_name: str
    starts_at: datetime
    note: Optional[str] = None


class SalesSchoolConversionItem(BaseModel):
    school_name: str
    leads_count: int
    won_count: int
    conversion_percent: int
    classes_count: int
    outreach_minutes_total: int


class SalesDashboardResponse(BaseModel):
    kpi_new_leads: int
    kpi_dozvon_percent: float
    kpi_info_sent: int
    kpi_need_push_urgent: int
    kpi_need_push_today: int
    kpi_need_push_overdue: int
    kpi_registered_event: int
    kpi_came_count: int
    kpi_no_show_count: int
    overdue_followups: List[SalesQueueTaskItem]
    call_today: List[SalesQueueTaskItem]
    messenger_replies: List[SalesQueueTaskItem]
    confirm_participation: List[SalesQueueRegistrationItem]
    outreach_schools_month: int
    outreach_classes_month: int
    outreach_minutes_month: int
    top_schools_conversion_month: List[SalesSchoolConversionItem]


class FollowUpItemResponse(BaseModel):
    task_id: int
    lead_id: int
    lead_name: str
    lead_phone: str
    lead_source: Optional[str] = None
    due_at: Optional[datetime] = None
    status: LeadTaskStatus
    channel: Optional[str] = None
    note: Optional[str] = None


class LeadPushStatsResponse(BaseModel):
    lead_id: int
    total_steps: int
    done_steps: int
    progress_percent: int


class InvoiceCreate(BaseModel):
    abonement_id: int
    email_to: Optional[EmailStr] = None
    currency: Optional[str] = "RUB"


class InvoiceResponse(BaseModel):
    id: int
    lead_id: int
    abonement_id: int
    amount: float
    currency: str
    status: InvoiceStatus
    email_to: Optional[EmailStr] = None
    link: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    capacity: Optional[int] = None


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[EventStatus] = None


class EventResponse(EventBase):
    id: int
    status: EventStatus
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EventRegistrationCreate(BaseModel):
    lead_id: int
    note: Optional[str] = None


class EventRegistrationResponse(BaseModel):
    id: int
    event_id: int
    lead_id: int
    owner_id: int
    status: EventRegistrationStatus
    note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    lead: Optional[LeadResponse] = None

    class Config:
        from_attributes = True


# Group schemas
class GroupBase(BaseModel):
    name: str
    direction: Optional[str] = None


class GroupScheduleCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time


class GroupScheduleResponse(BaseModel):
    id: int
    group_id: int
    day_of_week: int
    start_time: time
    end_time: time

    class Config:
        from_attributes = True


class GroupCreate(GroupBase):
    trainer_id: int
    student_ids: Optional[List[int]] = []
    schedules: Optional[List[GroupScheduleCreate]] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    direction: Optional[str] = None
    trainer_id: Optional[int] = None
    status: Optional[str] = None
    schedules: Optional[List[GroupScheduleCreate]] = None


class GroupResponse(GroupBase):
    id: int
    trainer_id: int
    status: str
    created_at: datetime
    trainer: Optional[UserResponse] = None
    students: Optional[List[StudentResponse]] = []
    programs: Optional[List["ProgramSummaryResponse"]] = []
    schedules: Optional[List[GroupScheduleResponse]] = []

    class Config:
        from_attributes = True


# --- Проекты (канбан для admin/owner/sales) ---
class ProjectBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    entity_type: Literal["parent", "student"]


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    archived: Optional[bool] = None


class ProjectStageResponse(BaseModel):
    id: int
    project_id: int
    name: str
    position: int

    class Config:
        from_attributes = True


class ProjectCardResponse(BaseModel):
    id: int
    project_id: int
    stage_id: int
    entity_type: str
    entity_id: int
    position: int
    created_at: datetime
    display_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectStageCreate(BaseModel):
    name: str
    position: Optional[int] = 0


class ProjectCardMove(BaseModel):
    stage_id: int
    position: Optional[int] = 0


class ProjectResponse(ProjectBase):
    id: int
    created_by_id: int
    archived: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[UserResponse] = None
    stages: Optional[List[ProjectStageResponse]] = []
    card_count: Optional[int] = None

    class Config:
        from_attributes = True


# Lesson attendance
class LessonAttendanceItem(BaseModel):
    student_id: int
    attended: bool
    late: Optional[bool] = False


class LessonAttendanceSave(BaseModel):
    group_id: int
    lesson_date: date
    attendances: List[LessonAttendanceItem]


class LessonCallResultUpdate(BaseModel):
    """Результат дозвона по одному ученику (менеджер)."""
    group_id: int
    lesson_date: date
    student_id: int
    call_result: str  # contacted | no_answer | cancelled | technical | messenger


# ╨Ч╨░╨╜╤П╤В╨╕╨╡ ╨┤╨╗╤П ╨║╨░╨╗╨╡╨╜╨┤╨░╤А╤П ╤В╤А╨╡╨╜╨╡╤А╨░ (╨│╤А╤Г╨┐╨┐╨░ + ╤Б╨╗╨╛╤В ╨┐╨╛ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤О + ╤Г╤З╨╡╨╜╨╕╨║╨╕ ╨╕ ╨╛╤В╨╝╨╡╤В╨║╨╕)
class TrainerLessonSlotResponse(BaseModel):
    group_id: int
    group_name: str
    program_name: Optional[str] = None
    day_of_week: int
    start_time: time
    end_time: time
    lesson_date: date
    students: List[Dict[str, Any]]  # [{ id, full_name, attended: bool | None }]

    class Config:
        from_attributes = True


# Program schemas
class ProgramSummaryResponse(BaseModel):
    id: int
    name: str
    version: int
    status: str

    class Config:
        from_attributes = True

class TopicBase(BaseModel):
    name: str
    description: Optional[str] = None
    final_result: Optional[str] = None
    order: int = 0


class TopicCreate(TopicBase):
    pass


class TopicResponse(TopicBase):
    id: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ModuleBase(BaseModel):
    name: str
    order: int = 0


class ModuleCreate(ModuleBase):
    topics: List[TopicCreate] = []


class ModuleResponse(ModuleBase):
    id: int
    status: str
    topics: List[TopicResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ProgramBase(BaseModel):
    name: str


class ProgramCreate(ProgramBase):
    modules: List[ModuleCreate] = []
    trainer_ids: Optional[List[int]] = []


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    modules: Optional[List[ModuleCreate]] = None


class ProgramResponse(ProgramBase):
    id: int
    version: int
    parent_program_id: Optional[int] = None
    status: str
    created_at: datetime
    modules: List[ModuleResponse] = []

    class Config:
        from_attributes = True


# Grade schemas
class GradeBase(BaseModel):
    grade: float = Field(..., ge=0, le=5)
    comment: Optional[str] = None
    date: datetime


class GradeCreate(GradeBase):
    student_id: int
    topic_id: int


class GradeUpdate(BaseModel):
    grade: Optional[float] = Field(None, ge=0, le=5)
    comment: Optional[str] = None
    date: Optional[datetime] = None


class GradeResponse(GradeBase):
    id: int
    student_id: int
    topic_id: int
    trainer_id: int
    created_at: datetime
    student: Optional[StudentResponse] = None
    topic: Optional[TopicResponse] = None
    trainer: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# Characteristic schemas
class CharacteristicField(BaseModel):
    name: str
    label: str
    type: str  # text, number, select, etc.
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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


# Search and filter schemas
class SearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    students: List[StudentResponse] = []
    groups: List[GroupResponse] = []
    trainers: List[UserResponse] = []


# Settings schemas
class LogoResponse(BaseModel):
    data_url: Optional[str] = None


class LogoUpdate(BaseModel):
    data_url: str


# Report schemas
class ReportRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    student_ids: Optional[List[int]] = None
    trainer_ids: Optional[List[int]] = None
    format: str = "xlsx"  # xlsx or csv


# B2B Schools (conveyor stages)
class B2BSchoolPipelineStage(str, Enum):
    NEW = "new"
    FIND_CONTACTS = "find_contacts"
    FIRST_CONTACT = "first_contact"
    CONTACT_FOUND = "contact_found"
    LETTER_SENT = "letter_sent"
    MEETING_SCHEDULED = "meeting_scheduled"
    AGREEMENT = "agreement"
    MEETING_HELD = "meeting_held"
    PERMISSION_RECEIVED = "permission_received"
    EVENT_SCHEDULED = "event_scheduled"
    WALKTHROUGH_SCHEDULED = "walkthrough_scheduled"
    EVENT_DONE = "event_done"
    WALKTHROUGH_DONE = "walkthrough_done"
    LEADS_RECEIVED = "leads_received"
    THANK_YOU = "thank_you"
    SUPPORT_LETTER_REQUESTED = "support_letter_requested"
    SUPPORT_LETTER_RECEIVED = "support_letter_received"
    PARTNERS = "partners"
    REJECTED = "rejected"


class B2BSchoolFriendshipDegree(str, Enum):
    UNKNOWN = "unknown"
    INDIRECT = "indirect"
    FRIENDS = "friends"
    ENEMIES = "enemies"


class B2BSchoolContactCreate(BaseModel):
    full_name: str
    position: Optional[str] = None
    phone: str
    phone_extra: Optional[str] = None


class B2BSchoolContactUpdate(BaseModel):
    full_name: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    phone_extra: Optional[str] = None


class B2BSchoolContactResponse(BaseModel):
    id: int
    b2b_school_id: int
    full_name: str
    position: Optional[str] = None
    phone: str
    phone_extra: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class B2BSchoolCreate(BaseModel):
    name: str
    director: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[B2BSchoolFriendshipDegree] = None
    pipeline_stage: B2BSchoolPipelineStage = B2BSchoolPipelineStage.NEW
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None  # online, offline, any
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None


class B2BSchoolUpdate(BaseModel):
    name: Optional[str] = None
    director: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[B2BSchoolFriendshipDegree] = None
    pipeline_stage: Optional[B2BSchoolPipelineStage] = None
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None
    support_letter_status: Optional[str] = None
    partnership: Optional[Dict[str, Any]] = None
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None


class B2BSchoolResponse(BaseModel):
    id: int
    name: str
    director: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[str] = None
    pipeline_stage: str
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    manager_full_name: Optional[str] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None
    support_letter_status: Optional[str] = None
    partnership: Optional[Dict[str, Any]] = None
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    leads_count: Optional[int] = None
    conversion_percent: Optional[float] = None
    contacts: Optional[List[B2BSchoolContactResponse]] = None

    class Config:
        from_attributes = True


class B2BLeadListItem(BaseModel):
    """Элемент списка лидов по B2B-школе для карточки."""
    id: int
    contact_name: str
    phone: str
    status: str
    source: Optional[str] = None
    source_event: Optional[str] = None  # мероприятие: тип и даты
    created_at: datetime

    class Config:
        from_attributes = True


class B2BSchoolInteractionCreate(BaseModel):
    """Создание записи журнала взаимодействий по школе."""
    type: str  # call, letter, meeting
    happened_at: datetime
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None


class B2BSchoolInteractionResponse(BaseModel):
    """Запись журнала взаимодействий."""
    id: int
    b2b_school_id: int
    type: str
    happened_at: datetime
    summary: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class B2BSchoolEventCreate(BaseModel):
    """Создание мероприятия B2B-школы."""
    format: str  # offline, online, hybrid
    online_type: Optional[str] = None  # webinar, olympiad, open_doors
    dates: Optional[List[str]] = None  # ["2025-03-01", "2025-03-15"]


class B2BSchoolEventResponse(BaseModel):
    """Мероприятие B2B-школы."""
    id: int
    b2b_school_id: int
    format: str
    online_type: Optional[str] = None
    event_dates: Optional[List[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class B2BSchoolImportResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str] = []


class B2BProjectBase(BaseModel):
    name: str
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None


class B2BProjectCreate(B2BProjectBase):
    pass


class B2BProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None


class B2BProjectResponse(BaseModel):
    id: int
    name: str
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Task manager (admin/owner/sales) ---
class TaskTemplateSubtaskResponse(BaseModel):
    id: int
    template_id: int
    text: str
    order: int

    class Config:
        from_attributes = True


class TaskTemplateCreate(BaseModel):
    name: str
    subtasks: Optional[List[dict]] = None  # [{"text": str, "order": int}]
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = False
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None  # weekdays 0-6 or month days 1-31
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subtasks: Optional[List[dict]] = None
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = None
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskTemplateResponse(BaseModel):
    id: int
    name: str
    created_by_id: int
    created_at: datetime
    subtasks: List[TaskTemplateSubtaskResponse]
    student_ids: List[int]
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[str] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None

    class Config:
        from_attributes = True


class TaskSubtaskResponse(BaseModel):
    id: int
    task_id: int
    text: str
    completed: bool
    order: int

    class Config:
        from_attributes = True


class TaskSubtaskUpdate(BaseModel):
    completed: Optional[bool] = None


class TaskCreate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    subtasks: Optional[List[dict]] = None
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = False
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[int] = None
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = None
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskResponse(BaseModel):
    id: int
    title: str
    template_id: Optional[int] = None
    created_by_id: int
    assigned_to_id: Optional[int] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    subtasks: List[TaskSubtaskResponse]
    student_ids: List[int]
    progress: float
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[str] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None

    class Config:
        from_attributes = True


# Owner funnels (support letters, thank you letters, events)
class OwnerFunnelTypeInfo(BaseModel):
    """╨в╨╕╨┐ ╨▓╨╛╤А╨╛╨╜╨║╨╕: id ╨╕ ╤Н╤В╨░╨┐╤Л ╨┤╨╗╤П ╨▓╤Л╨▒╨╛╤А╨░ ╨▓ UI."""
    id: str
    label: str
    stages: List[dict]  # [{"value": "new", "label": "╨Э╨╛╨▓╨╛╨╡"}, ...]


class OwnerFunnelEventCreate(BaseModel):
    event_name: str
    event_dates: Optional[str] = None


class OwnerFunnelEventResponse(BaseModel):
    id: int
    event_name: str
    event_dates: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OwnerFunnelItemCreate(BaseModel):
    funnel_type: str
    stage: str = "new"
    title: Optional[str] = None
    comment: Optional[str] = None
    event_id: Optional[int] = None  # ╨┤╨╗╤П ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П тАФ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛
    card_data: Optional[dict] = None


class OwnerFunnelItemUpdate(BaseModel):
    stage: Optional[str] = None
    title: Optional[str] = None
    comment: Optional[str] = None
    card_data: Optional[dict] = None
    # ╨┐╨╛╨╗╤П popup ╨┤╨╗╤П ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П (╨╝╨╡╤А╨╢╨░╤В╤Б╤П ╨▓ card_data ╨┐╤А╨╕ ╤Б╨╝╨╡╨╜╨╡ ╤Н╤В╨░╨┐╨░)
    contact_fio: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_comment: Optional[str] = None
    reply_comment: Optional[str] = None
    meeting_date: Optional[str] = None  # ISO date
    trip_date: Optional[str] = None
    leads_count: Optional[int] = None


class OwnerFunnelItemResponse(BaseModel):
    id: int
    funnel_type: str
    event_id: Optional[int] = None
    stage: str
    title: Optional[str] = None
    comment: Optional[str] = None
    card_data: Optional[dict] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

