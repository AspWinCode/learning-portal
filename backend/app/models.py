from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Date, Time, ForeignKey, Text, Float, Enum as SQLEnum, JSON, UniqueConstraint, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator
from datetime import datetime
import os
import enum
from app.database import Base

# ╨Я╤А╨╕ ╨╖╨░╨┐╨╕╤Б╨╕ ╨▓ PostgreSQL ╨▓╤Б╨╡╨│╨┤╨░ ╨╛╤В╨┐╤А╨░╨▓╨╗╤П╨╡╨╝ lowercase (value), ╤В.╨║. ╨╝╨╕╨│╤А╨░╤Ж╨╕╨╕ ╤Б╨╛╨╖╨┤╨░╤О╤В enum ╤Б 'active', 'archived'.
# ╨Я╤А╨╕ ╤З╤В╨╡╨╜╨╕╨╕ ╨┤╤А╨░╨╣╨▓╨╡╤А ╨╝╨╛╨╢╨╡╤В ╨▓╨╡╤А╨╜╤Г╤В╤М 'ACTIVE' тАФ ╨╜╨╛╤А╨╝╨░╨╗╨╕╨╖╤Г╨╡╨╝ ╨▓ TypeDecorator.


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OWNER = "owner"
    TRAINER = "trainer"
    PARENT = "parent"
    GUEST = "guest"
    SALES = "sales"


class StudentStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class GroupStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class ProgramStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TopicStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacteristicStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AbonementStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class StudentProgramLinkStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class DiscountType(str, enum.Enum):
    NONE = "none"
    AMOUNT = "amount"
    PERCENT = "percent"

def _enum_values(enum_cls):
    """
    Persist Python Enum values (e.g. "admin") instead of names (e.g. "ADMIN").
    This must match Alembic migrations that created PostgreSQL enum types with lowercase values.
    """
    return [e.value for e in enum_cls]


def _lowercase_enum_type(enum_cls, size=20, use_uppercase_for_pg=False):
    """TypeDecorator: ╨┐╤А╨╕ ╨╖╨░╨┐╨╕╤Б╨╕ ╨▓ PostgreSQL (╨╡╤Б╨╗╨╕ use_uppercase_for_pg=True) тАФ ╨╕╨╝╤П (ACTIVE), ╨╕╨╜╨░╤З╨╡ value (active);
    ╨┐╤А╨╕ ╤З╤В╨╡╨╜╨╕╨╕ ╨┐╤А╨╕╨╜╨╕╨╝╨░╨╡╤В ╨╗╤О╨▒╨╛╨╣ ╤А╨╡╨│╨╕╤Б╤В╤А."""
    enum_map = {e.value.lower(): e for e in enum_cls}
    name_to_enum = {e.name.upper(): e for e in enum_cls}

    class _Type(TypeDecorator):
        impl = String(size)
        cache_ok = False

        def process_bind_param(self, value, dialect):
            if value is None:
                return None
            if isinstance(value, enum_cls):
                if use_uppercase_for_pg and dialect and dialect.name in ("postgresql", "postgres"):
                    return value.name  # ACTIVE
                return value.value  # active
            if isinstance(value, str):
                v = value.strip().lower() if value else None
                if v and v in enum_map:
                    e = enum_map[v]
                    if use_uppercase_for_pg and dialect and dialect.name in ("postgresql", "postgres"):
                        return e.name
                    return e.value
                return value
            return value

        def process_result_value(self, value, dialect):
            if value is None:
                return None
            if isinstance(value, str):
                v = value.strip()
                if v.lower() in enum_map:
                    return enum_map[v.lower()]
                if v.upper() in name_to_enum:
                    return name_to_enum[v.upper()]
            return value

    return _Type


