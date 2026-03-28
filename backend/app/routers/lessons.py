"""Единый роутер /api/lessons — новая архитектура материализованных занятий.

Все типы занятий (групповые, ручные, отработки, пробные, доп.платные)
работают через единую сущность LessonInstance.
"""

from __future__ import annotations

import logging
from datetime import date, time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload, subqueryload

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    AbsenceFollowUp,
    Group,
    GroupSchedule,
    GroupStatus,
    GroupStudent,
    LessonAuditLog,
    LessonInstance,
    LessonInstanceStudent,
    Student,
    StudentStatus,
    StudentFreeze,
    User,
    UserRole,
)
from app.services.lesson_generator import generate_lesson_instances

logger = logging.getLogger(__name__)

router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Схемы запросов / ответов
# ──────────────────────────────────────────────────────────────

class LessonStudentOut(BaseModel):
    id: int                        # id LessonInstanceStudent
    student_id: int
    student_name: str
    participation_status: str      # planned | added_manual | removed
    attended: Optional[bool]
    late: bool
    absence_reason: Optional[str]
    absence_comment: Optional[str]
    planned_absence_id: Optional[int]
    freeze_badge: Optional[str]    # текст заморозки если активна на дату урока

    class Config:
        from_attributes = True


class LessonOut(BaseModel):
    id: int
    group_id: Optional[int]
    group_name: Optional[str]
    schedule_id: Optional[int]
    lesson_date: str               # YYYY-MM-DD
    start_time: str                # HH:MM
    end_time: Optional[str]
    trainer_id: Optional[int]
    trainer_name: Optional[str]
    title: Optional[str]
    program_id: Optional[int]
    program_name: Optional[str]
    lesson_type: str               # group | manual | makeup | paid_extra | free_trial
    status: str                    # planned | completed | cancelled | moved
    comment: Optional[str]
    source_type: Optional[str]
    moved_from_id: Optional[int]
    moved_to_id: Optional[int]
    cancel_reason: Optional[str]
    students: list[LessonStudentOut]
    # Производные поля для UI
    students_count: int
    attended_count: int


class AttendanceItem(BaseModel):
    lesson_student_id: int         # id LessonInstanceStudent
    attended: bool
    late: bool = False
    absence_reason: Optional[str] = None
    absence_comment: Optional[str] = None


class SaveAttendanceRequest(BaseModel):
    items: list[AttendanceItem]


class SetTrainerRequest(BaseModel):
    trainer_id: int


class AddStudentRequest(BaseModel):
    student_id: int
    planned_absence_id: Optional[int] = None


class MoveRequest(BaseModel):
    to_date: str                   # YYYY-MM-DD
    to_start_time: Optional[str] = None  # HH:MM, если меняется время
    to_end_time: Optional[str] = None


class CancelRequest(BaseModel):
    cancel_reason: Optional[str] = None


class CreateManualLessonRequest(BaseModel):
    title: str
    lesson_date: str               # YYYY-MM-DD
    start_time: str                # HH:MM
    end_time: Optional[str] = None
    trainer_id: int
    lesson_type: str = "manual"   # manual | makeup | paid_extra | free_trial
    comment: Optional[str] = None
    students: list[dict] = []     # [{student_id, planned_absence_id?}]


class CreateGroupLessonRequest(BaseModel):
    """Создание группового занятия вне шаблона расписания."""
    group_id: int
    lesson_date: str               # YYYY-MM-DD
    start_time: str                # HH:MM
    end_time: Optional[str] = None
    comment: Optional[str] = None


class GenerateRequest(BaseModel):
    group_id: Optional[int] = None
    horizon_days: int = 60


# ──────────────────────────────────────────────────────────────
# Вспомогательные функции
# ──────────────────────────────────────────────────────────────

def _format_time(t: Optional[time]) -> Optional[str]:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Неверный формат даты: {s}")


def _parse_time(s: Optional[str]) -> Optional[time]:
    if not s:
        return None
    try:
        parts = s.split(":")
        return time(int(parts[0]), int(parts[1]))
    except Exception:
        raise HTTPException(status_code=422, detail=f"Неверный формат времени: {s}")


