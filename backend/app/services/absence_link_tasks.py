from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import AbsenceFollowUp, Task, TaskStatus, Student, Group, User, UserRole


def _get_sales_assignee(db: Session) -> int | None:
  """Находим любого активного sales-менеджера для назначения задач."""
  user = (
    db.query(User)
    .filter(User.role == UserRole.SALES, User.is_active.is_(True))
    .order_by(User.id.asc())
    .first()
  )
  return user.id if user else None


def create_link_task_on_assign(
  db: Session,
  absence: AbsenceFollowUp,
) -> None:
  """При назначении отработки создаём задачу «Отправить ссылку» на дату отработки."""
  if not absence.makeup_group_id or not absence.makeup_lesson_date:
    return

  student = db.query(Student).filter(Student.id == absence.student_id).first()
  group = db.query(Group).filter(Group.id == absence.makeup_group_id).first()
  if not student or not group:
    return

  assignee_id = _get_sales_assignee(db)
  title = f"Отправить ссылку: {getattr(student, 'full_name', '')} — {getattr(group, 'name', '')}"

  due_date = absence.makeup_lesson_date
  # Ставим срок утром в 09:00 по дате отработки
  due_at = datetime.combine(due_date, time(hour=9, minute=0), tzinfo=timezone.utc)

  task = Task(
    title=title,
    description=f"Отправить ссылку на отработку ученику {getattr(student, 'full_name', '')} в группе {getattr(group, 'name', '')}",
    created_by_id=assignee_id,
    assigned_to_id=assignee_id,
    status=TaskStatus.ACTIVE.value,
  )
  db.add(task)
  db.flush()


def create_morning_link_tasks(db: Session, target_date: date | None = None) -> int:
  """
  Утром в день отработки создаёт задачи «Отправить ссылку на занятие» для всех,
  у кого stage=link_sent и назначена отработка на target_date.
  Возвращает количество созданных задач.
  """
  if target_date is None:
    target_date = date.today()

  items = (
    db.query(AbsenceFollowUp)
    .filter(
      AbsenceFollowUp.stage == "link_sent",
      AbsenceFollowUp.makeup_lesson_date == target_date,
    )
    .all()
  )
  if not items:
    return 0

  created = 0
  for absence in items:
    student = db.query(Student).filter(Student.id == absence.student_id).first()
    group = db.query(Group).filter(Group.id == absence.makeup_group_id).first()
    if not student or not group:
      continue
    assignee_id = _get_sales_assignee(db)
    title = f"Отправить ссылку на занятие: {getattr(student, 'full_name', '')} — {getattr(group, 'name', '')}"
    due_at = datetime.combine(target_date, time(hour=9, minute=0), tzinfo=timezone.utc)
    task = Task(
      title=title,
      description=f"Отправить ссылку на занятие (отработка) ученику {getattr(student, 'full_name', '')} в группе {getattr(group, 'name', '')}",
      created_by_id=assignee_id,
      assigned_to_id=assignee_id,
      status=TaskStatus.ACTIVE.value,
    )
    db.add(task)
    created += 1

  db.flush()
  return created

