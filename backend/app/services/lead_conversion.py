"""
Use case: конвертация лида в ученика (convert_lead_to_student).

Домен: CRM → Education.
Источник: BACKEND_REFACTOR_USE_CASES.md.
Роутер не должен содержать бизнес-логику — только валидацию, вызов сервиса и ответ.
"""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Lead,
    LeadStatus,
    LeadStatusOption,
    Student,
    StudentStatus,
    User,
    UserRole,
    StudentCard,
    DiscountType,
)
from app.services.parent_invite import create_parent_user_no_invite
from app.routers.action_log import log_action


@dataclass
class ConvertLeadToStudentResult:
    """Результат конвертации лида в ученика."""
    student_id: int
    lead: Lead


def _get_default_lead_status_option_id(db: Session, base_status: LeadStatus) -> Optional[int]:
    """Возвращает id первой активной опции статуса лида для данного base_status."""
    status_str = base_status.value if hasattr(base_status, "value") else str(base_status)
    opt = (
        db.query(LeadStatusOption)
        .filter(
            LeadStatusOption.base_status == status_str,
            LeadStatusOption.is_active.is_(True),
        )
        .order_by(LeadStatusOption.id.asc())
        .first()
    )
    return opt.id if opt else None


def _find_or_create_student_card_for_lead(
    db: Session, lead: Lead, student: Student, student_full_name: str
) -> None:
    """
    При конвертации лида: ищем анкету (StudentCard) по email и ФИО ребёнка и привязываем к ученику;
    если не нашли — создаём карточку из данных лида и questionnaire_data.
    """
    if db.query(StudentCard).filter(StudentCard.student_id == student.id).first():
        return
    parent_email = (getattr(lead, "email", None) or "").strip().lower()
    card = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.is_(None),
            StudentCard.anketa_status == "filled",
            StudentCard.parent_email == parent_email,
            StudentCard.student_full_name == student_full_name,
        )
        .first()
    )
    if card:
        card.student_id = student.id
        card.anketa_status = "converted"
        return
    q = getattr(lead, "questionnaire_data", None) or {}
    if not isinstance(q, dict):
        q = {}
    parent_full_name = (
        (getattr(lead, "parent_full_name", None) or getattr(lead, "contact_name", None) or "").strip()
        or (q.get("parent_full_name") or "")
    )
    parent_phone = (
        (getattr(lead, "parent_phone", None) or getattr(lead, "phone", None) or "").strip()
        or (q.get("parent_phone") or "")
    )
    parent_email_val = (getattr(lead, "email", None) or "").strip() or (q.get("parent_email") or "")
    student_phone = (getattr(lead, "child_phone", None) or "").strip() or (q.get("child_phone") or "")
    city = (getattr(lead, "city", None) or "").strip() or (q.get("city") or "")
    school = (getattr(lead, "school_name", None) or "").strip() or (q.get("school_name") or "")
    grade = (getattr(lead, "school_class", None) or "").strip() or (q.get("school_class") or "")
    comment = (getattr(lead, "comment", None) or "").strip() or (q.get("comment") or "")
    source = (getattr(lead, "source", None) or "").strip() or (q.get("source") or "")
    birth_date_val = q.get("birth_date")
    if isinstance(birth_date_val, str) and birth_date_val.strip():
        try:
            from datetime import datetime as dt
            birth_date_val = dt.strptime(birth_date_val.strip()[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            birth_date_val = None
    elif birth_date_val is None or not getattr(birth_date_val, "year", None):
        birth_date_val = None
    card = StudentCard(
        student_id=student.id,
        student_full_name=student_full_name,
        parent_full_name=parent_full_name or None,
        parent_phone=parent_phone or None,
        parent_phone_2=(q.get("parent_phone_2") or "").strip() or None,
        parent_telegram=(q.get("parent_telegram") or "").strip() or None,
        parent_email=parent_email_val or None,
        student_phone=student_phone or None,
        telegram=(q.get("child_telegram") or "").strip() or None,
        student_email=(q.get("student_email") or "").strip() or None,
        birth_date=birth_date_val,
        gender=(q.get("gender") or "").strip() or None,
        city=city or None,
        school=school or None,
        grade=grade or None,
        preferred_messenger=(q.get("preferred_messenger") or "").strip() or None,
        comment=comment or None,
        source=source or None,
        anketa_status="converted",
        discount_type=DiscountType.NONE,
        discount_value=0.0,
    )
    db.add(card)


def convert_lead_to_student(
    db: Session,
    lead_id: int,
    actor_user_id: Optional[int] = None,
) -> ConvertLeadToStudentResult:
    """
    Конвертирует лида в ученика: создаёт или находит родителя, создаёт ученика,
    привязывает/создаёт анкету (StudentCard), обновляет лида (status=WON), пишет в action log.

    Raises:
        ValueError: лид не найден, уже конвертирован, или нет email (с сообщением для HTTP 400/404).
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise ValueError("Лид не найден")
    if getattr(lead, "converted_to_student_id", None):
        student = db.query(Student).filter(Student.id == lead.converted_to_student_id).first()
        if student:
            return ConvertLeadToStudentResult(student_id=student.id, lead=lead)

    parent_email = (getattr(lead, "email", None) or "").strip().lower()
    if not parent_email:
        raise ValueError("У лида не указан email. Укажите email для конвертации в ученика.")

    parent_full_name = (
        getattr(lead, "parent_full_name", None) or getattr(lead, "contact_name", None) or ""
    ).strip() or "Родитель"
    student_full_name = (
        getattr(lead, "child_full_name", None) or getattr(lead, "contact_name", None) or ""
    ).strip() or "Ученик"

    existing_parent = (
        db.query(User).filter(User.email == parent_email, User.role == UserRole.PARENT).first()
    )
    if existing_parent:
        same_name = (
            db.query(Student)
            .filter(
                Student.parent_id == existing_parent.id,
                Student.full_name == student_full_name,
                Student.status == StudentStatus.ACTIVE,
            )
            .first()
        )
        if same_name:
            lead.converted_to_student_id = same_name.id
            lead.status = LeadStatus.WON
            lead.status_option_id = _get_default_lead_status_option_id(db, LeadStatus.WON)
            if not getattr(same_name, "from_lead_id", None):
                same_name.from_lead_id = lead.id
            _find_or_create_student_card_for_lead(db, lead, same_name, student_full_name)
            db.commit()
            db.refresh(lead)
            db.refresh(same_name)
            log_action(db, actor_user_id, "convert_lead_to_student", "lead", lead.id, {"student_id": same_name.id})
            return ConvertLeadToStudentResult(student_id=same_name.id, lead=lead)
        parent_user = existing_parent
    else:
        parent_user = create_parent_user_no_invite(db, parent_email, parent_full_name)
        db.flush()

    student = Student(
        full_name=student_full_name,
        parent_id=parent_user.id,
        status=StudentStatus.ACTIVE,
        from_lead_id=lead.id,
    )
    db.add(student)
    db.flush()
    lead.converted_to_student_id = student.id
    lead.status = LeadStatus.WON
    lead.status_option_id = _get_default_lead_status_option_id(db, LeadStatus.WON)
    _find_or_create_student_card_for_lead(db, lead, student, student_full_name)
    db.commit()
    db.refresh(lead)
    db.refresh(student)
    log_action(db, actor_user_id, "convert_lead_to_student", "lead", lead.id, {"student_id": student.id})
    return ConvertLeadToStudentResult(student_id=student.id, lead=lead)
