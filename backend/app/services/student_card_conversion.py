"""
Use case: конвертация анкеты (student card) в ученика (convert_student_card_to_student).

Домен: CRM (pre-student) → Education.
Источник: BACKEND_REFACTOR_USE_CASES.md.
При конфликтах (существующий родитель/ученик) выбрасывается StudentCardConvertConflict.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import Student, StudentCard, StudentStatus, User, UserRole
from app.services.parent_invite import create_parent_user_no_invite
from app.services.student_activity import log_student_activity
from app.services.person_sync import sync_student_card_person, sync_user_person


class StudentCardConvertConflict(Exception):
    """409: есть дубли — нужен выбор привязки к существующему родителю/ученику. detail — dict для HTTPException."""
    def __init__(self, detail: Dict[str, Any]):
        self.detail = detail
        super().__init__("Conflict: " + str(detail.get("message", "")))


@dataclass
class ConvertStudentCardResult:
    """Результат конвертации анкеты в ученика."""
    student_id: int
    card: StudentCard


def convert_student_card_to_student(
    db: Session,
    card_id: int,
    use_existing_parent_id: Optional[int] = None,
    use_existing_student_id: Optional[int] = None,
) -> ConvertStudentCardResult:
    """
    Конвертирует анкету (StudentCard) в ученика: привязка к существующему ученику,
    или к существующему родителю + новый ученик, или новый родитель + новый ученик.
    При конфликтах (родитель/ученик с таким email/ФИО уже есть) выбрасывает StudentCardConvertConflict.

    Raises:
        ValueError: карточка не найдена, уже конвертирована, нет email (для 400/404).
        StudentCardConvertConflict: конфликт по родителю/ученику (для 409).
    """
    card = db.query(StudentCard).filter(StudentCard.id == card_id).first()
    if not card:
        raise ValueError("Карточка не найдена")
    if getattr(card, "student_id", None) and getattr(card, "anketa_status", None) == "converted":
        return ConvertStudentCardResult(student_id=card.student_id, card=card)

    student_full_name = (card.student_full_name or "").strip() or "Ученик"
    parent_email = (getattr(card, "parent_email", None) or "").strip().lower()
    parent_full_name = (getattr(card, "parent_full_name", None) or "").strip() or "Родитель"

    # Явная привязка к существующему ученику
    if use_existing_student_id:
        student = db.query(Student).filter(Student.id == use_existing_student_id).first()
        if not student:
            raise ValueError("Ученик не найден")
        card.student_id = student.id
        card.anketa_status = "converted"
        sync_student_card_person(db, card)
        db.commit()
        db.refresh(card)
        return ConvertStudentCardResult(student_id=student.id, card=card)

    # Явный выбор существующего родителя
    if use_existing_parent_id:
        parent_user = db.query(User).filter(
            User.id == use_existing_parent_id, User.role == UserRole.PARENT
        ).first()
        if not parent_user:
            raise ValueError("Родитель не найден")
        sync_user_person(db, parent_user)
        same_name = db.query(Student).filter(
            Student.parent_id == parent_user.id,
            Student.full_name == student_full_name,
            Student.status == StudentStatus.ACTIVE,
        ).first()
        if same_name:
            raise StudentCardConvertConflict({
                "code": "existing_student",
                "message": "У этого родителя уже есть ученик с таким ФИО. Привяжите анкету к существующему ученику или создайте нового.",
                "existing_student_id": same_name.id,
                "existing_students": [{"id": same_name.id, "full_name": same_name.full_name}],
            })
        student = Student(
            full_name=student_full_name,
            parent_id=parent_user.id,
            status=StudentStatus.ACTIVE,
        )
        db.add(student)
        db.flush()
        card.student_id = student.id
        card.anketa_status = "converted"
        sync_student_card_person(db, card)
        log_student_activity(
            db,
            student_id=student.id,
            activity_type="enrolled",
            title="Конвертирован из анкеты",
            description=f"Анкета #{card.id}",
            created_by=None,
            payload_json={"student_card_id": card.id},
        )
        db.commit()
        db.refresh(card)
        return ConvertStudentCardResult(student_id=student.id, card=card)

    # Без явного выбора: проверяем email и ищем/создаём родителя
    if not parent_email:
        raise ValueError("Укажите email родителя в анкете для конверсии")

    existing_parent = db.query(User).filter(
        User.email == parent_email, User.role == UserRole.PARENT
    ).first()
    if existing_parent:
        sync_user_person(db, existing_parent)
        same_name = db.query(Student).filter(
            Student.parent_id == existing_parent.id,
            Student.full_name == student_full_name,
            Student.status == StudentStatus.ACTIVE,
        ).first()
        if same_name:
            raise StudentCardConvertConflict({
                "code": "existing_student",
                "message": "У найденного родителя уже есть ученик с таким ФИО.",
                "existing_parent_id": existing_parent.id,
                "existing_student_id": same_name.id,
                "existing_students": [{"id": same_name.id, "full_name": same_name.full_name}],
            })
        # Родитель есть, ученика с таким ФИО нет — но мы не создаём автоматически, требуем явный выбор
        existing_students = [
            {"id": s.id, "full_name": s.full_name}
            for s in (existing_parent.students or [])
        ]
        raise StudentCardConvertConflict({
            "code": "existing_parent",
            "message": "Родитель с таким email уже есть. Привяжите анкету к нему или создайте нового ученика.",
            "existing_parent_id": existing_parent.id,
            "existing_students": existing_students,
        })

    # Создаём нового родителя и ученика
    parent_user = create_parent_user_no_invite(db, parent_email, parent_full_name)
    db.flush()
    sync_user_person(db, parent_user)
    student = Student(
        full_name=student_full_name,
        parent_id=parent_user.id,
        status=StudentStatus.ACTIVE,
    )
    db.add(student)
    db.flush()
    card.student_id = student.id
    card.anketa_status = "converted"
    sync_student_card_person(db, card)
    log_student_activity(
        db,
        student_id=student.id,
        activity_type="enrolled",
        title="Конвертирован из анкеты",
        description=f"Анкета #{card.id}",
        created_by=None,
        payload_json={"student_card_id": card.id},
    )
    db.commit()
    db.refresh(card)
    return ConvertStudentCardResult(student_id=student.id, card=card)