def _serialize_lesson(
    li: LessonInstance,
    freeze_badges: Optional[dict[int, str]] = None,
) -> LessonOut:
    students_out: list[LessonStudentOut] = []
    for lis in li.lesson_students:
        if lis.participation_status == "removed":
            continue  # удалённых не показываем
        students_out.append(LessonStudentOut(
            id=lis.id,
            student_id=lis.student_id,
            student_name=lis.student.full_name if lis.student else "",
            participation_status=lis.participation_status,
            attended=lis.attended,
            late=lis.late,
            absence_reason=lis.absence_reason,
            absence_comment=lis.absence_comment,
            planned_absence_id=lis.planned_absence_id,
            freeze_badge=(freeze_badges or {}).get(lis.student_id),
        ))

    attended_count = sum(1 for s in students_out if s.attended is True)

    return LessonOut(
        id=li.id,
        group_id=li.group_id,
        group_name=li.group.name if li.group else None,
        schedule_id=li.schedule_id,
        lesson_date=li.lesson_date.isoformat(),
        start_time=_format_time(li.start_time),
        end_time=_format_time(li.end_time),
        trainer_id=li.trainer_id,
        trainer_name=li.trainer.full_name if li.trainer else None,
        title=li.title,
        program_id=li.program_id,
        program_name=li.program.name if li.program else None,
        lesson_type=li.lesson_type,
        status=li.status,
        comment=li.comment,
        source_type=li.source_type,
        moved_from_id=li.moved_from_id,
        moved_to_id=li.moved_to_id,
        cancel_reason=li.cancel_reason,
        students=students_out,
        students_count=len(students_out),
        attended_count=attended_count,
    )


def _require_roles(current_user: User, roles: list[str]) -> None:
    if current_user.role.value not in roles:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