_StudentStatusType = _lowercase_enum_type(StudentStatus, use_uppercase_for_pg=False)
_GroupStatusType = _lowercase_enum_type(GroupStatus, use_uppercase_for_pg=False)
_ProgramStatusType = _lowercase_enum_type(ProgramStatus, use_uppercase_for_pg=False)
_TopicStatusType = _lowercase_enum_type(TopicStatus, use_uppercase_for_pg=False)
_CharacteristicStatusType = _lowercase_enum_type(CharacteristicStatus, use_uppercase_for_pg=False)
_StudentProgramLinkStatusType = _lowercase_enum_type(StudentProgramLinkStatus, use_uppercase_for_pg=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole, name="userrole", values_callable=_enum_values), nullable=False)
    is_active = Column(Boolean, default=True)
    telegram_chat_id = Column(BigInteger, nullable=True, index=True)
    telegram_link_code = Column(String, nullable=True, index=True)
    telegram_link_code_expires_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_code_hash = Column(String, nullable=True, index=True)
    password_reset_expires_at = Column(DateTime(timezone=True), nullable=True)
    invite_token_hash = Column(String, nullable=True, index=True)
    invite_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    trainer_rate = Column(Float, nullable=True)
    trainer_lessons = Column(Integer, nullable=True)

    # Relationships
    students = relationship("Student", back_populates="parent", foreign_keys="Student.parent_id")
    trainer_groups = relationship("Group", back_populates="trainer", foreign_keys="Group.trainer_id")
    program_trainers = relationship("ProgramTrainer", back_populates="trainer")
    grades = relationship("Grade", back_populates="trainer")
    characteristics = relationship("Characteristic", back_populates="trainer")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=True)
    status = Column(_StudentStatusType(), default=StudentStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    parent = relationship("User", back_populates="students", foreign_keys=[parent_id])
    group_students = relationship("GroupStudent", back_populates="student")
    student_programs = relationship("StudentProgram", back_populates="student")
    lesson_attendances = relationship("LessonAttendance", back_populates="student", cascade="all, delete-orphan")
    # ╨Р╨║╤В╨╕╨▓╨╜╤Л╨╡ ╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨┐╤А╨╛╨│╤А╨░╨╝╨╝ (╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╤Г╤О╤В╤Б╤П ╨▓ programs ╤З╨╡╤А╨╡╨╖ property ╨╜╨╕╨╢╨╡)
    grades = relationship("Grade", back_populates="student")
    characteristics = relationship("Characteristic", back_populates="student")
    abonement = relationship("Abonement", back_populates="students")
    accounts = relationship("StudentAccount", back_populates="student", cascade="all, delete-orphan")

    @property
    def programs(self):
        """╨б╨┐╨╕╤Б╨╛╨║ ╨░╨║╤В╨╕╨▓╨╜╤Л╤Е ╨┐╤А╨╛╨│╤А╨░╨╝╨╝ ╤Г╤З╨╡╨╜╨╕╨║╨░ (╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╤Б╨╛ status=active)."""
        from app.models import StudentProgramLinkStatus
        return [
            sp.program for sp in self.student_programs
            if getattr(sp, "status", StudentProgramLinkStatus.ACTIVE) == StudentProgramLinkStatus.ACTIVE
        ]


class StudentAccountTransactionKind(str, enum.Enum):
    PAYMENT = "payment"
    LESSON_DEDUCTION = "lesson_deduction"


class StudentAccount(Base):
    """Счет ученика: можно иметь несколько (группа, индивидуально и т.д.)."""
    __tablename__ = "student_accounts"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    balance = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    student = relationship("Student", back_populates="accounts")
    transactions = relationship(
        "StudentAccountTransaction",
        back_populates="account",
        order_by="StudentAccountTransaction.created_at.desc()",
        cascade="all, delete-orphan",
    )


class StudentAccountTransaction(Base):
    """Операция по счету: пополнение или списание за занятие."""
    __tablename__ = "student_account_transactions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("student_accounts.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    kind = Column(
        SQLEnum(StudentAccountTransactionKind, name="studentaccounttransactionkind", values_callable=_enum_values),
        nullable=False,
    )
    note = Column(String, nullable=True)
    lesson_attendance_id = Column(Integer, ForeignKey("lesson_attendance.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("StudentAccount", back_populates="transactions")


class Abonement(Base):
    __tablename__ = "abonements"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Float, default=0.0, nullable=False)
    lessons_count = Column(Integer, nullable=True)  # число занятий в абонементе (для расчёта списания за занятие); по умолчанию 8
    discount_type = Column(
        SQLEnum(DiscountType, name="discounttype", values_callable=_enum_values),
        default=DiscountType.NONE,
        nullable=False
    )
    discount_value = Column(Float, default=0.0, nullable=False)
    status = Column(
        SQLEnum(AbonementStatus, name="abonementstatus", values_callable=_enum_values),
        default=AbonementStatus.ACTIVE,
        nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    students = relationship("Student", back_populates="abonement")


# --- Sales domain ---


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    NO_ANSWER = "no_answer"
    DEMO = "demo"
    INVOICE_SENT = "invoice_sent"
    WON = "won"
    LOST = "lost"
    # ╨Т╨╛╤А╨╛╨╜╨║╨░ ╨┐╤А╨╛╨┤╨░╨╢ (╨╜╨╛╨▓╨░╤П)
    THINKING = "thinking"  # ╨Я╨╛╨┤╤Г╨╝╨░╤О╤В
    REFUSED = "refused"  # ╨Ю╤В╨║╨░╨╖╨░╨╗╤Б╤П
    TRIAL_SCHEDULED = "trial_scheduled"  # ╨Ч╨░╨┐╨╕╤Б╨░╨╗╤Б╤П ╨╜╨░ ╨┐╤А╨╛╨▒╨╜╨╛╨╡
    EVENT_REGISTERED = "event_registered"  # ╨Ч╨░╨┐╨╕╤Б╨░╨╗╤Б╤П ╨╜╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡
    DECIDED_IMMEDIATELY = "decided_immediately"  # ╨а╨╡╤И╨╕╨╗ ╨╖╨░╨╜╨╕╨╝╨░╤В╤М╤Б╤П ╤Б╤А╨░╨╖╤Г


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    contact_name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    parent_full_name = Column(String, nullable=True)
    child_full_name = Column(String, nullable=True)
    parent_phone = Column(String, nullable=True)
    child_phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    city = Column(String, nullable=True)
    school_name = Column(String, nullable=True, index=True)
    school_class = Column(String, nullable=True, index=True)
    outreach_at = Column(DateTime(timezone=True), nullable=True, index=True)
    outreach_minutes = Column(Integer, nullable=True)
    status = Column(
        SQLEnum(LeadStatus, name="leadstatus", values_callable=_enum_values),
        default=LeadStatus.NEW,
        nullable=False,
        index=True,
    )
    source = Column(String, nullable=True)
    communication_channel = Column(String, nullable=True)
    status_option_id = Column(Integer, ForeignKey("lead_statuses.id"), nullable=True, index=True)
    source_id = Column(Integer, ForeignKey("lead_sources.id"), nullable=True, index=True)
    referral_name = Column(String, nullable=True)
    tags = Column(JSON, nullable=True)
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=True)
    desired_slot = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    next_contact_at = Column(DateTime(timezone=True), nullable=True, index=True)
    no_answer_attempt = Column(Integer, nullable=True, index=True)  # 1, 2 ╨╕╨╗╨╕ 3 ╨┤╨╗╤П ╨║╨╛╨╗╨╛╨╜╨║╨╕ ╨Э╨╡╨┤╨╛╨╖╨▓╨╛╨╜
    pause_reason = Column(String, nullable=True)
    lost_reason = Column(String, nullable=True)
    questionnaire_filled = Column(Boolean, default=False, nullable=False, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=True, index=True)
    b2b_event_id = Column(Integer, ForeignKey("b2b_school_events.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User")
    abonement = relationship("Abonement")
    source_ref = relationship("LeadSource")
    status_option = relationship("LeadStatusOption")
    b2b_school = relationship("B2BSchool", back_populates="leads")
    b2b_event = relationship("B2BSchoolEvent", back_populates="leads", foreign_keys=[b2b_event_id])
    tasks = relationship("LeadTask", back_populates="lead", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="lead", cascade="all, delete-orphan")
    communications = relationship("LeadCommunication", back_populates="lead", cascade="all, delete-orphan")


class LeadTaskStatus(str, enum.Enum):
    OPEN = "open"
    DONE = "done"


class LeadTask(Base):
    __tablename__ = "lead_tasks"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("lead_task_templates.id"), nullable=True, index=True)
    status_option_id = Column(Integer, ForeignKey("lead_task_statuses.id"), nullable=True, index=True)
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    status = Column(
        SQLEnum(LeadTaskStatus, name="leadtaskstatus", values_callable=_enum_values),
        default=LeadTaskStatus.OPEN,
        nullable=False,
        index=True,
    )
    note = Column(Text, nullable=True)
    channel = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    lead = relationship("Lead", back_populates="tasks")
    owner = relationship("User")
    template = relationship("LeadTaskTemplate")
    status_option = relationship("LeadTaskStatusOption")


class LeadSource(Base):
    __tablename__ = "lead_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesCity(Base):
    __tablename__ = "sales_cities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesSchool(Base):
    __tablename__ = "sales_schools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesInstruction(Base):
    __tablename__ = "sales_instructions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    created_by = relationship("User")


class SalesInstructionImage(Base):
    __tablename__ = "sales_instruction_images"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(LargeBinary, nullable=False)
    content_type = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StudentCard(Base):
    """Личная карточка ученика (sales/CRM). Видят: sales, admin, owner."""
    __tablename__ = "student_cards"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True, unique=True)
    # Обучающийся (ФИО из карточки — используется для отображения везде, если карточка привязана)
    student_full_name = Column(String, nullable=False, index=True)
    birth_date = Column(Date, nullable=True)
    student_phone = Column(String, nullable=True)
    telegram = Column(String, nullable=True)
    gender = Column(String, nullable=True)  # м/ж или male/female
    on_grant = Column(Boolean, default=False, nullable=False)
    format_type = Column(String, nullable=True)  # group / individual
    city = Column(String, nullable=True)
    school = Column(String, nullable=True)
    grade = Column(String, nullable=True)
    # Заказчик
    parent_full_name = Column(String, nullable=True)
    parent_phone = Column(String, nullable=True)
    parent_phone_2 = Column(String, nullable=True)
    parent_telegram = Column(String, nullable=True)
    parent_email = Column(String, nullable=True)
    student_email = Column(String, nullable=True)
    preferred_messenger = Column(String, nullable=True)  # max / telegram / sms
    comment = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # откуда пришел
    # Только owner: абонемент и скидка
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=True, index=True)
    discount_type = Column(
        SQLEnum(DiscountType, name="discounttype", values_callable=_enum_values),
        default=DiscountType.NONE,
        nullable=False,
    )
    discount_value = Column(Float, default=0.0, nullable=False)
    archived = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    abonement = relationship("Abonement")
    student = relationship("Student", backref="student_card")


