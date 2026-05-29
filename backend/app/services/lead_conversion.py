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
from app.services.parent_invite import (
    create_parent_with_invite,
    create_invite_for_existing_parent,
)
from app.services.email_sender import is_email_configured, send_email
from app.routers.action_log import log_action
from app.utils.phone import normalize_phone
from app.services.student_activity import log_student_activity
from app.services.person_sync import sync_lead_person, sync_student_card_person, sync_user_person


@dataclass
class ConvertLeadToStudentResult:
    """Результат конвертации лида в ученика."""
    student_id: int
    lead: Lead
    invite_link: Optional[str] = None
    parent_id: Optional[int] = None
    parent_email: Optional[str] = None


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
) -> StudentCard:
    """
    При конвертации лида: ищем анкету (StudentCard) по email и ФИО ребёнка и привязываем к ученику;
    если не нашли — создаём карточку из данных лида и questionnaire_data.
    """
    existing_student_card = db.query(StudentCard).filter(StudentCard.student_id == student.id).first()
    if existing_student_card:
        lead.student_card_id = existing_student_card.id
        sync_student_card_person(db, existing_student_card)
        return existing_student_card
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
    student_phone = (getattr(lead, "child_phone", None) or "").strip() or (q.get("child_phone") or "")
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
        if not (card.parent_full_name or "").strip():
            card.parent_full_name = parent_full_name or None
        if not (card.parent_phone or "").strip():
            card.parent_phone = parent_phone or None
        if not card.phone_normalized:
            card.phone_normalized = normalize_phone(parent_phone or student_phone or "")
        lead.student_card_id = card.id
        sync_student_card_person(db, card)
        return card
    parent_email_val = (getattr(lead, "email", None) or "").strip() or (q.get("parent_email") or "")
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
        phone_normalized=normalize_phone(parent_phone or student_phone or "") or None,
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
    db.flush()
    lead.student_card_id = card.id
    sync_student_card_person(db, card)
    return card


def _send_parent_invite_email(
    parent_email: str,
    parent_full_name: str,
    student_full_name: str,
    invite_link: str,
) -> None:
    """Отправляет email родителю со ссылкой на установку пароля. Не бросает исключений."""
    if not is_email_configured():
        return
    try:
        subject = f"Доступ к кабинету ученика — {student_full_name}"
        body = (
            f"Здравствуйте, {parent_full_name}!\n\n"
            f"Для Вашего ребёнка {student_full_name} открыт доступ к личному кабинету ученика.\n\n"
            f"Установите пароль для входа по ссылке:\n{invite_link}\n\n"
            "Ссылка действительна 7 дней.\n\n"
            "С уважением,\nКоманда школы"
        )
        send_email(to_email=parent_email, subject=subject, body=body)
    except Exception:
        pass


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
    invite_link: Optional[str] = None

    if existing_parent:
        # Генерируем новый инвайт для уже существующего родителя (обновляем токен)
        invite_link = create_invite_for_existing_parent(db, existing_parent)
        db.flush()
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
            sync_lead_person(db, lead)
            db.commit()
            db.refresh(lead)
            db.refresh(same_name)
            log_action(db, actor_user_id, "convert_lead_to_student", "lead", lead.id, {"student_id": same_name.id})
            _send_parent_invite_email(parent_email, parent_full_name, student_full_name, invite_link)
            return ConvertLeadToStudentResult(
                student_id=same_name.id,
                lead=lead,
                invite_link=invite_link,
                parent_id=existing_parent.id,
                parent_email=parent_email,
            )
        parent_user = existing_parent
    else:
        parent_user, invite_link = create_parent_with_invite(db, parent_email, parent_full_name)
        db.flush()

    sync_user_person(db, parent_user)

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
    sync_lead_person(db, lead)
    log_student_activity(
        db,
        student_id=student.id,
        activity_type="enrolled",
        title="Конвертирован из лида",
        description=f"Лид #{lead.id}",
        created_by=actor_user_id,
        payload_json={"lead_id": lead.id},
    )
    db.commit()
    db.refresh(lead)
    db.refresh(student)
    log_action(db, actor_user_id, "convert_lead_to_student", "lead", lead.id, {"student_id": student.id})
    _send_parent_invite_email(parent_email, parent_full_name, student_full_name, invite_link)
    return ConvertLeadToStudentResult(
        student_id=student.id,
        lead=lead,
        invite_link=invite_link,
        parent_id=parent_user.id,
        parent_email=parent_email,
    )