def _add_audit(
    db: Session,
    lesson_id: int,
    action: str,
    changed_by_id: Optional[int],
    *,
    entity_type: str = "lesson",
    entity_id: Optional[int] = None,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    log = LessonAuditLog(
        lesson_instance_id=lesson_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        changed_by_id=changed_by_id,
    )
    db.add(log)


# ──────────────────────────────────────────────────────────────
# GET /api/lessons?date=YYYY-MM-DD
# ──────────────────────────────────────────────────────────────

@router.get("/", response_model=list[LessonOut])
def get_lessons_for_date(
    lesson_date: str = Query(..., alias="date"),
    lesson_type: Optional[str] = Query(None),   # фильтр по типу
    status: Optional[str] = Query(None),         # фильтр по статусу
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает все занятия на заданную дату в едином формате."""
    _require_roles(current_user, ["admin", "owner", "trainer", "sales"])

    target_date = _parse_date(lesson_date)

    query = (
        db.query(LessonInstance)
        .options(
            joinedload(LessonInstance.group),
            joinedload(LessonInstance.trainer),
            joinedload(LessonInstance.program),
            subqueryload(LessonInstance.lesson_students).joinedload(
                LessonInstanceStudent.student
            ),
        )
        .filter(LessonInstance.lesson_date == target_date)
    )

    # Тренер видит только свои занятия
    if current_user.role == UserRole.TRAINER:
        query = query.filter(LessonInstance.trainer_id == current_user.id)

    if lesson_type:
        query = query.filter(LessonInstance.lesson_type == lesson_type)

    if status:
        query = query.filter(LessonInstance.status == status)

    lessons = query.order_by(LessonInstance.start_time).all()

    # Собираем все student_id на эту дату и грузим заморозки одним запросом
    all_student_ids: set[int] = set()
    for li in lessons:
        for lis in li.lesson_students:
            if lis.participation_status != "removed":
                all_student_ids.add(lis.student_id)

    freeze_badges: dict[int, str] = {}
    if all_student_ids:
        freezes = db.query(StudentFreeze).filter(
            StudentFreeze.student_id.in_(list(all_student_ids)),
            StudentFreeze.freeze_start <= target_date,
            StudentFreeze.freeze_end >= target_date,
        ).all()
        freeze_badges = {
            f.student_id: f"Заморожен с {f.freeze_start.strftime('%d.%m')} по {f.freeze_end.strftime('%d.%m')}"
            for f in freezes
        }

    return [_serialize_lesson(li, freeze_badges) for li in lessons]


# ──────────────────────────────────────────────────────────────
# GET /api/lessons/{id}
# ──────────────────────────────────────────────────────────────

@router.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, ["admin", "owner", "trainer", "sales"])
    li = (
        db.query(LessonInstance)
        .options(
            joinedload(LessonInstance.group),
            joinedload(LessonInstance.trainer),
            joinedload(LessonInstance.program),
            subqueryload(LessonInstance.lesson_students).joinedload(
                LessonInstanceStudent.student
            ),
        )
        .filter(LessonInstance.id == lesson_id)
        .first()
    )
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if current_user.role == UserRole.TRAINER and li.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому занятию")

    student_ids = [lis.student_id for lis in li.lesson_students if lis.participation_status != "removed"]
    freeze_badges: dict[int, str] = {}
    if student_ids:
        freezes = db.query(StudentFreeze).filter(
            StudentFreeze.student_id.in_(student_ids),
            StudentFreeze.freeze_start <= li.lesson_date,
            StudentFreeze.freeze_end >= li.lesson_date,
        ).all()
        freeze_badges = {
            f.student_id: f"Заморожен с {f.freeze_start.strftime('%d.%m')} по {f.freeze_end.strftime('%d.%m')}"
            for f in freezes
        }
    return _serialize_lesson(li, freeze_badges)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/{id}/attendance
# ──────────────────────────────────────────────────────────────

@router.post("/{lesson_id}/attendance", response_model=LessonOut)
def save_attendance(
    lesson_id: int,
    payload: SaveAttendanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сохраняет посещаемость для конкретного экземпляра занятия."""
    _require_roles(current_user, ["admin", "owner", "trainer", "sales"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if li.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено, посещаемость нельзя изменить")

    if current_user.role == UserRole.TRAINER and li.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому занятию")

    # Индекс: lesson_student_id → объект
    student_map: dict[int, LessonInstanceStudent] = {
        lis.id: lis for lis in li.lesson_students
    }

    for item in payload.items:
        lis = student_map.get(item.lesson_student_id)
        if not lis:
            continue

        old_attended = lis.attended
        lis.attended = item.attended
        lis.late = item.late
        lis.absence_reason = item.absence_reason if not item.attended else None
        lis.absence_comment = item.absence_comment if not item.attended else None

        _add_audit(
            db, lesson_id, "save_attendance", current_user.id,
            entity_type="student",
            entity_id=lis.student_id,
            field_name="attended",
            old_value=str(old_attended),
            new_value=str(item.attended),
        )

        # Если отработка и отметили как присутствовал — закрываем пропуск
        if lis.planned_absence_id and item.attended:
            follow_up = db.query(AbsenceFollowUp).filter(
                AbsenceFollowUp.id == lis.planned_absence_id
            ).first()
            if follow_up and follow_up.stage in ("assigned", "link_sent"):
                follow_up.stage = "made_up"
            elif follow_up and follow_up.stage == "assigned":
                follow_up.stage = "made_up"

        # Если ученик отсутствует — создаём/обновляем AbsenceFollowUp
        if not item.attended and old_attended is not False:
            # Проверяем заморозку: замороженные не попадают в воронку пропусков
            in_freeze = db.query(StudentFreeze).filter(
                StudentFreeze.student_id == lis.student_id,
                StudentFreeze.freeze_start <= li.lesson_date,
                StudentFreeze.freeze_end >= li.lesson_date,
            ).first()
            if not in_freeze:
                # Для групповых уроков — ищем AbsenceFollowUp по lesson_instance_id
                existing_absence = db.query(AbsenceFollowUp).filter(
                    AbsenceFollowUp.lesson_instance_id == lesson_id,
                    AbsenceFollowUp.student_id == lis.student_id,
                ).first()
                if not existing_absence:
                    db.add(AbsenceFollowUp(
                        lesson_instance_id=lesson_id,
                        student_id=lis.student_id,
                        group_id=li.group_id,
                        lesson_date=li.lesson_date,
                        stage="missed",
                        absence_reason=item.absence_reason,
                        absence_comment=item.absence_comment,
                    ))
                else:
                    existing_absence.absence_reason = item.absence_reason
                    existing_absence.absence_comment = item.absence_comment

        # Если ученик пришёл (был отмечен ранее как отсутствующий) — отзываем пропуск
        if item.attended and old_attended is False:
            absent_follow_up = db.query(AbsenceFollowUp).filter(
                AbsenceFollowUp.lesson_instance_id == lesson_id,
                AbsenceFollowUp.student_id == lis.student_id,
                AbsenceFollowUp.stage == "missed",
            ).first()
            if absent_follow_up:
                db.delete(absent_follow_up)

    # После отметки посещаемости — статус занятия completed
    li.status = "completed"
    li.updated_by_id = current_user.id

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/{id}/trainer
# ──────────────────────────────────────────────────────────────

@router.post("/{lesson_id}/trainer", response_model=LessonOut)
def set_trainer(
    lesson_id: int,
    payload: SetTrainerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Меняет тренера только у этого экземпляра занятия — не затрагивает группу."""
    _require_roles(current_user, ["admin", "owner", "sales"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    trainer = db.query(User).filter(
        User.id == payload.trainer_id,
        User.role == UserRole.TRAINER,
    ).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Тренер не найден")

    old_trainer_id = li.trainer_id
    li.trainer_id = payload.trainer_id
    li.updated_by_id = current_user.id

    _add_audit(
        db, lesson_id, "set_trainer", current_user.id,
        field_name="trainer_id",
        old_value=str(old_trainer_id),
        new_value=str(payload.trainer_id),
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/{id}/students  — добавить ученика
# ──────────────────────────────────────────────────────────────

@router.post("/{lesson_id}/students", response_model=LessonOut)
def add_student(
    lesson_id: int,
    payload: AddStudentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Добавляет ученика только в этот экземпляр занятия (не в группу)."""
    _require_roles(current_user, ["admin", "owner", "sales", "trainer"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    student = db.query(Student).filter(
        Student.id == payload.student_id,
        Student.status == StudentStatus.ACTIVE,
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден или не активен")

    # Проверяем, нет ли уже такого участника
    existing = db.query(LessonInstanceStudent).filter(
        LessonInstanceStudent.lesson_instance_id == lesson_id,
        LessonInstanceStudent.student_id == payload.student_id,
    ).first()

    if existing:
        if existing.participation_status == "removed":
            # Восстанавливаем удалённого
            existing.participation_status = "added_manual"
            existing.attended = None
        # Иначе уже есть — ничего не делаем
    else:
        lis = LessonInstanceStudent(
            lesson_instance_id=lesson_id,
            student_id=payload.student_id,
            participation_status="added_manual",
            attended=None,
            late=False,
            planned_absence_id=payload.planned_absence_id,
        )
        db.add(lis)
        # Если есть ссылка на пропуск — обновляем статус
        if payload.planned_absence_id:
            follow_up = db.query(AbsenceFollowUp).filter(
                AbsenceFollowUp.id == payload.planned_absence_id
            ).first()
            if follow_up and follow_up.stage == "missed":
                follow_up.stage = "assigned"

    li.updated_by_id = current_user.id
    _add_audit(
        db, lesson_id, "add_student", current_user.id,
        entity_type="student",
        entity_id=payload.student_id,
        new_value=f"student_id={payload.student_id}",
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# DELETE /api/lessons/{id}/students/{student_id}
# ──────────────────────────────────────────────────────────────

@router.delete("/{lesson_id}/students/{student_id}", response_model=LessonOut)
def remove_student(
    lesson_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Убирает ученика только из этого экземпляра занятия (мягкое удаление)."""
    _require_roles(current_user, ["admin", "owner"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    lis = db.query(LessonInstanceStudent).filter(
        LessonInstanceStudent.lesson_instance_id == lesson_id,
        LessonInstanceStudent.student_id == student_id,
    ).first()
    if not lis:
        raise HTTPException(status_code=404, detail="Ученик не найден в этом занятии")

    lis.participation_status = "removed"
    li.updated_by_id = current_user.id

    _add_audit(
        db, lesson_id, "remove_student", current_user.id,
        entity_type="student",
        entity_id=student_id,
        old_value=f"student_id={student_id}",
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/{id}/move
# ──────────────────────────────────────────────────────────────

@router.post("/{lesson_id}/move", response_model=LessonOut)
def move_lesson(
    lesson_id: int,
    payload: MoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Переносит занятие: исходный экземпляр → статус moved, создаётся новый экземпляр."""
    _require_roles(current_user, ["admin", "owner", "sales"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if li.status in ("cancelled", "moved"):
        raise HTTPException(status_code=400, detail=f"Занятие уже имеет статус: {li.status}")

    new_date = _parse_date(payload.to_date)
    new_start = _parse_time(payload.to_start_time) or li.start_time
    new_end = _parse_time(payload.to_end_time) or li.end_time

    # Помечаем исходный как перенесённый
    old_status = li.status
    li.status = "moved"
    li.updated_by_id = current_user.id

    # Создаём новый экземпляр
    new_li = LessonInstance(
        group_id=li.group_id,
        schedule_id=li.schedule_id,
        lesson_date=new_date,
        start_time=new_start,
        end_time=new_end,
        trainer_id=li.trainer_id,
        title=li.title,
        program_id=li.program_id,
        lesson_type=li.lesson_type,
        status="planned",
        comment=li.comment,
        source_type="move",
        moved_from_id=li.id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(new_li)
    db.flush()

    # Копируем состав учеников (только не удалённых)
    for lis in li.lesson_students:
        if lis.participation_status == "removed":
            continue
        new_lis = LessonInstanceStudent(
            lesson_instance_id=new_li.id,
            student_id=lis.student_id,
            participation_status=lis.participation_status,
            attended=None,
            late=False,
        )
        db.add(new_lis)

    # Связываем исходный с новым
    li.moved_to_id = new_li.id

    _add_audit(
        db, lesson_id, "move", current_user.id,
        old_value=f"date={li.lesson_date} status={old_status}",
        new_value=f"moved_to_id={new_li.id} date={new_date}",
    )
    _add_audit(
        db, new_li.id, "create", current_user.id,
        new_value=f"moved_from_id={lesson_id} date={new_date}",
    )

    db.commit()
    db.refresh(new_li)
    return _serialize_lesson(new_li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/{id}/cancel
# ──────────────────────────────────────────────────────────────

@router.post("/{lesson_id}/cancel", response_model=LessonOut)
def cancel_lesson(
    lesson_id: int,
    payload: CancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отменяет занятие (мягко — меняет статус на cancelled, не удаляет)."""
    _require_roles(current_user, ["admin", "owner", "sales"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if li.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие уже отменено")

    old_status = li.status
    li.status = "cancelled"
    li.cancel_reason = payload.cancel_reason
    li.updated_by_id = current_user.id

    _add_audit(
        db, lesson_id, "cancel", current_user.id,
        field_name="status",
        old_value=old_status,
        new_value="cancelled",
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/manual  — создать ручное занятие
# ──────────────────────────────────────────────────────────────

@router.post("/manual", response_model=LessonOut)
def create_manual_lesson(
    payload: CreateManualLessonRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт ручное занятие (без группы): отработка, пробное, доп.платное, manual."""
    _require_roles(current_user, ["admin", "owner", "sales"])

    lesson_date = _parse_date(payload.lesson_date)
    start_time = _parse_time(payload.start_time)
    end_time = _parse_time(payload.end_time)

    if not start_time:
        raise HTTPException(status_code=422, detail="Время начала обязательно")

    trainer = db.query(User).filter(
        User.id == payload.trainer_id,
        User.role == UserRole.TRAINER,
    ).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Тренер не найден")

    li = LessonInstance(
        group_id=None,
        schedule_id=None,
        lesson_date=lesson_date,
        start_time=start_time,
        end_time=end_time,
        trainer_id=payload.trainer_id,
        title=payload.title,
        lesson_type=payload.lesson_type,
        status="planned",
        comment=payload.comment,
        source_type="manual",
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(li)
    db.flush()

    for s in payload.students:
        student_id = s.get("student_id")
        planned_absence_id = s.get("planned_absence_id")

        student = db.query(Student).filter(
            Student.id == student_id,
            Student.status == StudentStatus.ACTIVE,
        ).first()
        if not student:
            continue

        lis = LessonInstanceStudent(
            lesson_instance_id=li.id,
            student_id=student_id,
            participation_status="planned",
            attended=None,
            late=False,
            planned_absence_id=planned_absence_id,
        )
        db.add(lis)

        # Обновляем статус пропуска
        if planned_absence_id and payload.lesson_type == "makeup":
            follow_up = db.query(AbsenceFollowUp).filter(
                AbsenceFollowUp.id == planned_absence_id
            ).first()
            if follow_up and follow_up.stage == "missed":
                follow_up.stage = "assigned"

    _add_audit(
        db, li.id, "create", current_user.id,
        new_value=f"manual lesson_type={payload.lesson_type} date={lesson_date}",
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/group  — создать групповое вне шаблона
# ──────────────────────────────────────────────────────────────

@router.post("/group", response_model=LessonOut)
def create_group_lesson(
    payload: CreateGroupLessonRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт групповое занятие вне шаблона расписания."""
    _require_roles(current_user, ["admin", "owner", "sales"])

    group = db.query(Group).filter(
        Group.id == payload.group_id,
        Group.status == GroupStatus.ACTIVE,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    lesson_date = _parse_date(payload.lesson_date)
    start_time = _parse_time(payload.start_time)
    end_time = _parse_time(payload.end_time)

    if not start_time:
        raise HTTPException(status_code=422, detail="Время начала обязательно")

    # Проверка start_date группы
    if group.start_date and lesson_date < group.start_date:
        raise HTTPException(
            status_code=400,
            detail=f"Дата раньше start_date группы ({group.start_date})",
        )

    li = LessonInstance(
        group_id=group.id,
        schedule_id=None,
        lesson_date=lesson_date,
        start_time=start_time,
        end_time=end_time,
        trainer_id=group.trainer_id,
        lesson_type="group",
        status="planned",
        comment=payload.comment,
        source_type="manual",
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(li)
    db.flush()

    # Копируем актуальный состав группы
    active_gs = db.query(GroupStudent).filter(
        GroupStudent.group_id == group.id,
        GroupStudent.left_at.is_(None),
    ).all()
    for gs in active_gs:
        if gs.student and gs.student.status == StudentStatus.ACTIVE:
            lis = LessonInstanceStudent(
                lesson_instance_id=li.id,
                student_id=gs.student_id,
                participation_status="planned",
                attended=None,
                late=False,
            )
            db.add(lis)

    _add_audit(
        db, li.id, "create", current_user.id,
        new_value=f"group_id={group.id} date={lesson_date} manual_slot",
    )

    db.commit()
    db.refresh(li)
    return _serialize_lesson(li)


# ──────────────────────────────────────────────────────────────
# GET /api/lessons/{id}/audit
# ──────────────────────────────────────────────────────────────

@router.get("/{lesson_id}/audit")
def get_audit(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает журнал изменений конкретного занятия."""
    _require_roles(current_user, ["admin", "owner"])

    li = db.query(LessonInstance).filter(LessonInstance.id == lesson_id).first()
    if not li:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    logs = (
        db.query(LessonAuditLog)
        .filter(LessonAuditLog.lesson_instance_id == lesson_id)
        .order_by(LessonAuditLog.changed_at.desc())
        .all()
    )

    return [
        {
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "changed_by": log.changed_by.full_name if log.changed_by else None,
            "changed_at": log.changed_at.isoformat() if log.changed_at else None,
        }
        for log in logs
    ]


# ──────────────────────────────────────────────────────────────
# POST /api/lessons/generate  — ручной запуск генерации
# ──────────────────────────────────────────────────────────────

@router.post("/generate")
def trigger_generation(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin/owner: вручную запускает генерацию экземпляров занятий."""
    _require_roles(current_user, ["admin", "owner"])

    result = generate_lesson_instances(
        db,
        horizon_days=payload.horizon_days,
        group_id=payload.group_id,
        actor_user_id=current_user.id,
    )
    return result
