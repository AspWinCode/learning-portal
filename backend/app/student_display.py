"""ФИО ученика для отображения: из карточки ученика (StudentCard), если привязана, иначе из Student.full_name."""
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import Student, StudentCard


def get_student_display_name(db: Session, student: Student) -> str:
    """Возвращает ФИО для отображения: из карточки ученика (не архивной), если привязана, иначе student.full_name."""
    if not student:
        return ""
    card = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id == student.id,
            StudentCard.archived.is_(False),
        )
        .first()
    )
    if card and card.student_full_name:
        return (card.student_full_name or "").strip() or "—"
    return (student.full_name or "").strip() or "—"


def get_students_display_names(db: Session, student_ids: List[int]) -> Dict[int, str]:
    """Для списка student_id возвращает словарь {student_id: display_name}. Имена из карточек (не архивных), иначе из Student."""
    if not student_ids:
        return {}
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    student_map = {s.id: (s.full_name or "").strip() or "—" for s in students}
    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.in_(student_ids),
            StudentCard.archived.is_(False),
        )
        .all()
    )
    result = dict(student_map)
    for card in cards:
        if card.student_id and card.student_full_name:
            result[card.student_id] = (card.student_full_name or "").strip() or result.get(card.student_id, "—")
    return result