class TochkaAppliedPayment(Base):
    """Уже зачисленные платежи из Точка Банк — чтобы не дублировать при автоматическом импорте."""
    __tablename__ = "tochka_applied_payments"
    __table_args__ = (
        UniqueConstraint(
            "tochka_account_id", "payment_date", "amount", "payer_name",
            name="uq_tochka_applied_account_date_amount_payer",
        ),
    )
    id = Column(Integer, primary_key=True, index=True)
    tochka_account_id = Column(String(64), nullable=False, index=True)
    payment_date = Column(String(32), nullable=False)  # как в выписке (YYYY-MM-DD или ISO)
    amount = Column(Float, nullable=False)
    payer_name = Column(String(512), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    student_account_id = Column(Integer, ForeignKey("student_accounts.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadTaskTemplate(Base):
    __tablename__ = "lead_task_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadTaskStatusOption(Base):
    __tablename__ = "lead_task_statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_closed = Column(Boolean, default=False, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadStatusOption(Base):
    __tablename__ = "lead_statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    base_status = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadInfoTemplate(Base):
    __tablename__ = "lead_info_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    body = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadCommunication(Base):
    __tablename__ = "lead_communications"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("lead_info_templates.id"), nullable=True, index=True)
    channel = Column(String, nullable=False, default="messenger")
    message = Column(Text, nullable=False)
    pause_reason = Column(String, nullable=True)
    follow_up_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lead = relationship("Lead", back_populates="communications")
    sender = relationship("User")
    template = relationship("LeadInfoTemplate")


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="RUB", nullable=False)
    status = Column(
        SQLEnum(InvoiceStatus, name="invoicestatus", values_callable=_enum_values),
        default=InvoiceStatus.DRAFT,
        nullable=False,
        index=True,
    )
    email_to = Column(String, nullable=True)
    link = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    lead = relationship("Lead", back_populates="invoices")
    abonement = relationship("Abonement")


class EventStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class EventRegistrationStatus(str, enum.Enum):
    REGISTERED = "registered"
    CANCELLED = "cancelled"


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=False, index=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=True)
    capacity = Column(Integer, nullable=True)
    status = Column(
        SQLEnum(EventStatus, name="eventstatus", values_callable=_enum_values),
        default=EventStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    registrations = relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")
    creator = relationship("User")


class EventRegistration(Base):
    __tablename__ = "event_registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "lead_id", name="uq_event_lead_registration"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(
        SQLEnum(EventRegistrationStatus, name="eventregistrationstatus", values_callable=_enum_values),
        default=EventRegistrationStatus.REGISTERED,
        nullable=False,
        index=True,
    )
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    event = relationship("Event", back_populates="registrations")
    lead = relationship("Lead")
    owner = relationship("User")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    direction = Column(String, nullable=True, index=True)  # first_step, specialist, expert, backend, frontend, oge, ege
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(_GroupStatusType(), default=GroupStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    trainer = relationship("User", back_populates="trainer_groups", foreign_keys=[trainer_id])
    group_students = relationship("GroupStudent", back_populates="group")
    # ╨г╨┤╨╛╨▒╨╜╨░╤П ╤Б╨▓╤П╨╖╤М "╨╝╨╜╨╛╨│╨╕╨╡-╨║╨╛-╨╝╨╜╨╛╨│╨╕╨╝" ╨┤╨╗╤П ╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╨░╤Ж╨╕╨╕ ╨▓ GroupResponse.students
    students = relationship("Student", secondary="group_students", viewonly=True)
    group_programs = relationship("GroupProgram", back_populates="group")
    group_schedules = relationship("GroupSchedule", back_populates="group", cascade="all, delete-orphan")
    lesson_attendances = relationship("LessonAttendance", back_populates="group", cascade="all, delete-orphan")
    # ╨г╨┤╨╛╨▒╨╜╨░╤П ╤Б╨▓╤П╨╖╤М ╨┤╨╗╤П ╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╨░╤Ж╨╕╨╕ ╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╜╤Л╤Е ╨┐╤А╨╛╨│╤А╨░╨╝╨╝ ╨│╤А╤Г╨┐╨┐╤Л
    programs = relationship("Program", secondary="group_programs", viewonly=True)


class GroupStudent(Base):
    __tablename__ = "group_students"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    group = relationship("Group", back_populates="group_students")
    student = relationship("Student", back_populates="group_students")


class GroupSchedule(Base):
    """╨а╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡ ╨╖╨░╨╜╤П╤В╨╕╨╣ ╨│╤А╤Г╨┐╨┐╤Л: ╨┤╨╡╨╜╤М ╨╜╨╡╨┤╨╡╨╗╨╕ ╨╕ ╨▓╤А╨╡╨╝╤П (0=╨Я╨╜, 6=╨Т╤Б)."""
    __tablename__ = "group_schedules"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="group_schedules")


