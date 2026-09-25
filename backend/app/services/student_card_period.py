"""Обновление периода обучения и даты следующей оплаты на карточке ученика."""
from datetime import date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    LessonAttendance,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
    StudentFreeze,
)


DEFAULT_LESSON_THRESHOLD = 8


def _get_or_create_card(db: Session, student_id: int) -> "StudentCard | None":
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if card:
        return card
    from app.models import Student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return None
    card = StudentCard(
        student_id=student_id,
        student_full_name=student.full_name,
    )
    db.add(card)
    db.flush()
    return card


def _lesson_threshold_for_card(card: "StudentCard") -> int:
    abonement = getattr(card, "abonement", None)
    if abonement and getattr(abonement, "lessons_count", None) and abonement.lessons_count > 0:
        return abonement.lessons_count
    return DEFAULT_LESSON_THRESHOLD


def is_student_on_grant(db: Session, student_id: int, card: "StudentCard | None" = None) -> bool:
    """Ученик на гранте (флаг на ученике или на карточке) — он не платит: нет долгов и отработок."""
    student = db.query(Student.on_grant).filter(Student.id == student_id).first()
    if student and student.on_grant:
        return True
    if card is None:
        card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    return bool(card and card.on_grant)


def _period_attendance_query(db: Session, student_id: int, period_start: "date | None"):
    """Уроки периода: только уже прошедшие (не будущие слоты) и вне заморозки —
    так же, как они списываются с баланса в trainer_lessons."""
    query = db.query(LessonAttendance).filter(
        LessonAttendance.student_id == student_id,
        LessonAttendance.lesson_date <= date.today(),
        ~(
            db.query(StudentFreeze.id)
            .filter(
                StudentFreeze.student_id == LessonAttendance.student_id,
                StudentFreeze.freeze_start <= LessonAttendance.lesson_date,
                StudentFreeze.freeze_end >= LessonAttendance.lesson_date,
            )
            .exists()
        ),
    )
    if period_start:
        query = query.filter(LessonAttendance.lesson_date >= period_start)
    return query


def _is_present_clause():
    return (LessonAttendance.attended.is_(True)) & (
        LessonAttendance.absence_reason.is_(None) | (LessonAttendance.absence_reason == "was")
    )


def count_lessons_since_period_start(db: Session, student_id: int, period_start: "date | None") -> int:
    """Количество уроков студента с даты начала периода (и посещённые, и пропущенные).
    Пропущенный урок всё равно считается — он занимает место в абонементе."""
    return _period_attendance_query(db, student_id, period_start).count()


def count_attended_since_period_start(db: Session, student_id: int, period_start: "date | None") -> int:
    """Сколько из уроков периода ученик реально посетил (без пропусков)."""
    return _period_attendance_query(db, student_id, period_start).filter(_is_present_clause()).count()


def _has_payment_since(db: Session, student_id: int, since: "date | None") -> bool:
    """Была ли оплата с даты since (начала текущего периода)."""
    query = (
        db.query(StudentAccountTransaction.id)
        .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
        .filter(
            StudentAccount.student_id == student_id,
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
        )
    )
    if since:
        query = query.filter(
            func.date(StudentAccountTransaction.created_at) >= since
        )
    return query.first() is not None


def check_lesson_payment_threshold(db: Session, student_id: int) -> None:
    """Проверить нужна ли оплата после отметки посещаемости (вызывается только для
    учеников, реально присутствовавших на уроке — см. вызов в trainer_lessons.py).

    Логика:
    - Урок посещён и оплаты за текущий период нет → next_payment_date = сегодня
    - Уроков накоплено >= порога (8) и была оплата → начать новый период.
      Если есть оплаченные вперёд периоды (prepaid_periods > 0) — списать один
      и не помечать долгом. Иначе — снова поставить next_payment_date (нужна оплата).
    """
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    if is_student_on_grant(db, student_id, card):
        # Грантовики не платят — не ставим им дату оплаты (и не держим висящую).
        card.next_payment_date = None
        return
    threshold = _lesson_threshold_for_card(card)
    lessons = count_lessons_since_period_start(db, student_id, card.learning_period_start)
    if lessons < 1:
        return

    has_payment = _has_payment_since(db, student_id, card.learning_period_start)

    if not has_payment:
        # Урок без оплаты → сразу в долги
        if not card.next_payment_date:
            card.next_payment_date = date.today()
    elif lessons >= threshold:
        # Период закончился (8 уроков) → новый период.
        # Начинаем со следующего дня: сам завершающий урок ещё относится к старому
        # периоду, а не к новому — иначе он задваивается в счётчике (см. отчёт бага).
        card.learning_period_start = date.today() + timedelta(days=1)
        if (card.prepaid_periods or 0) > 0:
            # Родитель уже оплатил этот период заранее — списываем из запаса
            card.prepaid_periods -= 1
            card.next_payment_date = None
        else:
            card.next_payment_date = date.today()


