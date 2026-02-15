from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, Text, Float, Enum as SQLEnum, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator
from datetime import datetime
import os
import enum
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
    """TypeDecorator: при записи в PostgreSQL (если use_uppercase_for_pg=True) — имя (ACTIVE), иначе value (active);
    при чтении принимает любой регистр."""
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


_StudentStatusType = _lowercase_enum_type(StudentStatus, use_uppercase_for_pg=True)
_GroupStatusType = _lowercase_enum_type(GroupStatus, use_uppercase_for_pg=True)
_ProgramStatusType = _lowercase_enum_type(ProgramStatus, use_uppercase_for_pg=True)
_TopicStatusType = _lowercase_enum_type(TopicStatus, use_uppercase_for_pg=True)
_CharacteristicStatusType = _lowercase_enum_type(CharacteristicStatus, use_uppercase_for_pg=True)
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
    # Активные назначения программ (сериализуются в programs через property ниже)
    grades = relationship("Grade", back_populates="student")
    characteristics = relationship("Characteristic", back_populates="student")
    abonement = relationship("Abonement", back_populates="students")

    @property
    def programs(self):
        """Список активных программ ученика (назначения со status=active)."""
        from app.models import StudentProgramLinkStatus
        return [
            sp.program for sp in self.student_programs
            if getattr(sp, "status", StudentProgramLinkStatus.ACTIVE) == StudentProgramLinkStatus.ACTIVE
        ]


class Abonement(Base):
    __tablename__ = "abonements"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Float, default=0.0, nullable=False)
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
    pause_reason = Column(String, nullable=True)
    lost_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User")
    abonement = relationship("Abonement")
    source_ref = relationship("LeadSource")
    status_option = relationship("LeadStatusOption")
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
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(_GroupStatusType(), default=GroupStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    trainer = relationship("User", back_populates="trainer_groups", foreign_keys=[trainer_id])
    group_students = relationship("GroupStudent", back_populates="group")
    # Удобная связь "многие-ко-многим" для сериализации в GroupResponse.students
    students = relationship("Student", secondary="group_students", viewonly=True)
    group_programs = relationship("GroupProgram", back_populates="group")
    # Удобная связь для сериализации назначенных программ группы
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
    final_result = Column(Text, nullable=True)  # Итог темы для ученика
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
    data = Column(JSON, nullable=False)  # Динамические поля формы
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
    fields = Column(JSON, nullable=False)  # Схема полей формы
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

