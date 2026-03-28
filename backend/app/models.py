from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Date, Time, ForeignKey, Text, Float, Enum as SQLEnum, JSON, UniqueConstraint, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator
from datetime import datetime
import os
import enum
import uuid
from app.database import Base

# При записи в PostgreSQL всегда отправляем lowercase (value), т.к. миграции создают enum с 'active', 'archived'.
# При чтении драйвер может вернуть 'ACTIVE' — нормализуем в TypeDecorator.


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
    """TypeDecorator: ╨┐╤А╨╕╨╖╨░╨┐╨╕╤Б╨╕╨▓╨╡╤Б╨╗╨╕╨╕╨╝╤П╨╕╨╜╨░╤З╨╡
    ╨┐╤А╨╕╤З╤В╨╡╨╜╨╕╨╕╨┐╤А╨╕╨╜╨╕╨╝╨░╨╡╤В╨╗╤О╨▒╨╛╨╣╤А╨╡╨│╨╕╤Б╤В╤А"""
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
    trainer_rate = Column(Float, nullable=True)  # ставка за урок (групповой формат)
    trainer_rate_per_hour = Column(Float, nullable=True)  # ставка за час (индивидуальный формат)
    trainer_lessons = Column(Integer, nullable=True)
    # Профиль тренера (виден owner, admin, sales)
    phone = Column(String(32), nullable=True)
    phone_extra = Column(String(32), nullable=True)
    trainer_lesson_formats = Column(String(32), nullable=True)  # group | individual | both
    trainer_banks = Column(JSON, nullable=True)  # ["alfa","tinkoff","sberbank","vtb","ozon"]
    city = Column(String(64), nullable=True)
    trainer_telegram = Column(String(128), nullable=True)
    is_self_employed = Column(Boolean, default=False)
    is_ip = Column(Boolean, default=False)
    work_schedule = Column(Text, nullable=True)
    qualification = Column(Text, nullable=True)
    trainer_comment = Column(Text, nullable=True)

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
    from_lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True, index=True)
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=True)
    status = Column(_StudentStatusType(), default=StudentStatus.ACTIVE)
    training_start_date = Column(Date, nullable=True)  # с этой даты ученик в уроках; от неё считаются оплата и напоминания
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    parent = relationship("User", back_populates="students", foreign_keys=[parent_id])
    from_lead = relationship("Lead", foreign_keys=[from_lead_id])
    group_students = relationship("GroupStudent", back_populates="student")
    student_programs = relationship("StudentProgram", back_populates="student")
    lesson_attendances = relationship("LessonAttendance", back_populates="student", cascade="all, delete-orphan")
    # ╨Р╨║╤В╨╕╨▓╨╜╤Л╨╡╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╤Г╤О╤В╤Б╤П╨▓╤З╨╡╤А╨╡╨╖╨╜╨╕╨╢╨╡
    grades = relationship("Grade", back_populates="student")
    characteristics = relationship("Characteristic", back_populates="student")
    abonement = relationship("Abonement", back_populates="students")
    accounts = relationship("StudentAccount", back_populates="student", cascade="all, delete-orphan")

    @property
    def programs(self):
        """╨б╨┐╨╕╤Б╨╛╨║╨░╨║╤В╨╕╨▓╨╜╤Л╤Е╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Г╤З╨╡╨╜╨╕╨║╨░╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П╤Б╨╛"""
        from app.models import StudentProgramLinkStatus
        return [
            sp.program for sp in self.student_programs
            if getattr(sp, "status", StudentProgramLinkStatus.ACTIVE) == StudentProgramLinkStatus.ACTIVE
        ]


