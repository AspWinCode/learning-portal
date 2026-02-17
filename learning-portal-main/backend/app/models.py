from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Date, Time, ForeignKey, Text, Float, Enum as SQLEnum, JSON, UniqueConstraint
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
    # Воронка продаж (новая)
    THINKING = "thinking"  # Подумают
    REFUSED = "refused"  # Отказался
    TRIAL_SCHEDULED = "trial_scheduled"  # Записался на пробное
    EVENT_REGISTERED = "event_registered"  # Записался на мероприятие
    DECIDED_IMMEDIATELY = "decided_immediately"  # Решил заниматься сразу


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
    no_answer_attempt = Column(Integer, nullable=True, index=True)  # 1, 2 или 3 для колонки Недозвон
    pause_reason = Column(String, nullable=True)
    lost_reason = Column(String, nullable=True)
    questionnaire_filled = Column(Boolean, default=False, nullable=False, index=True)
    b2b_school_id = Column(Integer, ForeignKey("b2b_schools.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User")
    abonement = relationship("Abonement")
    source_ref = relationship("LeadSource")
    status_option = relationship("LeadStatusOption")
    b2b_school = relationship("B2BSchool", back_populates="leads")
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
    group_schedules = relationship("GroupSchedule", back_populates="group", cascade="all, delete-orphan")
    lesson_attendances = relationship("LessonAttendance", back_populates="group", cascade="all, delete-orphan")
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


class GroupSchedule(Base):
    """Расписание занятий группы: день недели и время (0=Пн, 6=Вс)."""
    __tablename__ = "group_schedules"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="group_schedules")


class LessonAttendance(Base):
    """Посещаемость: кто был на занятии (группа + дата)."""
    __tablename__ = "lesson_attendance"
    __table_args__ = (UniqueConstraint("group_id", "lesson_date", "student_id", name="uq_lesson_attendance_group_date_student"),)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    lesson_date = Column(Date, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    attended = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="lesson_attendances")
    student = relationship("Student", back_populates="lesson_attendances")


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


# B2B Schools pipeline
class B2BSchoolPipelineStage(str, enum.Enum):
    NEW = "new"
    CONTACT_FOUND = "contact_found"
    LETTER_SENT = "letter_sent"
    MEETING_SCHEDULED = "meeting_scheduled"
    MEETING_HELD = "meeting_held"
    PERMISSION_RECEIVED = "permission_received"
    WALKTHROUGH_SCHEDULED = "walkthrough_scheduled"
    WALKTHROUGH_DONE = "walkthrough_done"
    LEADS_RECEIVED = "leads_received"


class B2BSchoolFriendshipDegree(str, enum.Enum):
    UNKNOWN = "unknown"           # не знаем друг друга
    INDIRECT = "indirect"         # знаем косвенно
    FRIENDS = "friends"           # дружим
    ENEMIES = "enemies"           # враги


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
    event_dates = Column(JSON, nullable=True)
    meeting_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    meeting_outcomes = Column(Text, nullable=True)
    walkthrough_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    leads = relationship("Lead", back_populates="b2b_school", foreign_keys="Lead.b2b_school_id")
    school_contacts = relationship("B2BSchoolContact", back_populates="school", cascade="all, delete-orphan")


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
    cities = Column(JSON, nullable=True)  # список городов, которые входят в проект
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# Воронки для роли owner: типы и этапы заданы в коде (owner_funnels router)
OWNER_FUNNEL_SUPPORT_LETTERS = "support_letters"   # Получить письма поддержки
OWNER_FUNNEL_THANK_YOU_LETTERS = "thank_you_letters"  # Письма благодарности
OWNER_FUNNEL_EVENTS = "events"  # Мероприятия

# Этапы по типам воронок (value для БД -> label для UI)
OWNER_FUNNEL_STAGES = {
    OWNER_FUNNEL_SUPPORT_LETTERS: [
        ("new", "Новое"),
        ("letter_created", "Создал письмо"),
        ("letter_sent", "Отправил письмо"),
        ("letter_received", "Получил письмо"),
    ],
    OWNER_FUNNEL_THANK_YOU_LETTERS: [
        ("new", "Новое"),
        ("thank_you_formed", "Сформировали благодарность"),
        ("thank_you_sent", "Отправили благодарность"),
        ("school_received", "Получила школа"),
    ],
    OWNER_FUNNEL_EVENTS: [
        ("new", "Новые"),
        ("contact_found", "Контакт найден"),
        ("letter_sent", "Отправили письмо"),
        ("reply_received", "Получили ответное письмо"),
        ("reached_by_phone", "Дозвонились"),
        ("not_reached", "Недозвонились"),
        ("meeting_agreed", "Договорились на встречу"),
        ("agreement_sent", "Отправили соглашение на согласование"),
        ("agreement_approved", "Согласовали соглашение"),
        ("agreement_signed", "Подписали соглашение"),
        ("trip_agreed", "Договорились на поход"),
        ("info_sent_to_parents", "Отправили информацию в чаты родителей"),
        ("leads_collected", "Собрали лидов"),
        ("rejected", "Отказали"),
    ],
}

# Этапы воронки «Мероприятия», при переходе на которые показывается popup и сохраняются данные в card_data
OWNER_FUNNEL_EVENTS_POPUP_STAGES = {
    "contact_found": ["contact_fio", "contact_phone", "contact_comment"],
    "reply_received": ["reply_comment"],
    "meeting_agreed": ["meeting_date"],
    "trip_agreed": ["trip_date"],
    "leads_collected": ["leads_count"],
}


class OwnerFunnelEvent(Base):
    """Мероприятие — сама воронка (доска с этапами). Карточки в колонках — элементы owner_funnel_items с event_id."""
    __tablename__ = "owner_funnel_events"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(512), nullable=False)
    event_dates = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OwnerFunnelItem(Base):
    """Элемент воронки owner (письма поддержки, благодарности; для мероприятий — карточка внутри воронки мероприятия)."""
    __tablename__ = "owner_funnel_items"

    id = Column(Integer, primary_key=True, index=True)
    funnel_type = Column(String(64), nullable=False, index=True)  # support_letters | thank_you_letters | events
    event_id = Column(Integer, ForeignKey("owner_funnel_events.id", ondelete="CASCADE"), nullable=True, index=True)  # только для events
    stage = Column(String(64), nullable=False, index=True)
    title = Column(String(512), nullable=True)
    comment = Column(Text, nullable=True)
    card_data = Column(JSON, nullable=True)  # для events: контакт, даты этапов и т.д. (event_name/event_dates — у мероприятия)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

