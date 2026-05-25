from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.schemas.abonements import AbonementResponse
from app.schemas.common import (
    DiscountType,
    EventRegistrationStatus,
    EventStatus,
    InvoiceStatus,
    LeadStatus,
    LeadTaskStatus,
)
from app.schemas.finance import (
    BankPaymentImportRequest,
    BankPaymentImportResponse,
    BankPaymentItem,
    BankTransactionApplyRequest,
    BankTransactionExpenseCategoryUpdate,
    BankTransactionResponse,
    PhonePaymentBindingCreate,
    TochkaImportRequest,
)
from app.schemas.groups import LessonCallResultUpdate
from app.schemas.owner_dashboard import LeadAIInsightResponse


class AbsenceFollowUpResponse(BaseModel):
    id: int
    lesson_attendance_id: int
    student_id: int
    group_id: int
    lesson_date: date
    stage: str
    absence_reason: Optional[str] = None
    absence_comment: Optional[str] = None
    makeup_group_id: Optional[int] = None
    makeup_lesson_date: Optional[date] = None
    makeup_custom_lesson_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    student_name: Optional[str] = None
    group_name: Optional[str] = None
    program_name: Optional[str] = None
    makeup_group_name: Optional[str] = None
    makeup_custom_lesson_id: Optional[int] = None
    makeup_custom_lesson_title: Optional[str] = None

    class Config:
        from_attributes = True


class AbsenceFollowUpStageUpdate(BaseModel):
    stage: str


class AbsenceMakeupAssign(BaseModel):
    makeup_group_id: int
    makeup_lesson_date: date


class MakeupSuggestionItem(BaseModel):
    group_id: int
    group_name: str
    program_name: Optional[str] = None
    lesson_date: date
    day_of_week: int
    start_time: Optional[str] = None


class PublicMakeupSlotsResponse(BaseModel):
    absence_id: int
    student_id: int
    student_name: Optional[str] = None
    original_group_name: Optional[str] = None
    missed_lesson_date: date
    available_slots: List[MakeupSuggestionItem] = []


class PublicMakeupSelectionRequest(BaseModel):
    token: str
    makeup_group_id: int
    makeup_lesson_date: date


class CustomLessonStudentItem(BaseModel):
    student_id: int
    planned_absence_id: Optional[int] = None


class CustomLessonCreate(BaseModel):
    title: str
    lesson_date: date
    start_time: str
    end_time: Optional[str] = None
    trainer_id: int
    lesson_type: str = "makeup"
    comment: Optional[str] = None
    students: List[CustomLessonStudentItem]


class CustomLessonUpdate(BaseModel):
    title: Optional[str] = None
    lesson_date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    trainer_id: Optional[int] = None
    lesson_type: Optional[str] = None
    comment: Optional[str] = None
    students: Optional[List[CustomLessonStudentItem]] = None