class StudentAccountTransactionKind(str, enum.Enum):
    PAYMENT = "payment"
    LESSON_DEDUCTION = "lesson_deduction"
    EXTRA_LESSON_DEDUCTION = "extra_lesson_deduction"  # списание за доп. занятие (сверх 8)


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
        SQLEnum(StudentAccountTransactionKind, values_callable=_enum_values, native_enum=False),
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
    # Формат абонемента: индивидуальный, пакет, групповой (используется при создании счетов/счетов ученика)
    abonement_format = Column(String(32), nullable=True)  # individual | package | group
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
    # ╨Т╨╛╤А╨╛╨╜╨║╨░╨┐╤А╨╛╨┤╨░╨╢╨╜╨╛╨▓╨░╤П
    THINKING = "thinking"  # ╨Я╨╛╨┤╤Г╨╝╨░╤О╤В
    REFUSED = "refused"  # ╨Ю╤В╨║╨░╨╖╨░╨╗╤Б╤П
    TRIAL_SCHEDULED = "trial_scheduled"  # ╨Ч╨░╨┐╨╕╤Б╨░╨╗╤Б╤П╨╜╨░╨┐╤А╨╛╨▒╨╜╨╛╨╡
    EVENT_REGISTERED = "event_registered"  # ╨Ч╨░╨┐╨╕╤Б╨░╨╗╤Б╤П╨╜╨░╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡
    DECIDED_IMMEDIATELY = "decided_immediately"  # ╨а╨╡╤И╨╕╨╗╨╖╨░╨╜╨╕╨╝╨░╤В╤М╤Б╤П╤Б╤А╨░╨╖╤Г


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
    no_answer_attempt = Column(Integer, nullable=True, index=True)  # 1, 2 ╨╕╨╗╨╕╨┤╨╗╤П╨║╨╛╨╗╨╛╨╜╨║╨╕╨Э╨╡╨┤╨╛╨╖╨▓╨╛╨╜
    pause_reason = Column(String, nullable=True)
    lost_reason = Column(String, nullable=True)
    questionnaire_filled = Column(Boolean, default=False, nullable=False, index=True)
    questionnaire_data = Column(JSON, nullable=True)  # полные данные из формы анкеты (свои поля для лидов из формы)
    converted_to_student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=True, index=True)
    b2b_event_id = Column(Integer, ForeignKey("b2b_school_events.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    # Воронка «Дожать на обучение» после мероприятия
    post_visit_stage = Column(String(64), nullable=True, index=True)
    post_visit_review = Column(Text, nullable=True)
    post_visit_project_date = Column(DateTime(timezone=True), nullable=True)
    max_user_id = Column(Integer, nullable=True, index=True)  # MAX мессенджер: user_id в платформе MAX
    last_contact_at = Column(DateTime(timezone=True), nullable=True, index=True)  # дата последнего контакта (звонок/недозвон/инфо)

    # Relationships
    owner = relationship("User")
    converted_to_student = relationship("Student", foreign_keys=[converted_to_student_id])
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


class SmsMessage(Base):
    """История отправленных SMS через SMS Gateway (телефон с приложением)."""
    __tablename__ = "sms_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone = Column(String(32), nullable=False, index=True)
    message = Column(Text, nullable=False)
    entity_type = Column(String(32), nullable=True, index=True)  # lead | event | task
    entity_id = Column(Integer, nullable=True, index=True)
    status = Column(String(16), nullable=False, default="pending", index=True)  # pending | scheduled | sent | failed | cancelled
    gateway_id = Column(String(128), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Время запланированной отправки (UTC). Если NULL — отправляем сразу.
    scheduled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    creator = relationship("User")


class MaxMessage(Base):
    """История сообщений в мессенджер MAX (бот и личный аккаунт)."""
    __tablename__ = "max_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True, index=True)
    max_user_id = Column(Integer, nullable=True, index=True)
    phone = Column(String(32), nullable=True, index=True)
    chat_id = Column(String(64), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(16), nullable=False, default="pending", index=True)  # pending | scheduled | sent | failed | cancelled
    provider = Column(String(32), nullable=True)  # bot | greenapi | api_messenger
    gateway_message_id = Column(String(128), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    scheduled_at = Column(DateTime(timezone=True), nullable=True, index=True)  # отложенная отправка
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    lead = relationship("Lead")
    creator = relationship("User", foreign_keys=[created_by])


class SmsTemplate(Base):
    """Шаблоны SMS для лидов, событий, задач (подстановки: {time}, {location}, {bot_link} и т.д.)."""
    __tablename__ = "sms_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False, index=True)
    category = Column(String(64), nullable=True, index=True)
    text = Column(Text, nullable=False)
    active = Column(Boolean, default=True, nullable=False, index=True)
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


class SalesClass(Base):
    """Справочник классов (для лидов: 1, 2, 3, … 7А, 10Б и т.д.)."""
    __tablename__ = "sales_classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AccountTemplate(Base):
    """Шаблон счёта для настройки Sales: название + формат (групповой/индивидуальный)."""
    __tablename__ = "account_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    format = Column(String(32), nullable=False)  # group | individual
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
    # Ссылка на оплату, которую может задать owner/admin и использовать менеджер
    payment_link = Column(String, nullable=True)
    # Только owner: абонемент и скидка
    abonement_id = Column(Integer, ForeignKey("abonements.id"), nullable=True, index=True)
    discount_type = Column(
        SQLEnum(DiscountType, name="discounttype", values_callable=_enum_values),
        default=DiscountType.NONE,
        nullable=False,
    )
    discount_value = Column(Float, default=0.0, nullable=False)
    learning_period_start = Column(Date, nullable=True)  # дата старта периода (ТЗ п.2.2)
    next_payment_date = Column(Date, nullable=True)  # дата следующей оплаты
    archived = Column(Boolean, default=False, nullable=False, index=True)
    # Жизненный цикл анкеты: draft (черновик), filled (готова к конверсии), converted (ученик создан), cancelled
    anketa_status = Column(String(32), default="converted", nullable=False, index=True)
    # При автозачислении из банка: если у родителя несколько детей, платёж пойдёт на счёт этого ученика
    primary_for_bank_payments = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    abonement = relationship("Abonement")
    student = relationship("Student", backref="student_card")


class BankTransactionStatus(str, enum.Enum):
    NEW = "new"
    APPLIED = "applied"
    AMBIGUOUS = "ambiguous"
    NO_MATCH = "no_match"
    EXPENSE = "expense"  # расход (списание); категория в expense_category


class BankTransaction(Base):
    """Операции из банка (Точка и др.): приход и расход; дедупликация по operation_id, матчинг по телефону для прихода."""
    __tablename__ = "bank_transactions"
    __table_args__ = (UniqueConstraint("operation_id", name="uq_bank_transactions_operation_id"),)
    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(String(256), nullable=False, unique=True, index=True)
    tochka_account_id = Column(String(64), nullable=True, index=True)
    amount = Column(Float, nullable=False)  # приход > 0, расход < 0
    payer_phone = Column(String(32), nullable=True, index=True)
    payer_name = Column(String(512), nullable=True)  # для расхода — контрагент/назначение
    payment_date = Column(String(32), nullable=True)
    status = Column(String(32), nullable=False, default=BankTransactionStatus.NEW.value, index=True)
    expense_category = Column(String(64), nullable=True, index=True)  # комиссия, типография, аренда и т.д.
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    student_account_id = Column(Integer, ForeignKey("student_accounts.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PhonePaymentBinding(Base):
    """Ручная привязка: телефон плательщика из банка → родитель (user). Для автозачисления при следующих платежах."""
    __tablename__ = "phone_payment_bindings"
    __table_args__ = (UniqueConstraint("payer_phone_normalized", name="uq_phone_payment_bindings_phone"),)
    id = Column(Integer, primary_key=True, index=True)
    payer_phone_normalized = Column(String(32), nullable=False, unique=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("User", backref="phone_payment_bindings")


class TochkaAppliedPayment(Base):
    """Уже зачисленные платежи из Точка Банк — чтобы не дублировать при автоматическом импорте (legacy по ФИО)."""
    __tablename__ = "tochka_applied_payments"
    __table_args__ = (
        UniqueConstraint(
            "tochka_account_id", "payment_date", "amount", "payer_name",
            name="uq_tochka_applied_account_date_amount_payer",
        ),
    )
    id = Column(Integer, primary_key=True, index=True)
    tochka_account_id = Column(String(64), nullable=False, index=True)
    payment_date = Column(String(32), nullable=False)
    amount = Column(Float, nullable=False)
    payer_name = Column(String(512), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    student_account_id = Column(Integer, ForeignKey("student_accounts.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FinanceAccountOwnerScope(str, enum.Enum):
    BUSINESS = "business"
    PERSONAL = "personal"
    MIXED = "mixed"


class FinanceAccount(Base):
    """Финансовый счёт (банк/карта) для единого финансового журнала."""

    __tablename__ = "finance_accounts"
    __table_args__ = (
        UniqueConstraint("code", name="uq_finance_accounts_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(256), nullable=False)
    owner_scope = Column(
        SQLEnum(FinanceAccountOwnerScope, name="financeaccountownerscope", values_callable=_enum_values),
        nullable=False,
        default=FinanceAccountOwnerScope.BUSINESS,
    )
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FinanceTarget(Base):
    """Проект / логический кошелёк (academy, personal, leninets, gogol_mogol и т.п.)."""

    __tablename__ = "finance_targets"
    __table_args__ = (
        UniqueConstraint("code", name="uq_finance_targets_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(256), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FinanceArticleDirection(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class FinanceArticleCostKind(str, enum.Enum):
    VARIABLE = "variable"
    FIXED = "fixed"
    NONE = "none"


class FinanceArticleScope(str, enum.Enum):
    ACADEMY = "academy"
    PERSONAL = "personal"
    ANY = "any"


class FinanceArticle(Base):
    """Единый справочник статей доходов/расходов (личные + академия)."""

    __tablename__ = "finance_articles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False, index=True)
    direction = Column(
        SQLEnum(FinanceArticleDirection, name="financearticledirection", values_callable=_enum_values),
        nullable=False,
    )
    cost_kind = Column(
        SQLEnum(FinanceArticleCostKind, name="financearticlecostkind", values_callable=_enum_values),
        nullable=False,
        default=FinanceArticleCostKind.NONE,
    )
    scope = Column(
        SQLEnum(FinanceArticleScope, name="financearticlescope", values_callable=_enum_values),
        nullable=False,
        default=FinanceArticleScope.ANY,
    )
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FinanceTransactionDirection(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class FinanceTransactionStatus(str, enum.Enum):
    NEW = "new"
    CLASSIFIED = "classified"
    APPLIED = "applied"


class FinanceTransaction(Base):
    """Единый финансовый журнал (Unified Finance Ledger)."""

    __tablename__ = "finance_transactions"
    __table_args__ = (
        UniqueConstraint(
            "bank_source",
            "bank_operation_id",
            name="uq_finance_transactions_bank_source_operation_id",
        ),
        UniqueConstraint(
            "bank_source",
            "dedup_hash",
            name="uq_finance_transactions_bank_source_dedup_hash",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=True, index=True)
    amount = Column(Float, nullable=False)
    direction = Column(
        SQLEnum(FinanceTransactionDirection, name="financetransactiondirection", values_callable=_enum_values),
        nullable=False,
    )
    account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=True, index=True)
    to_account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=True, index=True)
    transfer_group_id = Column(String(64), nullable=True, index=True)

    counterparty_name = Column(String(512), nullable=True)
    counterparty_phone = Column(String(32), nullable=True, index=True)
    description_raw = Column(Text, nullable=True)

    bank_source = Column(String(32), nullable=True, index=True)
    bank_operation_id = Column(String(256), nullable=True, index=True)
    dedup_hash = Column(String(64), nullable=True, index=True)

    target_id = Column(Integer, ForeignKey("finance_targets.id"), nullable=True, index=True)
    article_id = Column(Integer, ForeignKey("finance_articles.id"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    status = Column(
        SQLEnum(FinanceTransactionStatus, name="financetransactionstatus", values_callable=_enum_values),
        nullable=False,
        default=FinanceTransactionStatus.NEW,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships for convenient joinedload in API
    account = relationship("FinanceAccount", foreign_keys=[account_id])
    to_account = relationship("FinanceAccount", foreign_keys=[to_account_id])
    target = relationship("FinanceTarget", foreign_keys=[target_id])
    article = relationship("FinanceArticle", foreign_keys=[article_id])


class FinanceRecognitionMatchType(str, enum.Enum):
    CONTAINS = "contains"
    EQUALS = "equals"
    REGEX = "regex"


class FinanceRecognitionRule(Base):
    """Правила авто-классификации транзакций единого журнала."""

    __tablename__ = "finance_recognition_rules"

    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String(512), nullable=False)
    match_type = Column(
        SQLEnum(FinanceRecognitionMatchType, name="financerecognitionmatchtype", values_callable=_enum_values),
        nullable=False,
        default=FinanceRecognitionMatchType.CONTAINS,
    )
    priority = Column(Integer, nullable=False, default=0, index=True)
    target_id = Column(Integer, ForeignKey("finance_targets.id"), nullable=True, index=True)
    article_id = Column(Integer, ForeignKey("finance_articles.id"), nullable=True, index=True)
    direction_override = Column(
        SQLEnum(FinanceTransactionDirection, name="financerecognitiondirectionoverride", values_callable=_enum_values),
        nullable=True,
    )
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


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


class LeadActivity(Base):
    """Unified activity log for leads — powers the timeline."""
    __tablename__ = "lead_activities"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    type = Column(String(64), nullable=False, index=True)  # lead_created, call, message, task_created, task_done, invoice_created, invoice_paid, status_changed, comment_added
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    channel = Column(String(64), nullable=True)  # sms, telegram, max, email, phone
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    payload_json = Column(JSON, nullable=True)
    status_effect_from = Column(String(64), nullable=True)
    status_effect_to = Column(String(64), nullable=True)
    related_task_id = Column(Integer, ForeignKey("lead_tasks.id"), nullable=True)
    related_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)

    lead = relationship("Lead")
    creator = relationship("User")


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
    # Лимит «8 занятий»: сколько юнитов даёт одна встреча (обычно 1; «Первый шаг» 2ч=2 занятия → 2)
    units_per_session = Column(Integer, default=1, nullable=False, server_default="1")
    # Ставка за доп. юнит (сверх 8), когда extra_policy=paid; если NULL — берём price/8
    extra_rate_per_unit = Column(Float, nullable=True)
    # С какой даты группа считается работающей — уроки нельзя создавать раньше этой даты
    start_date = Column(Date, nullable=True)
    # group = групповой (лимит 8 занятий/юнитов), individual = индивидуальный (без лимита 8)
    lesson_format = Column(String(16), nullable=False, default="group", server_default="group")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    trainer = relationship("User", back_populates="trainer_groups", foreign_keys=[trainer_id])
    group_students = relationship("GroupStudent", back_populates="group")
    # ╨г╨┤╨╛╨▒╨╜╨░╤П╤Б╨▓╤П╨╖╤М"╨╝╨╜╨╛╨│╨╕╨╡╨║╨╛╨╝╨╜╨╛╨│╨╕╨╝" ╨┤╨╗╤П╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╨░╤Ж╨╕╨╕╨▓
    students = relationship("Student", secondary="group_students", viewonly=True)
    group_programs = relationship("GroupProgram", back_populates="group")
    group_schedules = relationship("GroupSchedule", back_populates="group", cascade="all, delete-orphan")
    lesson_attendances = relationship("LessonAttendance", back_populates="group", cascade="all, delete-orphan")
    # ╨г╨┤╨╛╨▒╨╜╨░╤П╤Б╨▓╤П╨╖╤М╨┤╨╗╤П╤Б╨╡╤А╨╕╨░╨╗╨╕╨╖╨░╤Ж╨╕╨╕╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╜╤Л╤Е╨┐╤А╨╛╨│╤А╨░╨╝╨╝╨│╤А╤Г╨┐╨┐╤Л
    lesson_cancellations = relationship("LessonCancellation", back_populates="group", cascade="all, delete-orphan")
    lesson_trainer_overrides = relationship("LessonTrainerOverride", back_populates="group", cascade="all, delete-orphan")
    lesson_slot_extra_policies = relationship("LessonSlotExtraPolicy", back_populates="group", cascade="all, delete-orphan")
    programs = relationship("Program", secondary="group_programs", viewonly=True)


class GroupStudent(Base):
    __tablename__ = "group_students"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)  # когда ученик вышел из группы; NULL = ещё в группе

    # Relationships
    group = relationship("Group", back_populates="group_students")
    student = relationship("Student", back_populates="group_students")


class GroupSchedule(Base):
    """╨а╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡╨╖╨░╨╜╤П╤В╨╕╨╣╨│╤А╤Г╨┐╨┐╤Л╨┤╨╡╨╜╤М╨╜╨╡╨┤╨╡╨╗╨╕╨╕╨▓╤А╨╡╨╝╤П╨Я╨╜╨Т╤Б"""
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
    """╨Я╨╛╤Б╨╡╤Й╨░╨╡╨╝╨╛╤Б╤В╤М╨║╤В╨╛╨▒╤Л╨╗╨╜╨░╨╖╨░╨╜╤П╤В╨╕╨╕╨│╤А╤Г╨┐╨┐╨░╨┤╨░╤В╨░"""
    __tablename__ = "lesson_attendance"
    __table_args__ = (UniqueConstraint("group_id", "lesson_date", "student_id", name="uq_lesson_attendance_group_date_student"),)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    lesson_date = Column(Date, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    # Фактический тренер, который вёл занятие (для истории и расчётов).
    # Может отличаться от current group.trainer_id, если были подмены или смена тренера в середине месяца.
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    attended = Column(Boolean, default=True, nullable=False)
    late = Column(Boolean, default=False, nullable=False)  # опоздает / в пути
    call_result = Column(String(32), nullable=True)  # contacted | no_answer | cancelled | technical | messenger
    call_result_at = Column(DateTime(timezone=True), nullable=True)
    absence_reason = Column(String(64), nullable=True)  # was / not_was / sick / olympiad / event / other (ТЗ п.3.1)
    absence_comment = Column(Text, nullable=True)
    lesson_start_time = Column(Time, nullable=True)  # при переносе с изменением времени
    lesson_end_time = Column(Time, nullable=True)
    # Лимит 8: сколько юнитов списано как base (в пакете) и как extra (сверх пакета)
    base_units_applied = Column(Integer, nullable=True)
    extra_units_applied = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="lesson_attendances")
    student = relationship("Student", back_populates="lesson_attendances")
    trainer = relationship("User", foreign_keys=[trainer_id])


class LessonCancellation(Base):
    """Отмена или перенос занятия: слот (группа, дата, время) не показывается на странице Уроки."""
    __tablename__ = "lesson_cancellations"
    __table_args__ = (
        UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_lesson_cancellation_group_date_time"),
    )
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    lesson_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    # Целевая дата/время, если урок был перенесён (move_lesson).
    moved_to_date = Column(Date, nullable=True, index=True)
    moved_to_start_time = Column(Time, nullable=True)
    moved_to_end_time = Column(Time, nullable=True)

    group = relationship("Group", back_populates="lesson_cancellations")


class LessonTrainerOverride(Base):
    """Подмена преподавателя на конкретный урок (группа, дата, время)."""
    __tablename__ = "lesson_trainer_overrides"
    __table_args__ = (
        UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_lesson_trainer_override_group_date_time"),
    )
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    lesson_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    group = relationship("Group", back_populates="lesson_trainer_overrides")
    trainer = relationship("User", foreign_keys=[trainer_id])


class LessonSlotExtraPolicy(Base):
    """Режим доп. занятий (сверх 8) для слота: free (бесплатно) или paid (списание). Owner/admin/sales."""
    __tablename__ = "lesson_slot_extra_policy"
    __table_args__ = (
        UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_lesson_slot_extra_policy_slot"),
    )
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    lesson_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    extra_policy = Column(String(16), nullable=False, default="free", server_default="free")  # free | paid
    extra_rate_per_unit = Column(Float, nullable=True)  # если NULL — из группы или price/8

    group = relationship("Group", back_populates="lesson_slot_extra_policies")


class TrainerPeriodBonus(Base):
    """Премия тренеру за период (месяц) для страницы «Расчёты». Owner."""
    __tablename__ = "trainer_period_bonuses"
    __table_args__ = (UniqueConstraint("trainer_id", "period", name="uq_trainer_period_bonus"),)

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    bonus = Column(Float, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trainer = relationship("User", foreign_keys=[trainer_id])


class TrainerPayout(Base):
    """Табель выплаты тренеру за период: уроки/часы, ставки, премия, итог. Owner."""
    __tablename__ = "trainer_payouts"
    __table_args__ = (UniqueConstraint("trainer_id", "period", name="uq_trainer_payout_period"),)

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    lessons_count = Column(Integer, nullable=False, default=0)
    hours_count = Column(Float, nullable=False, default=0)
    rate_per_lesson = Column(Float, nullable=True)
    rate_per_hour = Column(Float, nullable=True)
    base_payment = Column(Float, nullable=False, default=0)
    bonus = Column(Float, nullable=False, default=0)
    total = Column(Float, nullable=False, default=0)
    paid_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trainer = relationship("User", foreign_keys=[trainer_id])


class CustomLessonType(str, enum.Enum):
    MAKEUP = "makeup"          # Отработка
    PAID_EXTRA = "paid_extra"  # Дополнительное платное
    FREE_TRIAL = "free_trial"  # Бесплатное / пробное


class CustomLesson(Base):
    """Ручной урок без группы (отработка / доп.урок / пробное занятие)."""
    __tablename__ = "custom_lessons"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    lesson_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=True)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lesson_type = Column(
        SQLEnum(CustomLessonType, name="customlessontype", values_callable=_enum_values),
        default=CustomLessonType.MAKEUP,
        nullable=False,
        index=True,
    )
    comment = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    trainer = relationship("User", foreign_keys=[trainer_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class CustomLessonStudent(Base):
    """Участник ручного урока + настройки отработки / посещаемости."""
    __tablename__ = "custom_lesson_students"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("custom_lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    planned_absence_id = Column(Integer, ForeignKey("absence_follow_ups.id"), nullable=True, index=True)
    attended = Column(Boolean, default=False, nullable=False)
    absence_reason = Column(String(64), nullable=True)
    absence_comment = Column(Text, nullable=True)

    lesson = relationship("CustomLesson", backref="students")
    student = relationship("Student")
    planned_absence = relationship("AbsenceFollowUp", foreign_keys=[planned_absence_id])


class AbsenceFollowUpStage(str, enum.Enum):
    MISSED = "missed"           # Пропустил
    ASSIGNED = "assigned"       # Назначили отработку
    LINK_SENT = "link_sent"     # Отправили ссылку на отработку
    MADE_UP = "made_up"         # Отработал
    MISSED_MAKEUP = "missed_makeup"  # Пропустил отработку


class AbsenceFollowUp(Base):
    """Пропуск занятия: воронка для sales — Пропустил → Назначили → Отработал → Пропустил отработку."""
    __tablename__ = "absence_follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    lesson_attendance_id = Column(Integer, ForeignKey("lesson_attendance.id"), nullable=True, unique=False, index=True)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id"), nullable=True, index=True)  # новая архитектура
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    lesson_date = Column(Date, nullable=False, index=True)
    stage = Column(String, nullable=False, index=True, server_default="missed")  # missed / assigned / made_up / missed_makeup
    makeup_group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    makeup_custom_lesson_id = Column(Integer, ForeignKey("custom_lessons.id"), nullable=True, index=True)
    makeup_lesson_date = Column(Date, nullable=True)
    absence_reason = Column(String(64), nullable=True)
    absence_comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    lesson_attendance = relationship("LessonAttendance")
    student = relationship("Student")
    group = relationship("Group", foreign_keys=[group_id])
    makeup_group = relationship("Group", foreign_keys=[makeup_group_id])
    makeup_custom_lesson = relationship("CustomLesson", foreign_keys=[makeup_custom_lesson_id])


class StudentFreeze(Base):
    """Заморозка абонемента по запросу родителя. Только owner ставит/снимает (ТЗ п.7)."""
    __tablename__ = "student_freezes"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    freeze_start = Column(Date, nullable=False)
    freeze_end = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", backref="freezes")


class ProgramMakeupCompatibility(Base):
    """Матрица совместимости программ для отработок (ТЗ п.5.3). Конфигурируемо без переписывания кода."""
    __tablename__ = "program_makeup_compatibility"
    __table_args__ = (UniqueConstraint("source_program_id", "target_program_id", name="uq_makeup_compat_source_target"),)

    id = Column(Integer, primary_key=True, index=True)
    source_program_id = Column(Integer, ForeignKey("programs.id", ondelete="CASCADE"), nullable=False, index=True)
    target_program_id = Column(Integer, ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)

    source_program = relationship("Program", foreign_keys=[source_program_id])
    target_program = relationship("Program", foreign_keys=[target_program_id])


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
    final_result = Column(Text, nullable=True)  # ╨Ш╤В╨╛╨│╤В╨╡╨╝╤Л╨┤╨╗╤П╤Г╤З╨╡╨╜╨╕╨║╨░
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
    data = Column(JSON, nullable=False)  # ╨Ф╨╕╨╜╨░╨╝╨╕╤З╨╡╤Б╨║╨╕╨╡╨┐╨╛╨╗╤П╤Д╨╛╤А╨╝╤Л
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
    fields = Column(JSON, nullable=False)  # ╨б╤Е╨╡╨╝╨░╨┐╨╛╨╗╨╡╨╣╤Д╨╛╤А╨╝╤Л
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
    UNKNOWN = "unknown"           # ╨╜╨╡╨╖╨╜╨░╨╡╨╝╨┤╤А╤Г╨│╨┤╤А╤Г╨│╨░
    INDIRECT = "indirect"         # ╨╖╨╜╨░╨╡╨╝╨║╨╛╤Б╨▓╨╡╨╜╨╜╨╛
    FRIENDS = "friends"           # ╨┤╤А╤Г╨╢╨╕╨╝
    ENEMIES = "enemies"           # ╨▓╤А╨░╨│╨╕


class B2BSchool(Base):
    __tablename__ = "b2b_schools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    director = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True, index=True)
    district = Column(String(256), nullable=True)
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
    phone_school = Column(String(64), nullable=True)
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
    school_campaigns = relationship("SchoolCampaign", back_populates="school", cascade="all, delete-orphan")


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
    cities = Column(JSON, nullable=True)  # ╤Б╨┐╨╕╤Б╨╛╨║╨│╨╛╤А╨╛╨┤╨╛╨▓╨║╨╛╤В╨╛╤А╤Л╨╡╨▓╤Е╨╛╨┤╤П╤В╨▓╨┐╤А╨╛╨╡╨║╤В
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    archived = Column(Boolean, nullable=False, default=False, server_default="false", index=True)


# ╨Т╨╛╤А╨╛╨╜╨║╨╕╨┤╨╗╤П╤А╨╛╨╗╨╕╤В╨╕╨┐╤Л╨╕╤Н╤В╨░╨┐╤Л╨╖╨░╨┤╨░╨╜╤Л╨▓╨║╨╛╨┤╨╡
class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(512), nullable=False)
    type = Column(String(32), nullable=False, index=True)
    format = Column(String(32), nullable=False)
    city = Column(String(256), nullable=True, index=True)
    region = Column(String(256), nullable=True)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    responsible_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, server_default="draft", index=True)
    mode = Column(String(32), nullable=False, server_default="city")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    responsible = relationship("User", foreign_keys=[responsible_id])
    school_campaigns = relationship("SchoolCampaign", back_populates="campaign", cascade="all, delete-orphan")
    campaign_events = relationship("CampaignEvent", back_populates="campaign", cascade="all, delete-orphan")


class SchoolCampaign(Base):
    __tablename__ = "school_campaigns"
    id = Column(Integer, primary_key=True, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(String(64), nullable=False, server_default="not_contacted", index=True)
    support_letter_status = Column(String(32), nullable=True)
    thank_you_sent = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (UniqueConstraint("b2b_school_id", "campaign_id", name="uq_school_campaigns_school_campaign"),)
    school = relationship("B2BSchool", back_populates="school_campaigns")
    campaign = relationship("Campaign", back_populates="school_campaigns")
    school_campaign_events = relationship("SchoolCampaignEvent", back_populates="school_campaign", cascade="all, delete-orphan")


class CampaignEventStatus(str, enum.Enum):
    PLANNED = "planned"
    DONE = "done"
    CANCELED = "canceled"


class CampaignEvent(Base):
    __tablename__ = "campaign_events"
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    event_date = Column(Date, nullable=False, index=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    location = Column(String(512), nullable=True)
    city = Column(String(256), nullable=True)
    status = Column(String(32), nullable=False, server_default=CampaignEventStatus.PLANNED.value, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    campaign = relationship("Campaign", back_populates="campaign_events")
    school_campaign_events = relationship("SchoolCampaignEvent", back_populates="campaign_event", cascade="all, delete-orphan")


class InviteStatus(str, enum.Enum):
    NOT_INVITED = "not_invited"
    INVITED = "invited"
    AWAITING_REPLY = "awaiting_reply"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class ParticipationStatus(str, enum.Enum):
    NOT_PLANNED = "not_planned"
    PLANNED = "planned"
    CONFIRMED = "confirmed"
    PARTICIPATED = "participated"
    NO_SHOW = "no_show"
    DECLINED = "declined"


class HostStatus(str, enum.Enum):
    NOT_HOST = "not_host"
    HOST_PROPOSED = "host_proposed"
    HOST_CONFIRMED = "host_confirmed"
    HOSTED = "hosted"
    HOST_DECLINED = "host_declined"


class SchoolCampaignEvent(Base):
    __tablename__ = "school_campaign_events"
    id = Column(Integer, primary_key=True, index=True)
    campaign_event_id = Column(Integer, ForeignKey("campaign_events.id", ondelete="CASCADE"), nullable=False, index=True)
    school_campaign_id = Column(Integer, ForeignKey("school_campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    invite_status = Column(
        String(32), nullable=False, server_default=InviteStatus.NOT_INVITED.value, index=True
    )
    participation_status = Column(
        String(32), nullable=False, server_default=ParticipationStatus.NOT_PLANNED.value, index=True
    )
    participant_count = Column(Integer, nullable=True)
    host_status = Column(
        String(32), nullable=False, server_default=HostStatus.NOT_HOST.value, index=True
    )
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("campaign_event_id", "school_campaign_id", name="uq_school_campaign_event_event_school"),
    )
    campaign_event = relationship("CampaignEvent", back_populates="school_campaign_events")
    school_campaign = relationship("SchoolCampaign", back_populates="school_campaign_events")


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
    description = Column(Text, nullable=True)
    template_id = Column(Integer, ForeignKey("task_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    category = Column(String(20), nullable=False, server_default="schools", index=True)  # schools | parents | leads
    status = Column(String(20), nullable=False, server_default="active", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    scheduled_for = Column(Date, nullable=True, index=True)  # дата показа в "Плане на сегодня"
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)  # дедлайн (до 20:00 и т.д.)
    priority = Column(String(20), nullable=False, server_default="normal", index=True)  # low | normal | high
    pinned_today = Column(Boolean, nullable=False, server_default="false")  # вручную в плане на сегодня
    tags = Column(JSON, nullable=True)  # произвольные теги: makeup, payment, renewal, event_leads и т.п.
    task_kind = Column(String(64), nullable=True, index=True)  # payment_overdue и т.п.
    reminder_stage = Column(Integer, nullable=True)  # 1 | 2 для payment_overdue
    repeat_enabled = Column(Boolean, nullable=False, server_default="false")
    repeat_frequency = Column(String(20), nullable=True)
    repeat_days = Column(JSON, nullable=True)
    repeat_end_type = Column(String(20), nullable=True)
    repeat_end_after_count = Column(Integer, nullable=True)
    repeat_end_until = Column(Date, nullable=True)

    subtasks = relationship("TaskSubtask", back_populates="task", cascade="all, delete-orphan")
    students = relationship("TaskStudent", back_populates="task", cascade="all, delete-orphan")
    counters = relationship("TaskCounter", back_populates="task", cascade="all, delete-orphan")


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


class TaskCounter(Base):
    __tablename__ = "task_counters"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    counter_key = Column(String(64), nullable=False)
    value = Column(Integer, nullable=False, server_default="0")

    task = relationship("Task", back_populates="counters")


# --- Owner workspace: projects, contacts, tasks, communications ---
class OwnerWorkspaceProject(Base):
    __tablename__ = "owner_workspace_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default="active", index=True)  # active | completed | archived
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_project_id = Column(Integer, ForeignKey("owner_workspace_projects.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    archived_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", foreign_keys=[owner_id])
    parent_project = relationship("OwnerWorkspaceProject", remote_side=[id], backref="subprojects")


class OwnerWorkspaceProjectParticipant(Base):
    __tablename__ = "owner_workspace_project_participants"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_owner_workspace_project_participant"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # member | manager — менеджер может вести состав (кроме других менеджеров)
    role = Column(String(32), nullable=False, server_default="member")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("OwnerWorkspaceProject")
    user = relationship("User")


class OwnerWorkspaceContact(Base):
    __tablename__ = "owner_workspace_contacts"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False, index=True)
    phone = Column(String(64), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    company = Column(String(255), nullable=True, index=True)
    position = Column(String(255), nullable=True)
    tags = Column(JSON, nullable=True)
    comment = Column(Text, nullable=True)
    source = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OwnerWorkspaceProjectContact(Base):
    __tablename__ = "owner_workspace_project_contacts"
    __table_args__ = (
        UniqueConstraint("project_id", "contact_id", name="uq_owner_workspace_project_contact"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("OwnerWorkspaceProject")
    contact = relationship("OwnerWorkspaceContact")


class OwnerWorkspaceTask(Base):
    __tablename__ = "owner_workspace_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default="new", index=True)  # new | in_progress | waiting | completed | cancelled
    priority = Column(String(20), nullable=False, server_default="medium", index=True)  # low | medium | high | critical
    deadline_at = Column(DateTime(timezone=True), nullable=True, index=True)
    start_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("owner_workspace_projects.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_id = Column(Integer, ForeignKey("owner_workspace_contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    tags = Column(JSON, nullable=True)
    checklist = Column(JSON, nullable=True)
    attachments = Column(JSON, nullable=True)
    previous_task_id = Column(Integer, ForeignKey("owner_workspace_tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    assignee = relationship("User", foreign_keys=[assignee_id])
    creator = relationship("User", foreign_keys=[creator_id])
    project = relationship("OwnerWorkspaceProject")
    contact = relationship("OwnerWorkspaceContact")
    previous_task = relationship("OwnerWorkspaceTask", remote_side=[id], backref="next_tasks")


class OwnerWorkspaceTaskComment(Base):
    __tablename__ = "owner_workspace_task_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("OwnerWorkspaceTask")
    author = relationship("User")


class OwnerWorkspaceMessage(Base):
    __tablename__ = "owner_workspace_messages"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    external_chat_id = Column(String(128), nullable=True, index=True)
    external_message_id = Column(String(128), nullable=True, index=True)
    direction = Column(String(16), nullable=False, server_default="incoming", index=True)  # incoming | outgoing
    text = Column(Text, nullable=False)
    attachments = Column(JSON, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True, index=True)
    received_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    contact = relationship("OwnerWorkspaceContact")


class OwnerWorkspaceTaskMessage(Base):
    __tablename__ = "owner_workspace_task_messages"
    __table_args__ = (
        UniqueConstraint("task_id", "message_id", name="uq_owner_workspace_task_message"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("owner_workspace_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("OwnerWorkspaceTask")
    message = relationship("OwnerWorkspaceMessage")


class OwnerWorkspaceAuditLog(Base):
    __tablename__ = "owner_workspace_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    action_type = Column(String(64), nullable=False, index=True)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    author = relationship("User")


class OwnerWorkspaceNotification(Base):
    __tablename__ = "owner_workspace_notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_owner_workspace_notification_user_dedupe"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    task_id = Column(Integer, ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    contact_id = Column(
        Integer,
        ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    dedupe_key = Column(String(160), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    email_delivery_status = Column(String(24), nullable=False, server_default="disabled", index=True)
    email_last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_attempts = Column(Integer, nullable=False, server_default="0")
    email_last_error = Column(Text, nullable=True)
    web_push_delivery_status = Column(String(24), nullable=False, server_default="disabled", index=True)
    web_push_last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    web_push_sent_at = Column(DateTime(timezone=True), nullable=True)
    web_push_attempts = Column(Integer, nullable=False, server_default="0")
    web_push_last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User")
    task = relationship("OwnerWorkspaceTask")
    contact = relationship("OwnerWorkspaceContact")


class OwnerWorkspaceWebPushSubscription(Base):
    __tablename__ = "owner_workspace_web_push_subscriptions"
    __table_args__ = (
        UniqueConstraint("endpoint", name="uq_owner_workspace_web_push_subscription_endpoint"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class OwnerWorkspaceConversationRead(Base):
    """До какого момента пользователь «дочитал» переписку с контактом (по created_at сообщений)."""

    __tablename__ = "owner_workspace_conversation_reads"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    contact_id = Column(
        Integer,
        ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_read_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    contact = relationship("OwnerWorkspaceContact")


class OwnerWorkspaceUserPreference(Base):
    """Персональные настройки UI задачника (JSON, merge при PATCH)."""

    __tablename__ = "owner_workspace_user_preferences"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferences = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")


# Owner funnel constants (owner_funnels router)
OWNER_FUNNEL_SUPPORT_LETTERS = "support_letters"   # ╨Я╨╛╨╗╤Г╤З╨╕╤В╤М╨┐╨╕╤Б╤М╨╝╨░╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕╨Я╨╛╨╗╤Г╤З╨╕╤В╤М╨┐╨╕╤Б╤М╨╝╨░╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕
OWNER_FUNNEL_THANK_YOU_LETTERS = "thank_you_letters"  # ╨Я╨╕╤Б╤М╨╝╨░╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╨╕
OWNER_FUNNEL_EVENTS = "events"  # ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П

# ╨н╤В╨░╨┐╤Л╨┐╨╛╤В╨╕╨┐╨░╨╝╨▓╨╛╤А╨╛╨╜╨╛╨║╨┤╨╗╤П╨С╨Ф╨┤╨╗╤П
OWNER_FUNNEL_STAGES = {
    OWNER_FUNNEL_SUPPORT_LETTERS: [
        ("new", "╨Э╨╛╨▓╨╛╨╡"),
        ("letter_created", "╨б╨╛╨╖╨┤╨░╨╗╨┐╨╕╤Б╤М╨╝╨╛"),
        ("letter_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨┐╨╕╤Б╤М╨╝╨╛"),
        ("letter_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗╨┐╨╕╤Б╤М╨╝╨╛"),
    ],
    OWNER_FUNNEL_THANK_YOU_LETTERS: [
        ("new", "╨Э╨╛╨▓╨╛╨╡"),
        ("thank_you_formed", "╨б╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╨╗╨╕╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╤М"),
        ("thank_you_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╤М"),
        ("school_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗╨░╤И╨║╨╛╨╗╨░"),
    ],
    OWNER_FUNNEL_EVENTS: [
        ("new", "╨Э╨╛╨▓╤Л╨╡"),
        ("contact_found", "╨Ъ╨╛╨╜╤В╨░╨║╤В╨╜╨░╨╣╨┤╨╡╨╜"),
        ("letter_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕╨┐╨╕╤Б╤М╨╝╨╛"),
        ("reply_received", "╨Я╨╛╨╗╤Г╤З╨╕╨╗╨╕╨╛╤В╨▓╨╡╤В╨╜╨╛╨╡╨┐╨╕╤Б╤М╨╝╨╛"),
        ("reached_by_phone", "╨Ф╨╛╨╖╨▓╨╛╨╜╨╕╨╗╨╕╤Б╤М"),
        ("not_reached", "╨Э╨╡╨┤╨╛╨╖╨▓╨╛╨╜╨╕╨╗╨╕╤Б╤М"),
        ("meeting_agreed", "╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М╨╜╨░╨▓╤Б╤В╤А╨╡╤З╤Г"),
        ("agreement_sent", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡╨╜╨░╤Б╨╛╨│╨╗╨░╤Б╨╛╨▓╨░╨╜╨╕╨╡"),
        ("agreement_approved", "╨б╨╛╨│╨╗╨░╤Б╨╛╨▓╨░╨╗╨╕╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡"),
        ("agreement_signed", "╨Я╨╛╨┤╨┐╨╕╤Б╨░╨╗╨╕╤Б╨╛╨│╨╗╨░╤И╨╡╨╜╨╕╨╡"),
        ("trip_agreed", "╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М╨╜╨░╨┐╨╛╤Е╨╛╨┤"),
        ("info_sent_to_parents", "╨Ю╤В╨┐╤А╨░╨▓╨╕╨╗╨╕╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╤О╨▓╤З╨░╤В╤Л╤А╨╛╨┤╨╕╤В╨╡╨╗╨╡╨╣"),
        ("leads_collected", "╨б╨╛╨▒╤А╨░╨╗╨╕╨╗╨╕╨┤╨╛╨▓"),
        ("rejected", "╨Ю╤В╨║╨░╨╖╨░╨╗╨╕"),
    ],
}

# ╨н╤В╨░╨┐╤Л╨▓╨╛╤А╨╛╨╜╨║╨╕╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П╗,╨┐╤А╨╕╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡╨╜╨░╨║╨╛╤В╨╛╤А╤Л╨╡╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╨╡╤В╤Б╤П╨╕╤Б╨╛╤Е╤А╨░╨╜╤П╤О╤В╤Б╤П╨┤╨░╨╜╨╜╤Л╨╡╨▓
OWNER_FUNNEL_EVENTS_POPUP_STAGES = {
    "contact_found": ["contact_fio", "contact_phone", "contact_comment"],
    "reply_received": ["reply_comment"],
    "meeting_agreed": ["meeting_date"],
    "trip_agreed": ["trip_date"],
    "leads_collected": ["leads_count"],
}


class OwnerFunnelEvent(Base):
    """╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡╤Б╨░╨╝╨░╨▓╨╛╤А╨╛╨╜╨║╨░╨┤╨╛╤Б╨║╨░╤Б╤Н╤В╨░╨┐╨░╨╝╨╕╨Ъ╨░╤А╤В╨╛╤З╨║╨╕╨▓╨║╨╛╨╗╨╛╨╜╨║╨░╤Е╤Н╨╗╨╡╨╝╨╡╨╜╤В╤Л╤Б"""
    __tablename__ = "owner_funnel_events"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(512), nullable=False)
    event_dates = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OwnerFunnelItem(Base):
    """╨н╨╗╨╡╨╝╨╡╨╜╤В╨▓╨╛╤А╨╛╨╜╨║╨╕╨┐╨╕╤Б╤М╨╝╨░╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╨╕╨┤╨╗╤П╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╣╨║╨░╤А╤В╨╛╤З╨║╨░╨▓╨╜╤Г╤В╤А╨╕╨▓╨╛╤А╨╛╨╜╨║╨╕╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П"""
    __tablename__ = "owner_funnel_items"

    id = Column(Integer, primary_key=True, index=True)
    funnel_type = Column(String(64), nullable=False, index=True)  # support_letters | thank_you_letters | events
    event_id = Column(Integer, ForeignKey("owner_funnel_events.id", ondelete="CASCADE"), nullable=True, index=True)  # ╤В╨╛╨╗╤М╨║╨╛╨┤╨╗╤П
    stage = Column(String(64), nullable=False, index=True)
    title = Column(String(512), nullable=True)
    comment = Column(Text, nullable=True)
    card_data = Column(JSON, nullable=True)  # ╨┤╨╗╤П╨║╨╛╨╜╤В╨░╨║╤В╨┤╨░╤В╤Л╤Н╤В╨░╨┐╨╛╨▓╨╕╤В╨┤╤Г╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ============================================================
# Новая архитектура уроков: LessonInstance (экземпляр занятия)
# ============================================================

class LessonType(str, enum.Enum):
    GROUP = "group"            # Регулярное групповое занятие
    MANUAL = "manual"          # Ручное занятие без группы
    MAKEUP = "makeup"          # Отработка
    PAID_EXTRA = "paid_extra"  # Дополнительное платное
    FREE_TRIAL = "free_trial"  # Пробное / бесплатное


class LessonStatus(str, enum.Enum):
    PLANNED = "planned"        # Запланировано (в будущем)
    COMPLETED = "completed"    # Проведено (посещаемость отмечена)
    CANCELLED = "cancelled"    # Отменено
    MOVED = "moved"            # Перенесено (исходный слот)


class LessonParticipationStatus(str, enum.Enum):
    PLANNED = "planned"          # В составе по шаблону
    ADDED_MANUAL = "added_manual"  # Добавлен вручную только в этот урок
    REMOVED = "removed"          # Удалён только из этого урока


class LessonInstance(Base):
    """Материализованный экземпляр конкретного занятия на конкретную дату.
    Является источником правды — не пересчитывается из текущего состояния группы."""
    __tablename__ = "lesson_instances"

    id = Column(Integer, primary_key=True, index=True)

    # Связь с группой и шаблоном расписания (nullable для ручных уроков)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    schedule_id = Column(Integer, ForeignKey("group_schedules.id"), nullable=True, index=True)

    # Дата и время конкретного занятия
    lesson_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=True)

    # Тренер фактический на этот урок (зафиксирован при генерации/создании)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Мета-информация
    title = Column(String(256), nullable=True)       # Для ручных уроков
    program_id = Column(Integer, ForeignKey("programs.id"), nullable=True, index=True)

    # Тип и статус
    lesson_type = Column(
        String(32), nullable=False, default="group", server_default="group", index=True
    )  # group | manual | makeup | paid_extra | free_trial
    status = Column(
        String(32), nullable=False, default="planned", server_default="planned", index=True
    )  # planned | completed | cancelled | moved
    comment = Column(Text, nullable=True)

    # Источник создания
    source_type = Column(
        String(32), nullable=True, index=True
    )  # schedule (из шаблона) | manual (создан вручную)

    # Связи переноса
    moved_from_id = Column(
        Integer, ForeignKey("lesson_instances.id"), nullable=True, index=True
    )  # если это новое занятие после переноса — ссылка на исходное
    moved_to_id = Column(
        Integer, ForeignKey("lesson_instances.id"), nullable=True
    )  # если это исходное занятие — ссылка на новое

    cancel_reason = Column(String(256), nullable=True)

    # Аудит
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    group = relationship("Group", foreign_keys=[group_id])
    schedule = relationship("GroupSchedule", foreign_keys=[schedule_id])
    trainer = relationship("User", foreign_keys=[trainer_id])
    program = relationship("Program", foreign_keys=[program_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    lesson_students = relationship(
        "LessonInstanceStudent",
        back_populates="lesson_instance",
        cascade="all, delete-orphan",
    )
    moved_from = relationship(
        "LessonInstance", foreign_keys=[moved_from_id], remote_side="LessonInstance.id",
        back_populates="moved_to_instance",
    )
    moved_to_instance = relationship(
        "LessonInstance", foreign_keys=[moved_from_id],
        back_populates="moved_from",
        uselist=False,
    )


class LessonInstanceStudent(Base):
    """Состав участников конкретного экземпляра занятия.
    Не зависит от текущего состава группы — зафиксирован при генерации."""
    __tablename__ = "lesson_instance_students"
    __table_args__ = (
        UniqueConstraint(
            "lesson_instance_id", "student_id",
            name="uq_lesson_instance_student"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)

    # Статус участия
    participation_status = Column(
        String(32), nullable=False, default="planned", server_default="planned"
    )  # planned | added_manual | removed

    # Посещаемость
    attended = Column(Boolean, nullable=True)       # None = ещё не отмечено
    late = Column(Boolean, default=False, nullable=False)
    absence_reason = Column(String(64), nullable=True)  # sick | olympiad | event | other
    absence_comment = Column(Text, nullable=True)

    # Ссылка на пропуск (для отработок)
    planned_absence_id = Column(
        Integer, ForeignKey("absence_follow_ups.id"), nullable=True, index=True
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    lesson_instance = relationship("LessonInstance", back_populates="lesson_students")
    student = relationship("Student")
    planned_absence = relationship("AbsenceFollowUp", foreign_keys=[planned_absence_id])


class LessonAuditLog(Base):
    """Журнал изменений занятия: кто, когда и что изменил."""
    __tablename__ = "lesson_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    entity_type = Column(String(64), nullable=False)  # lesson | student
    entity_id = Column(Integer, nullable=True)         # id студента если entity_type=student
    field_name = Column(String(128), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    action = Column(String(64), nullable=False, index=True)  # create | update | cancel | move | add_student | remove_student | set_trainer | save_attendance
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    lesson_instance = relationship("LessonInstance")
    changed_by = relationship("User", foreign_keys=[changed_by_id])