def sync_next_payment_date(db: Session, card: "StudentCard") -> None:
    """Привести next_payment_date в соответствие с текущим learning_period_start.

    Нужно вызывать после любого РУЧНОГО изменения даты начала периода (например,
    из админки или прямой правки в БД) — иначе next_payment_date может остаться
    в устаревшем состоянии: ученик уже оплатил текущий период, а флаг долга
    (или наоборот, отсутствие флага) относится к старой дате периода."""
    if not card.learning_period_start:
        return
    if is_student_on_grant(db, card.student_id, card):
        card.next_payment_date = None
        return
    threshold = _lesson_threshold_for_card(card)
    lessons = count_lessons_since_period_start(db, card.student_id, card.learning_period_start)
    has_payment = _has_payment_since(db, card.student_id, card.learning_period_start)
    if lessons < 1:
        card.next_payment_date = None
    elif has_payment and lessons < threshold:
        card.next_payment_date = None
    elif not has_payment:
        card.next_payment_date = card.next_payment_date or date.today()


def release_students_from_archived_group(db: Session, group_id: int) -> int:
    """Когда группа архивируется (курс завершён), больше уроков не будет —
    снять «висящий» долг за следующий период с учеников, у которых нет других
    активных групп, и закрыть их открытые автозадачи "оплата просрочена"
    (иначе они продолжат висеть в «Плане на сегодня» без причины).
    Возвращает количество затронутых карточек."""
    from app.models import Group, GroupStatus, GroupStudent, Task, TaskStudent

    member_ids = [
        row[0]
        for row in db.query(GroupStudent.student_id)
        .filter(GroupStudent.group_id == group_id, GroupStudent.left_at.is_(None))
        .all()
    ]
    if not member_ids:
        return 0

    released = 0
    for student_id in member_ids:
        has_other_active_group = (
            db.query(GroupStudent.id)
            .join(Group, Group.id == GroupStudent.group_id)
            .filter(
                GroupStudent.student_id == student_id,
                GroupStudent.group_id != group_id,
                GroupStudent.left_at.is_(None),
                Group.status == GroupStatus.ACTIVE,
            )
            .first()
        )
        if has_other_active_group:
            continue

        touched = False

        open_tasks = (
            db.query(Task)
            .join(TaskStudent, TaskStudent.task_id == Task.id)
            .filter(
                TaskStudent.student_id == student_id,
                Task.task_kind == "payment_overdue",
                Task.status == "active",
            )
            .all()
        )
        for task in open_tasks:
            task.status = "archived"
            touched = True

        card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
        if card and card.next_payment_date is not None:
            card.next_payment_date = None
            touched = True

        if touched:
            released += 1
    return released


def update_card_payment_dates(db: Session, student_id: int, payment_date: date) -> None:
    """Зафиксировать оплату. Если StudentCard ещё нет — создаётся автоматически.

    Если на карточке уже нет текущего долга (next_payment_date пуст, а период уже
    начат) — это оплата ВПЕРЁД: она не трогает текущий период, а откладывается
    в prepaid_periods и будет списана, когда наступит следующий период.
    Иначе (первая оплата или закрытие текущего долга) — оплата закрывает
    текущий период как обычно.
    """
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    if card.learning_period_start is not None and card.next_payment_date is None:
        card.prepaid_periods = (card.prepaid_periods or 0) + 1
        return
    card.learning_period_start = payment_date
    card.next_payment_date = None


def set_card_payment_dates_from_training_start(db: Session, student_id: int, start_date: date) -> None:
    """Установить learning_period_start от даты первого занятия (если ещё не задано).

    Берём минимум из переданной даты и самого раннего реального урока ученика —
    если это первое успешное срабатывание после того как более ранние вызовы
    молча падали с ошибкой (см. save_attendance в trainer_lessons.py), период
    всё равно не «уедет» вперёд от фактического начала занятий."""
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    if card.learning_period_start:
        return
    earliest = (
        db.query(func.min(LessonAttendance.lesson_date))
        .filter(LessonAttendance.student_id == student_id)
        .scalar()
    )
    card.learning_period_start = min(start_date, earliest) if earliest else start_date
