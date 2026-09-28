"""
Создание счёта ученика (StudentAccount). Канонический владелец — Finance (ТЗ этап 4).

Используется из Education (students) при создании счёта и из Finance API.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Student, StudentAccount


DEFAULT_STUDENT_ACCOUNT_NAME = "Основной"


def create_student_account(
    db: Session,
    student_id: int,
    name: str,
) -> StudentAccount:
    """
    Создаёт счёт ученика. Не выполняет commit — вызывающий код коммитит.

    Raises:
        ValueError: ученик не найден; имя пустое; счёт с таким именем уже есть.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise ValueError("Student not found")
    name_stripped = (name or "").strip()
    if not name_stripped:
        raise ValueError("Название счета обязательно")
    existing = (
        db.query(StudentAccount)
        .filter(StudentAccount.student_id == student_id, StudentAccount.name == name_stripped)
        .first()
    )
    if existing:
        raise ValueError(f"Счёт «{name_stripped}» у этого ученика уже существует")
    account = StudentAccount(student_id=student_id, name=name_stripped, balance=0.0)
    db.add(account)
    try:
        # savepoint so a unique-constraint race doesn't poison the caller's outer transaction
        with db.begin_nested():
            db.flush()
    except IntegrityError:
        existing = (
            db.query(StudentAccount)
            .filter(StudentAccount.student_id == student_id, StudentAccount.name == name_stripped)
            .first()
        )
        if existing:
            return existing
        raise
    db.refresh(account)
    return account


def ensure_default_student_account(db: Session, student_id: int) -> StudentAccount:
    account = (
        db.query(StudentAccount)
        .filter(
            StudentAccount.student_id == student_id,
            StudentAccount.name == DEFAULT_STUDENT_ACCOUNT_NAME,
        )
        .order_by(StudentAccount.id.asc())
        .first()
    )
    if account:
        return account
    try:
        return create_student_account(db, student_id, DEFAULT_STUDENT_ACCOUNT_NAME)
    except ValueError:
        # Другой конкурентный запрос уже создал счёт между проверкой и вставкой.
        account = (
            db.query(StudentAccount)
            .filter(
                StudentAccount.student_id == student_id,
                StudentAccount.name == DEFAULT_STUDENT_ACCOUNT_NAME,
            )
            .order_by(StudentAccount.id.asc())
            .first()
        )
        if account:
            return account
        raise