# --- Проекты (канбан для admin/owner/sales): родители или ученики по этапам воронки ---
class Project(Base):
    """Проект: название, даты, описание; тип — родители или ученики; этапы (колонки канбана)."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    entity_type = Column(String, nullable=False, index=True)  # "parent" | "student"
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    archived = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])
    stages = relationship("ProjectStage", back_populates="project", order_by="ProjectStage.position", cascade="all, delete-orphan")
    cards = relationship("ProjectCard", back_populates="project", cascade="all, delete-orphan")


class ProjectStage(Base):
    """Этап воронки (колонка канбана): название и порядок."""
    __tablename__ = "project_stages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    position = Column(Integer, default=0, nullable=False)

    project = relationship("Project", back_populates="stages")
    cards = relationship("ProjectCard", back_populates="stage", cascade="all, delete-orphan", order_by="ProjectCard.position")


class ProjectCard(Base):
    """Карточка в канбане: привязка к родителю (user) или ученику (student)."""
    __tablename__ = "project_cards"
    __table_args__ = (UniqueConstraint("project_id", "entity_type", "entity_id", name="uq_project_card_entity"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("project_stages.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(String, nullable=False, index=True)  # "parent" | "student"
    entity_id = Column(Integer, nullable=False, index=True)  # user.id для parent, student.id для student
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="cards")
    stage = relationship("ProjectStage", back_populates="cards")


class LessonAttendance(Base):
    """╨Я╨╛╤Б╨╡╤Й╨░╨╡╨╝╨╛╤Б╤В╤М: ╨║╤В╨╛ ╨▒╤Л╨╗ ╨╜╨░ ╨╖╨░╨╜╤П╤В╨╕╨╕ (╨│╤А╤Г╨┐╨┐╨░ + ╨┤╨░╤В╨░)."""
    __tablename__ = "lesson_attendance"
    __table_args__ = (UniqueConstraint("group_id", "lesson_date", "student_id", name="uq_lesson_attendance_group_date_student"),)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    lesson_date = Column(Date, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    attended = Column(Boolean, default=True, nullable=False)
    late = Column(Boolean, default=False, nullable=False)  # опоздает / в пути
    call_result = Column(String(32), nullable=True)  # contacted | no_answer | cancelled | technical | messenger
    call_result_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="lesson_attendances")
    student = relationship("Student", back_populates="lesson_attendances")


class AbsenceFollowUpStage(str, enum.Enum):
    MISSED = "missed"           # Пропустил
    ASSIGNED = "assigned"       # Назначили отработку
    MADE_UP = "made_up"         # Отработал
    MISSED_MAKEUP = "missed_makeup"  # Пропустил отработку


class AbsenceFollowUp(Base):
    """Пропуск занятия: воронка для sales — Пропустил → Назначили → Отработал → Пропустил отработку."""
    __tablename__ = "absence_follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    lesson_attendance_id = Column(Integer, ForeignKey("lesson_attendance.id"), nullable=False, unique=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    lesson_date = Column(Date, nullable=False, index=True)
    stage = Column(String, nullable=False, index=True, server_default="missed")  # missed / assigned / made_up / missed_makeup
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    lesson_attendance = relationship("LessonAttendance")
    student = relationship("Student")
    group = relationship("Group")


class Program(Base):
    __tablename__ = "programs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    version = Column(Integer, default=1)
    parent_program_id = Column(Integer, ForeignKey("programs.id"), nullable=True)
    status = Column(_ProgramStatusType(), default=ProgramStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    modules = relationship("Module", back_populates="program", cascade="all, delete-orphan")
    group_programs = relationship("GroupProgram", back_populates="program")
    student_programs = relationship("StudentProgram", back_populates="program")
    program_trainers = relationship("ProgramTrainer", back_populates="program")


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=False)
    name = Column(String, nullable=False)
    order = Column(Integer, default=0)
    status = Column(_ProgramStatusType(), default=ProgramStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    program = relationship("Program", back_populates="modules")
    topics = relationship("Topic", back_populates="module", cascade="all, delete-orphan")


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    final_result = Column(Text, nullable=True)  # ╨Ш╤В╨╛╨│ ╤В╨╡╨╝╤Л ╨┤╨╗╤П ╤Г╤З╨╡╨╜╨╕╨║╨░
    order = Column(Integer, default=0)
    status = Column(_TopicStatusType(), default=TopicStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    module = relationship("Module", back_populates="topics")
    grades = relationship("Grade", back_populates="topic")


class ProgramTrainer(Base):
    __tablename__ = "program_trainers"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    program = relationship("Program", back_populates="program_trainers")
    trainer = relationship("User", back_populates="program_trainers")


class GroupProgram(Base):
    __tablename__ = "group_programs"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    group = relationship("Group", back_populates="group_programs")
    program = relationship("Program", back_populates="group_programs")


class StudentProgram(Base):
    __tablename__ = "student_programs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=False)
    status = Column(
        _StudentProgramLinkStatusType(),
        default=StudentProgramLinkStatus.ACTIVE,
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("Student", back_populates="student_programs")
    program = relationship("Program", back_populates="student_programs")


class Grade(Base):
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    grade = Column(Float, nullable=False)
    comment = Column(Text, nullable=True)
    date = Column(DateTime(timezone=True), nullable=False, default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("Student", back_populates="grades")
    topic = relationship("Topic", back_populates="grades")
    trainer = relationship("User", back_populates="grades")


class Characteristic(Base):
    __tablename__ = "characteristics"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)
    data = Column(JSON, nullable=False)  # ╨Ф╨╕╨╜╨░╨╝╨╕╤З╨╡╤Б╨║╨╕╨╡ ╨┐╨╛╨╗╤П ╤Д╨╛╤А╨╝╤Л
    status = Column(_CharacteristicStatusType(), default=CharacteristicStatus.DRAFT)
    admin_comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    student = relationship("Student", back_populates="characteristics")
    trainer = relationship("User", back_populates="characteristics")


class CharacteristicTemplate(Base):
    __tablename__ = "characteristic_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    fields = Column(JSON, nullable=False)  # ╨б╤Е╨╡╨╝╨░ ╨┐╨╛╨╗╨╡╨╣ ╤Д╨╛╤А╨╝╤Л
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ActionLog(Base):
    __tablename__ = "action_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# B2B Schools pipeline (conveyor stages for owner)
class B2BSchoolPipelineStage(str, enum.Enum):
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


class B2BSchoolFriendshipDegree(str, enum.Enum):
    UNKNOWN = "unknown"           # ╨╜╨╡ ╨╖╨╜╨░╨╡╨╝ ╨┤╤А╤Г╨│ ╨┤╤А╤Г╨│╨░
    INDIRECT = "indirect"         # ╨╖╨╜╨░╨╡╨╝ ╨║╨╛╤Б╨▓╨╡╨╜╨╜╨╛
    FRIENDS = "friends"           # ╨┤╤А╤Г╨╢╨╕╨╝
    ENEMIES = "enemies"           # ╨▓╤А╨░╨│╨╕


class B2BSchool(Base):
    __tablename__ = "b2b_schools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    director = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True, index=True)
    student_count = Column(Integer, nullable=True)
    friendship_degree = Column(String(32), nullable=True, index=True)  # B2BSchoolFriendshipDegree.value
    pipeline_stage = Column(
        String(32),
        nullable=False,
        default=B2BSchoolPipelineStage.NEW.value,
        index=True,
    )
    next_step = Column(Text, nullable=True)
    next_step_date = Column(Date, nullable=True, index=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    source = Column(String(256), nullable=True)
    priority = Column(String(64), nullable=True)
    preference = Column(String(32), nullable=True)  # online, offline, any
    support_letter_status = Column(String(32), nullable=True)  # not_needed, requested, received, archive
    partnership = Column(JSON, nullable=True)  # checklist: {invited, agreement_sent, signed_school, signed_both, originals_received, icon_on_site, active_partner}
    event_dates = Column(JSON, nullable=True)
    meeting_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    meeting_outcomes = Column(Text, nullable=True)
    walkthrough_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    manager = relationship("User", foreign_keys=[manager_id])
    leads = relationship("Lead", back_populates="b2b_school", foreign_keys="Lead.b2b_school_id")
    school_contacts = relationship("B2BSchoolContact", back_populates="school", cascade="all, delete-orphan")
    interactions = relationship("B2BSchoolInteraction", back_populates="school", cascade="all, delete-orphan")
    school_events = relationship("B2BSchoolEvent", back_populates="school", cascade="all, delete-orphan")


class B2BSchoolInteractionType(str, enum.Enum):
    CALL = "call"
    LETTER = "letter"
    MEETING = "meeting"


class B2BSchoolInteraction(Base):
    __tablename__ = "b2b_school_interactions"

    id = Column(Integer, primary_key=True, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=False, index=True)
    type = Column(String(32), nullable=False)
    happened_at = Column(DateTime(timezone=True), nullable=False)
    summary = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    school = relationship("B2BSchool", back_populates="interactions")
    created_by = relationship("User", foreign_keys=[created_by_id])


class B2BSchoolEvent(Base):
    __tablename__ = "b2b_school_events"

    id = Column(Integer, primary_key=True, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=False, index=True)
    format = Column(String(32), nullable=False)  # offline, online, hybrid
    online_type = Column(String(32), nullable=True)  # webinar, olympiad, open_doors
    event_dates = Column(JSON, nullable=True)  # list of date strings
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    school = relationship("B2BSchool", back_populates="school_events")
    leads = relationship("Lead", back_populates="b2b_event", foreign_keys="Lead.b2b_event_id")


class B2BSchoolContact(Base):
    __tablename__ = "b2b_school_contacts"

    id = Column(Integer, primary_key=True, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=False, index=True)
    full_name = Column(String, nullable=False)
    position = Column(String, nullable=True)
    phone = Column(String, nullable=False)
    phone_extra = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    school = relationship("B2BSchool", back_populates="school_contacts")


class B2BProject(Base):
    __tablename__ = "b2b_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    location = Column(String, nullable=True)
    main_city = Column(String, nullable=True, index=True)
    cities = Column(JSON, nullable=True)  # ╤Б╨┐╨╕╤Б╨╛╨║ ╨│╨╛╤А╨╛╨┤╨╛╨▓, ╨║╨╛╤В╨╛╤А╤Л╨╡ ╨▓╤Е╨╛╨┤╤П╤В ╨▓ ╨┐╤А╨╛╨╡╨║╤В
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ╨Т╨╛╤А╨╛╨╜╨║╨╕ ╨┤╨╗╤П ╤А╨╛╨╗╨╕ owner: ╤В╨╕╨┐╤Л ╨╕ ╤Н╤В╨░╨┐╤Л ╨╖╨░╨┤╨░╨╜╤Л ╨▓ ╨║╨╛╨┤╨╡ (owner_funnels router)
class TaskStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(512), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    repeat_enabled = Column(Boolean, nullable=False, server_default="false")
    repeat_frequency = Column(String(20), nullable=True)
    repeat_days = Column(JSON, nullable=True)
    repeat_end_type = Column(String(20), nullable=True)
    repeat_end_after_count = Column(Integer, nullable=True)
    repeat_end_until = Column(Date, nullable=True)

    subtasks = relationship("TaskTemplateSubtask", back_populates="template", cascade="all, delete-orphan")
    students = relationship("TaskTemplateStudent", back_populates="template", cascade="all, delete-orphan")


class TaskTemplateSubtask(Base):
    __tablename__ = "task_template_subtasks"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("task_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String(1024), nullable=False)
    order = Column(Integer, nullable=False, server_default="0")

    template = relationship("TaskTemplate", back_populates="subtasks")


class TaskTemplateStudent(Base):
    __tablename__ = "task_template_students"

    template_id = Column(Integer, ForeignKey("task_templates.id", ondelete="CASCADE"), primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True)

    template = relationship("TaskTemplate", back_populates="students")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False)
    template_id = Column(Integer, ForeignKey("task_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(20), nullable=False, server_default="active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    repeat_enabled = Column(Boolean, nullable=False, server_default="false")
    repeat_frequency = Column(String(20), nullable=True)
    repeat_days = Column(JSON, nullable=True)
    repeat_end_type = Column(String(20), nullable=True)
    repeat_end_after_count = Column(Integer, nullable=True)
    repeat_end_until = Column(Date, nullable=True)

    subtasks = relationship("TaskSubtask", back_populates="task", cascade="all, delete-orphan")
    students = relationship("TaskStudent", back_populates="task", cascade="all, delete-orphan")


class TaskSubtask(Base):
    __tablename__ = "task_subtasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String(1024), nullable=False)
    completed = Column(Boolean, nullable=False, server_default="false")
    order = Column(Integer, nullable=False, server_default="0")

    task = relationship("Task", back_populates="subtasks")


class TaskStudent(Base):
    __tablename__ = "task_students"

    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True)

    task = relationship("Task", back_populates="students")


# Owner funnel constants (owner_funnels router)
OWNER_FUNNEL_SUPPORT_LETTERS = "support_letters"   # ╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ╨┐╨╕╤Б╤М╨╝╨░ ╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕ ╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ╨┐╨╕╤Б╤М╨╝╨░ ╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕
OWNER_FUNNEL_THANK_YOU_LETTERS = "thank_you_letters"  # ╨Я╨╕╤Б╤М╨╝╨░ ╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╨╕
OWNER_FUNNEL_EVENTS = "events"  # ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П

# ╨н╤В╨░╨┐╤Л ╨┐╨╛ ╤В╨╕╨┐╨░╨╝ ╨▓╨╛╤А╨╛╨╜╨╛╨║ (value ╨┤╨╗╤П ╨С╨Ф -> label ╨┤╨╗╤П UI)
OWNER_FUNNEL_STAGES = {
    OWNER_FUNNEL_SUPPORT_LETTERS: [
        ("new", "╨Э╨╛╨▓╨╛╨╡"),
        ("letter_created", "╨б╨╛╨╖╨┤╨░╨╗ ╨┐╨╕╤Б╤М╨╝╨╛"),
        ("letter_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗ ╨┐╨╕╤Б╤М╨╝╨╛"),
        ("letter_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗ ╨┐╨╕╤Б╤М╨╝╨╛"),
    ],
    OWNER_FUNNEL_THANK_YOU_LETTERS: [
        ("new", "╨Э╨╛╨▓╨╛╨╡"),
        ("thank_you_formed", "╨б╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╨╗╨╕ ╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╤М"),
        ("thank_you_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕ ╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╤М"),
        ("school_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗╨░ ╤И╨║╨╛╨╗╨░"),
    ],
    OWNER_FUNNEL_EVENTS: [
        ("new", "╨Э╨╛╨▓╤Л╨╡"),
        ("contact_found", "╨Ъ╨╛╨╜╤В╨░╨║╤В ╨╜╨░╨╣╨┤╨╡╨╜"),
        ("letter_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕ ╨┐╨╕╤Б╤М╨╝╨╛"),
        ("reply_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗╨╕ ╨╛╤В╨▓╨╡╤В╨╜╨╛╨╡ ╨┐╨╕╤Б╤М╨╝╨╛"),
        ("reached_by_phone", "╨Ф╨╛╨╖╨▓╨╛╨╜╨╕╨╗╨╕╤Б╤М"),
        ("not_reached", "╨Э╨╡╨┤╨╛╨╖╨▓╨╛╨╜╨╕╨╗╨╕╤Б╤М"),
        ("meeting_agreed", "╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М ╨╜╨░ ╨▓╤Б╤В╤А╨╡╤З╤Г"),
        ("agreement_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕ ╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡ ╨╜╨░ ╤Б╨╛╨│╨╗╨░╤Б╨╛╨▓╨░╨╜╨╕╨╡"),
        ("agreement_approved", "╨б╨╛╨│╨╗╨░╤Б╨╛╨▓╨░╨╗╨╕ ╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡"),
        ("agreement_signed", "╨Я╨╛╨┤╨┐╨╕╤Б╨░╨╗╨╕ ╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡"),
        ("trip_agreed", "╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М ╨╜╨░ ╨┐╨╛╤Е╨╛╨┤"),
        ("info_sent_to_parents", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╤О ╨▓ ╤З╨░╤В╤Л ╤А╨╛╨┤╨╕╤В╨╡╨╗╨╡╨╣"),
        ("leads_collected", "╨б╨╛╨▒╤А╨░╨╗╨╕ ╨╗╨╕╨┤╨╛╨▓"),
        ("rejected", "╨Ю╤В╨║╨░╨╖╨░╨╗╨╕"),
    ],
}

# ╨н╤В╨░╨┐╤Л ╨▓╨╛╤А╨╛╨╜╨║╨╕ ┬л╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П┬╗, ╨┐╤А╨╕ ╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡ ╨╜╨░ ╨║╨╛╤В╨╛╤А╤Л╨╡ ╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╨╡╤В╤Б╤П popup ╨╕ ╤Б╨╛╤Е╤А╨░╨╜╤П╤О╤В╤Б╤П ╨┤╨░╨╜╨╜╤Л╨╡ ╨▓ card_data
OWNER_FUNNEL_EVENTS_POPUP_STAGES = {
    "contact_found": ["contact_fio", "contact_phone", "contact_comment"],
    "reply_received": ["reply_comment"],
    "meeting_agreed": ["meeting_date"],
    "trip_agreed": ["trip_date"],
    "leads_collected": ["leads_count"],
}


class OwnerFunnelEvent(Base):
    """╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡ тАФ ╤Б╨░╨╝╨░ ╨▓╨╛╤А╨╛╨╜╨║╨░ (╨┤╨╛╤Б╨║╨░ ╤Б ╤Н╤В╨░╨┐╨░╨╝╨╕). ╨Ъ╨░╤А╤В╨╛╤З╨║╨╕ ╨▓ ╨║╨╛╨╗╨╛╨╜╨║╨░╤Е тАФ ╤Н╨╗╨╡╨╝╨╡╨╜╤В╤Л owner_funnel_items ╤Б event_id."""
    __tablename__ = "owner_funnel_events"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(512), nullable=False)
    event_dates = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OwnerFunnelItem(Base):
    """╨н╨╗╨╡╨╝╨╡╨╜╤В ╨▓╨╛╤А╨╛╨╜╨║╨╕ owner (╨┐╨╕╤Б╤М╨╝╨░ ╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕, ╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╨╕; ╨┤╨╗╤П ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╣ тАФ ╨║╨░╤А╤В╨╛╤З╨║╨░ ╨▓╨╜╤Г╤В╤А╨╕ ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П)."""
    __tablename__ = "owner_funnel_items"

    id = Column(Integer, primary_key=True, index=True)
    funnel_type = Column(String(64), nullable=False, index=True)  # support_letters | thank_you_letters | events
    event_id = Column(Integer, ForeignKey("owner_funnel_events.id", ondelete="CASCADE"), nullable=True, index=True)  # ╤В╨╛╨╗╤М╨║╨╛ ╨┤╨╗╤П events
    stage = Column(String(64), nullable=False, index=True)
    title = Column(String(512), nullable=True)
    comment = Column(Text, nullable=True)
    card_data = Column(JSON, nullable=True)  # ╨┤╨╗╤П events: ╨║╨╛╨╜╤В╨░╨║╤В, ╨┤╨░╤В╤Л ╤Н╤В╨░╨┐╨╛╨▓ ╨╕ ╤В.╨┤. (event_name/event_dates тАФ ╤Г ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

