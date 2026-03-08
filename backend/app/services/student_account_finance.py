"""
Создание счёта ученика (StudentAccount). Канонический владелец — Finance (ТЗ этап 4).

Используется из Education (students) при создании счёта и из Finance API.
"""

from sqlalchemy.orm import Session

from app.models import Student, StudentAccount


def create_student_account(
    db: Session,
    student_id: int,
    name: str,
) -> StudentAccount:
    """
    Создаёт счёт ученика. Не выполняет commit — вызывающий код коммитит.

    Raises:
        ValueError: ученик не найден; имя пустое.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise ValueError("Student not found")
    name_stripped = (name or "").strip()
    if not name_stripped:
        raise ValueError("Название счета обязательно")
    account = StudentAccount(student_id=student_id, name=name_stripped, balance=0.0)
    db.add(account)
    db.flush()
    db.refresh(account)
    return account