class CustomLessonStudentResponse(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    planned_absence_id: Optional[int] = None
    attended: bool
    absence_reason: Optional[str] = None
    absence_comment: Optional[str] = None


class CustomLessonResponse(BaseModel):
    id: int
    title: str
    lesson_date: date
    start_time: str
    end_time: Optional[str] = None
    trainer_id: int
    trainer_name: Optional[str] = None
    lesson_type: str
    comment: Optional[str] = None
    students: List[CustomLessonStudentResponse]

    class Config:
        from_attributes = True


class CustomLessonAttendanceItem(BaseModel):
    lesson_student_id: int
    attended: bool
    absence_reason: Optional[str] = None
    absence_comment: Optional[str] = None


class CustomLessonAttendancePayload(BaseModel):
    lesson_id: int
    items: List[CustomLessonAttendanceItem]


class ProgramMakeupCompatibilityResponse(BaseModel):
    id: int
    source_program_id: int
    target_program_id: int
    source_program_name: Optional[str] = None
    target_program_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProgramMakeupCompatibilityCreate(BaseModel):
    source_program_id: int
    target_program_id: int


class PaymentStatusItem(BaseModel):
    student_id: int
    student_name: str
    card_id: Optional[int] = None
    next_payment_date: Optional[date] = None
    learning_period_start: Optional[date] = None
    status: str


class PaymentStatusSummary(BaseModel):
    overdue_3_count: int
    overdue_10_count: int


class StudentFreezeCreate(BaseModel):
    freeze_start: date
    freeze_end: date


class StudentFreezeResponse(BaseModel):
    id: int
    student_id: int
    freeze_start: date
    freeze_end: date
    created_at: datetime

    class Config:
        from_attributes = True


class CloseByFactPreview(BaseModel):
    lessons_attended_in_period: int
    amount: float
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class CloseByFactConfirm(BaseModel):
    confirm: bool = True


class LeadBase(BaseModel):
    contact_name: str
    phone: str
    parent_full_name: str = Field(..., min_length=1)
    parent_phone: str = Field(..., min_length=1)
    child_full_name: Optional[str] = None
    child_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: str = Field(..., min_length=1)
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
    owner_id: Optional[int] = None
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
    max_user_id: Optional[int] = None


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
    id: int
    owner_id: int
    person_id: Optional[int] = None
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
    post_visit_stage: Optional[str] = None
    post_visit_review: Optional[str] = None
    post_visit_project_date: Optional[datetime] = None
    converted_to_student_id: Optional[int] = None
    student_card_id: Optional[int] = None
    questionnaire_data: Optional[Dict[str, Any]] = None
    max_user_id: Optional[int] = None
    last_contact_at: Optional[datetime] = None
    ai_insight: Optional[LeadAIInsightResponse] = None

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


class SalesClassBase(BaseModel):
    name: str
    is_active: bool = True


class SalesClassCreate(BaseModel):
    name: str


class SalesClassUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class SalesClassResponse(SalesClassBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AccountTemplateCreate(BaseModel):
    name: str
    format: Literal["group", "individual"]


class AccountTemplateResponse(BaseModel):
    id: int
    name: str
    format: str
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


class StudentCardBase(BaseModel):
    student_id: Optional[int] = None
    student_full_name: str
    birth_date: Optional[date] = None
    student_phone: Optional[str] = None
    telegram: Optional[str] = None
    gender: Optional[str] = None
    on_grant: bool = False
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
    payment_link: Optional[str] = None
    abonement_id: Optional[int] = None
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0
    learning_period_start: Optional[date] = None
    next_payment_date: Optional[date] = None
    anketa_status: Optional[str] = None
    primary_for_bank_payments: bool = False


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
    payment_link: Optional[str] = None
    abonement_id: Optional[int] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    learning_period_start: Optional[date] = None
    next_payment_date: Optional[date] = None
    anketa_status: Optional[str] = None
    primary_for_bank_payments: Optional[bool] = None


class StudentCardResponse(StudentCardBase):
    id: int
    person_id: Optional[int] = None
    archived: bool
    anketa_status: str = "converted"
    parent_cabinet_open: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    abonement: Optional[AbonementResponse] = None

    class Config:
        from_attributes = True


class AnketaConvertRequest(BaseModel):
    use_existing_parent_id: Optional[int] = None
    use_existing_student_id: Optional[int] = None


class AnketaConvertResponse(BaseModel):
    card: StudentCardResponse
    student_id: int


class AnketaConvertConflictResponse(BaseModel):
    code: Literal["existing_parent", "existing_student"]
    message: str
    existing_parent_id: Optional[int] = None
    existing_students: Optional[List[Dict[str, Any]]] = None
    existing_student_id: Optional[int] = None


class LeadConvertToStudentResponse(BaseModel):
    student_id: int
    lead: LeadResponse


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


class SpecialistQuestionnaireRequest(BaseModel):
    parent_full_name: str = Field(..., min_length=1)
    parent_phone: str = Field(..., min_length=1)
    child_full_name: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    birth_date: Optional[date] = None
    child_phone: Optional[str] = None
    child_telegram: Optional[str] = None
    gender: Optional[str] = None
    school_name: Optional[str] = None
    school_class: Optional[str] = None
    parent_phone_2: Optional[str] = None
    parent_telegram: Optional[str] = None
    parent_email: Optional[EmailStr] = None
    student_email: Optional[EmailStr] = None
    preferred_messenger: Optional[str] = None
    comment: Optional[str] = None
    source: Optional[str] = None


class SpecialistQuestionnaireResponse(BaseModel):
    lead_id: int


class TildaLeadRequest(BaseModel):
    parent_full_name: str = Field(..., min_length=1, description="ФИО родителя")
    parent_phone: str = Field(..., min_length=1, description="Контактный телефон родителя")
    child_full_name: str = Field(..., min_length=1, description="ФИО ученика")
    kind: Literal["start", "base", "pro"] = Field("start")


class TildaLeadResponse(BaseModel):
    lead_id: int


class LeadPostVisitOutcomeRequest(BaseModel):
    outcome: Literal["agreed", "thinking", "declined"]
    follow_up_at: Optional[datetime] = None
    lost_reason: Optional[str] = None


class LeadPostVisitStageUpdate(BaseModel):
    stage: Literal["new", "project_offer", "course_offer", "project_agreed", "course_agreed", "declined"]
    review: Optional[str] = None
    project_date: Optional[datetime] = None
    decline_reason: Optional[str] = None


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


class LeadActivityCreate(BaseModel):
    type: str
    title: str
    description: Optional[str] = None
    channel: Optional[str] = None
    payload_json: Optional[dict] = None
    status_effect_from: Optional[str] = None
    status_effect_to: Optional[str] = None
    related_task_id: Optional[int] = None
    related_invoice_id: Optional[int] = None


class LeadActivityResponse(BaseModel):
    id: int
    lead_id: int
    type: str
    title: str
    description: Optional[str] = None
    channel: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None
    creator_name: Optional[str] = None
    payload_json: Optional[dict] = None
    status_effect_from: Optional[str] = None
    status_effect_to: Optional[str] = None
    related_task_id: Optional[int] = None
    related_invoice_id: Optional[int] = None

    class Config:
        from_attributes = True


class LeadNextAction(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    due_at: Optional[datetime] = None
    owner_name: Optional[str] = None
    task_id: Optional[int] = None
    state: str = "none"


class LeadSidebarSummary(BaseModel):
    contacts: dict = {}
    source: Optional[str] = None
    owner_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    upcoming_tasks: list = []
    latest_invoice: Optional[dict] = None


class LeadCardResponse(BaseModel):
    lead: LeadResponse
    next_action: LeadNextAction
    pinned_comment: Optional[str] = None
    sidebar: LeadSidebarSummary
    timeline_preview: list = []


__all__ = [name for name in globals() if not name.startswith("_")]
