"""API для тренера: занятия по расписанию и посещаемость."""
import calendar
from datetime import date, time, datetime, timedelta
from typing import List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.academic_month import get_academic_window
from app.database import get_db
from app import auth
from app.models import (
    User,
    Group,
    GroupStatus,
    GroupSchedule,
    GroupStudent,
    LessonAttendance,
    LessonCancellation,
    LessonTrainerOverride,
    LessonSlotExtraPolicy,
    UserRole,
    Student,
    Abonement,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    AbsenceFollowUp,
    StudentFreeze,
    CustomLesson,
    CustomLessonStudent,
)
from app.schemas import (
    TrainerLessonSlotResponse,
    LessonAttendanceSave,
    MoveLessonPayload,
    CancelLessonPayload,
    CreateLessonSlotPayload,
    AddStudentToLessonPayload,
    RemoveStudentFromLessonPayload,
    SetLessonTrainerPayload,
    CustomLessonAttendancePayload,
    CustomLessonResponse,
)
from app.student_display import get_student_display_name, get_students_display_names

router = APIRouter()

LESSONS_PER_MONTH = 8


def _first_n_slots_per_group_in_month(
    db: Session,
    group_ids: List[int],
    year: int,
    month: int,
    cancellations: List,
    individual_group_ids: Optional[Set[int]] = None,
) -> Tuple[Set[Tuple[int, date, time, time]], dict]:
    """Для каждой группы возвращает множество (group_id, date, start_time, end_time) первых 8 слотов в месяце (или все слоты для индивидуальных групп) и маппинг (group_id, date, st, et) -> index 1..8."""
    individual_group_ids = individual_group_ids or set()
    cancelled_set = {(c.group_id, c.lesson_date, c.start_time, c.end_time) for c in cancellations}
    allowed: Set[Tuple[int, date, time, time]] = set()
    index_map: dict = {}
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year, 12, 31)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)
    for gid in group_ids:
        schedules = db.query(GroupSchedule).filter(GroupSchedule.group_id == gid).order_by(GroupSchedule.day_of_week, GroupSchedule.start_time).all()
        slots_in_month: List[Tuple[date, time, time]] = []
        for sched in schedules:
            for d in calendar.Calendar().itermonthdates(year, month):
                if d.month != month:
                    continue
                if d.weekday() == sched.day_of_week:
                    if (gid, d, sched.start_time, sched.end_time) not in cancelled_set:
                        slots_in_month.append((d, sched.start_time, sched.end_time))
        slots_in_month.sort(key=lambda x: (x[0], x[1]))
        n = len(slots_in_month) if gid in individual_group_ids else min(LESSONS_PER_MONTH, len(slots_in_month))
        for i, (d, st, et) in enumerate(slots_in_month[:n]):
            allowed.add((gid, d, st, et))
            index_map[(gid, d, st, et)] = i + 1
    return allowed, index_map


def _serialize_time(t: time) -> str:
    return t.strftime("%H:%M") if t else ""


def _slot_key(att: LessonAttendance) -> Tuple[date, time, time]:
    """Ключ для упорядочивания посещаемости по слотам (дата, начало, конец)."""
    st = getattr(att, "lesson_start_time", None) or time(0, 0)
    et = getattr(att, "lesson_end_time", None) or time(0, 0)
    return (att.lesson_date, st, et)


@router.get("/", response_model=List[TrainerLessonSlotResponse])
async def get_lessons_for_date(
    lesson_date: date = Query(..., description="Дата в формате YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Занятия тренера на указанную дату (по расписанию групп). Только для тренера."""
    weekday = lesson_date.weekday()  # 0=Monday, 6=Sunday
    if current_user.role == UserRole.TRAINER:
        groups = db.query(Group).options(selectinload(Group.trainer)).filter(
            Group.trainer_id == current_user.id,
            Group.status == GroupStatus.ACTIVE,
        ).all()
        cancellation_group_ids: Optional[List[int]] = [g.id for g in groups]
    elif current_user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        # Для owner/admin/sales показываем занятия по активным группам,
        # но переносы/отмены хотим видеть и по архивным группам.
        groups = (
            db.query(Group)
            .options(selectinload(Group.trainer))
            .filter(Group.status == GroupStatus.ACTIVE)
            .all()
        )
        cancellation_group_ids = None  # не ограничиваемся только активными группами
    else:
        raise HTTPException(status_code=403, detail="Только для тренера или администратора/владельца/менеджера")
    # Не показывать слоты раньше начала группы
    groups_for_day = [
        g for g in groups
        if getattr(g, "start_date", None) is None or lesson_date >= g.start_date
    ]
    group_ids = [g.id for g in groups_for_day]
    individual_group_ids = {
        g.id for g in groups_for_day
        if (getattr(g, "lesson_format", None) or "group").strip().lower() == "individual"
    }
    def _time_eq(a: Optional[time], b: Optional[time]) -> bool:
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return a == b

    # Отмены/переносы на эту дату.
    # Для тренеров ограничиваемся их группами; для owner/admin/sales — берём все группы (включая архивные).
    if cancellation_group_ids:
        cancellations_for_day = db.query(LessonCancellation).filter(
            LessonCancellation.group_id.in_(cancellation_group_ids),
            LessonCancellation.lesson_date == lesson_date,
        ).all()
    else:
        cancellations_for_day = db.query(LessonCancellation).filter(
            LessonCancellation.lesson_date == lesson_date,
        ).all()
    cancelled_set = {(c.group_id, c.lesson_date, c.start_time, c.end_time) for c in cancellations_for_day}

    year, month = lesson_date.year, lesson_date.month
    month_start = date(year, month, 1)
    month_end = month_start.replace(day=28) + timedelta(days=4)
    month_end = month_end.replace(day=1) - timedelta(days=1)
    cancellations_month = db.query(LessonCancellation).filter(
        LessonCancellation.group_id.in_(group_ids),
        LessonCancellation.lesson_date >= month_start,
        LessonCancellation.lesson_date <= month_end,
    ).all()
    first_8_allowed, lesson_index_in_month_map = _first_n_slots_per_group_in_month(
        db, group_ids, year, month, cancellations_month, individual_group_ids=individual_group_ids
    )

    overrides = db.query(LessonTrainerOverride).filter(
        LessonTrainerOverride.group_id.in_(group_ids),
        LessonTrainerOverride.lesson_date == lesson_date,
    ).all()
    override_map = {(o.group_id, o.start_time, o.end_time): o for o in overrides}
    override_trainer_ids = [o.trainer_id for o in overrides]
    override_trainers = {u.id: u for u in db.query(User).filter(User.id.in_(override_trainer_ids)).all()} if override_trainer_ids else {}
    # Кэш тренеров, взятых из LessonAttendance.trainer_id, чтобы не делать лишние запросы.
    attendance_trainers: dict[int, User] = {}

    result: List[TrainerLessonSlotResponse] = []
    group_by_id = {g.id: g for g in groups_for_day}
    for group in groups_for_day:
        schedules = db.query(GroupSchedule).filter(
            GroupSchedule.group_id == group.id,
            GroupSchedule.day_of_week == weekday,
        ).order_by(GroupSchedule.start_time).all()
        sched_times = {(s.start_time, s.end_time) for s in schedules}
        attendances = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id,
            LessonAttendance.lesson_date == lesson_date,
        ).all()
        students_in_group = db.query(GroupStudent).filter(GroupStudent.group_id == group.id).all()
        group_student_ids = {gs.student_id for gs in students_in_group if gs.student_id}
        attendance_student_ids = {att.student_id for att in attendances}
        all_student_ids = list(group_student_ids | attendance_student_ids)
        display_names = get_students_display_names(db, all_student_ids)
        freezes = db.query(StudentFreeze).filter(
            StudentFreeze.student_id.in_(all_student_ids),
            StudentFreeze.freeze_start <= lesson_date,
            StudentFreeze.freeze_end >= lesson_date,
        ).all()
        freeze_badges = {f.student_id: f"Заморожен с {f.freeze_start.strftime('%d.%m')} по {f.freeze_end.strftime('%d.%m')}" for f in freezes}
        program_name = group.programs[0].name if group.programs else None

        def build_slot(slot_start: time, slot_end: time, atts: list) -> None:
            if (group.id, lesson_date, slot_start, slot_end) not in first_8_allowed:
                return
            # 1) Если в LessonAttendance уже зафиксирован тренер — используем его (исторические данные).
            att_trainer_ids = {
                getattr(att, "trainer_id", None)
                for att in atts
                if getattr(att, "trainer_id", None)
            }
            slot_trainer_id: Optional[int]
            slot_trainer_name: str
            trainer_user: Optional[User] = None
            if att_trainer_ids:
                # На случай, если вдруг разные тренеры — берём детерминированно минимальный id.
                tid = sorted(att_trainer_ids)[0]
                slot_trainer_id = tid
                trainer_user = attendance_trainers.get(tid)
                if not trainer_user:
                    trainer_user = db.query(User).filter(User.id == tid).first()
                    if trainer_user:
                        attendance_trainers[tid] = trainer_user
                slot_trainer_name = (trainer_user.full_name if trainer_user and trainer_user.full_name else "") or ""
            else:
                # 2) Иначе смотрим подмену тренера на слот (LessonTrainerOverride).
                override = override_map.get((group.id, slot_start, slot_end))
                if override and override.trainer_id in override_trainers:
                    trainer_user = override_trainers[override.trainer_id]
                    slot_trainer_id = trainer_user.id
                    slot_trainer_name = trainer_user.full_name or ""
                else:
                    # 3) Фолбэк — текущий тренер группы (для будущих уроков без посещаемости).
                    slot_trainer_id = group.trainer_id
                    slot_trainer_name = (group.trainer.full_name if group.trainer else "") or ""
            lesson_index = lesson_index_in_month_map.get((group.id, lesson_date, slot_start, slot_end))

            attendance_map = {
                att.student_id: {
                    "attended": att.attended,
                    "late": getattr(att, "late", False),
                    "absence_reason": getattr(att, "absence_reason", None),
                    "absence_comment": getattr(att, "absence_comment", None),
                }
                for att in atts
            }
            slot_student_ids = {att.student_id for att in atts}
            students_data = []
            # Если по слоту уже есть записи посещаемости — показываем только этих учеников
            # (удалённые через «Удалить из урока» не отображаются). Если записей ещё нет — показываем всех по группе.
            only_with_attendance = len(slot_student_ids) > 0
            for gs in students_in_group:
                student = gs.student
                if not student:
                    continue
                if only_with_attendance and student.id not in slot_student_ids:
                    continue
                training_start = getattr(student, "training_start_date", None)
                if training_start is not None and lesson_date < training_start:
                    continue
                info = attendance_map.get(student.id)
                attended = info["attended"] if isinstance(info, dict) else info
                late = info.get("late", False) if isinstance(info, dict) else False
                students_data.append({
                    "id": student.id,
                    "full_name": display_names.get(student.id, student.full_name),
                    "attended": attended,
                    "late": late,
                    "absence_reason": info.get("absence_reason") if isinstance(info, dict) else None,
                    "absence_comment": info.get("absence_comment") if isinstance(info, dict) else None,
                    "freeze_badge": freeze_badges.get(student.id),
                })
            extra_ids = slot_student_ids - group_student_ids
            if extra_ids:
                extra_students = db.query(Student).filter(Student.id.in_(extra_ids)).all()
                for student in extra_students:
                    training_start = getattr(student, "training_start_date", None)
                    if training_start is not None and lesson_date < training_start:
                        continue
                    info = attendance_map.get(student.id)
                    attended = info["attended"] if isinstance(info, dict) else info
                    late = info.get("late", False) if isinstance(info, dict) else False
                    students_data.append({
                        "id": student.id,
                        "full_name": display_names.get(student.id, student.full_name),
                        "attended": attended,
                        "late": late,
                        "absence_reason": info.get("absence_reason") if isinstance(info, dict) else None,
                        "absence_comment": info.get("absence_comment") if isinstance(info, dict) else None,
                        "freeze_badge": freeze_badges.get(student.id),
                    })
            result.append(TrainerLessonSlotResponse(
                group_id=group.id,
                group_name=group.name,
                program_name=program_name,
                day_of_week=weekday,
                start_time=slot_start,
                end_time=slot_end,
                lesson_date=lesson_date,
                students=students_data,
                trainer_id=slot_trainer_id,
                trainer_name=slot_trainer_name or None,
                lesson_index_in_month=lesson_index,
            ))

        for sched in schedules:
            if (group.id, lesson_date, sched.start_time, sched.end_time) in cancelled_set:
                continue
            matching = [
                att for att in attendances
                if (getattr(att, "lesson_start_time", None) is None and getattr(att, "lesson_end_time", None) is None)
                or (_time_eq(getattr(att, "lesson_start_time", None), sched.start_time) and _time_eq(getattr(att, "lesson_end_time", None), sched.end_time))
            ]
            build_slot(sched.start_time, sched.end_time, matching)

        custom_times = set()
        for att in attendances:
            st, et = getattr(att, "lesson_start_time", None), getattr(att, "lesson_end_time", None)
            if st is not None and et is not None and (st, et) not in sched_times:
                custom_times.add((st, et))
        for (st, et) in sorted(custom_times):
            if (group.id, lesson_date, st, et) in cancelled_set:
                continue
            matching = [att for att in attendances if getattr(att, "lesson_start_time", None) == st and getattr(att, "lesson_end_time", None) == et]
            build_slot(st, et, matching)

    # Добавляем stub-слоты для отменённых/перенесённых занятий (LessonCancellation),
    # чтобы в истории было видно, что занятие на эту дату отменено/перенесено.
    existing_keys = {
        (slot.group_id, slot.lesson_date, slot.start_time, slot.end_time)
        for slot in result
    }
    for c in cancellations_for_day:
        key = (c.group_id, c.lesson_date, c.start_time, c.end_time)
        if key in existing_keys:
            continue
        # Для активных групп возьмём уже загруженный объект, для остальных (архивные) — дотянем из БД.
        group = group_by_id.get(c.group_id)
        if not group:
            group = db.query(Group).filter(Group.id == c.group_id).first()
            if not group:
                continue
        program_name = group.programs[0].name if group.programs else None
        trainer_user = group.trainer
        trainer_id = getattr(trainer_user, "id", None) or group.trainer_id
        trainer_name = getattr(trainer_user, "full_name", None) if trainer_user else None
        lesson_index = lesson_index_in_month_map.get(key)
        result.append(
            TrainerLessonSlotResponse(
                group_id=c.group_id,
                group_name=group.name,
                program_name=program_name,
                day_of_week=weekday,
                start_time=c.start_time,
                end_time=c.end_time,
                lesson_date=c.lesson_date,
                students=[],
                trainer_id=trainer_id,
                trainer_name=trainer_name or None,
                lesson_index_in_month=lesson_index,
                is_cancelled=True,
                moved_to_date=getattr(c, "moved_to_date", None),
                moved_to_start_time=getattr(c, "moved_to_start_time", None),
                moved_to_end_time=getattr(c, "moved_to_end_time", None),
            )
        )

    result.sort(key=lambda x: (x.start_time, x.group_name))
    return result


def _close_absence_for_custom_lesson(
    db: Session,
    *,
    lesson: CustomLesson,
    lesson_student: CustomLessonStudent,
) -> None:
    """Закрыть один пропуск для ученика по ручному уроку (FIFO или заданный явно)."""
    # Если у урока тип не "отработка" — пропуски не трогаем.
    if getattr(lesson, "lesson_type", None) and str(lesson.lesson_type) not in ("makeup", "CustomLessonType.MAKEUP"):
        return

    student_id = lesson_student.student_id

    # Сначала пробуем явно привязанный пропуск
    absence = None
    if lesson_student.planned_absence_id:
        absence = (
            db.query(AbsenceFollowUp)
            .filter(
                AbsenceFollowUp.id == lesson_student.planned_absence_id,
                AbsenceFollowUp.student_id == student_id,
                AbsenceFollowUp.stage.in_(("missed", "assigned")),
            )
            .first()
        )

    # Если не нашли или не задан — берём самый ранний открытый пропуск (FIFO)
    if not absence:
        absence = (
            db.query(AbsenceFollowUp)
            .filter(
                AbsenceFollowUp.student_id == student_id,
                AbsenceFollowUp.stage.in_(("missed", "assigned")),
            )
            .order_by(AbsenceFollowUp.lesson_date.asc(), AbsenceFollowUp.id.asc())
            .first()
        )

    if not absence:
        return

    absence.stage = "made_up"
    absence.makeup_custom_lesson_id = lesson.id


@router.post("/attendance")
async def save_attendance(
    payload: LessonAttendanceSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Сохранить посещаемость по занятию. Тренер — только своей группы; admin/owner/sales — любой группы."""
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.role == UserRole.TRAINER:
        if group.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only trainer (own group) or admin/owner/sales")

    if getattr(group, "start_date", None) and payload.lesson_date < group.start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата урока не может быть раньше начала группы",
        )

    start_t: Optional[time] = None
    end_t: Optional[time] = None
    if getattr(payload, "start_time", None) and str(payload.start_time).strip():
        try:
            start_t = datetime.strptime(str(payload.start_time).strip(), "%H:%M").time()
        except ValueError:
            pass
    if getattr(payload, "end_time", None) and str(payload.end_time).strip():
        try:
            end_t = datetime.strptime(str(payload.end_time).strip(), "%H:%M").time()
        except ValueError:
            pass
    if start_t is None or end_t is None:
        weekday = payload.lesson_date.weekday()
        sched = (
            db.query(GroupSchedule)
            .filter(
                GroupSchedule.group_id == payload.group_id,
                GroupSchedule.day_of_week == weekday,
            )
            .order_by(GroupSchedule.start_time)
            .first()
        )
        if sched:
            start_t = start_t or sched.start_time
            end_t = end_t or sched.end_time
    if start_t is None:
        start_t = time(0, 0)
    if end_t is None:
        end_t = time(0, 0)

    # Фактический тренер для этого слота на момент сохранения посещаемости.
    slot_trainer_override = (
        db.query(LessonTrainerOverride)
        .filter(
            LessonTrainerOverride.group_id == payload.group_id,
            LessonTrainerOverride.lesson_date == payload.lesson_date,
            LessonTrainerOverride.start_time == start_t,
            LessonTrainerOverride.end_time == end_t,
        )
        .first()
    )
    effective_trainer_id = slot_trainer_override.trainer_id if slot_trainer_override else group.trainer_id

    for item in payload.attendances:
        att = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == payload.group_id,
            LessonAttendance.lesson_date == payload.lesson_date,
            LessonAttendance.student_id == item.student_id,
        ).first()
        late = getattr(item, "late", False) or False
        reason = getattr(item, "absence_reason", None) or None
        comment = getattr(item, "absence_comment", None) or None
        if att:
            att.attended = item.attended
            att.late = late
            att.absence_reason = reason
            att.absence_comment = comment
            att.lesson_start_time = start_t
            att.lesson_end_time = end_t
            # Не переписываем тренера, если он уже зафиксирован (история),
            # но заполняем, если поле ещё пустое.
            if getattr(att, "trainer_id", None) is None:
                att.trainer_id = effective_trainer_id
        else:
            att = LessonAttendance(
                group_id=payload.group_id,
                lesson_date=payload.lesson_date,
                student_id=item.student_id,
                attended=item.attended,
                late=late,
                absence_reason=reason,
                absence_comment=comment,
                lesson_start_time=start_t,
                lesson_end_time=end_t,
                trainer_id=effective_trainer_id,
            )
            db.add(att)
    db.commit()

    attendances_saved = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
    ).all()
    is_individual = (getattr(group, "lesson_format", None) or "group").strip().lower() == "individual"
    BASE_UNITS = 8
    U = max(1, getattr(group, "units_per_session", None) or 1)
    window_start, window_end = get_academic_window(payload.lesson_date)

    for att in attendances_saved:
        is_present = att.attended and (not att.absence_reason or att.absence_reason == "was")
        is_absence = not att.attended or (att.absence_reason and att.absence_reason != "was")

        existing_txs = list(
            db.query(StudentAccountTransaction).filter(
                StudentAccountTransaction.lesson_attendance_id == att.id,
            )
        )
        if existing_txs:
            if is_absence:
                in_freeze = db.query(StudentFreeze).filter(
                    StudentFreeze.student_id == att.student_id,
                    StudentFreeze.freeze_start <= att.lesson_date,
                    StudentFreeze.freeze_end >= att.lesson_date,
                ).first()
                if not in_freeze:
                    absence = db.query(AbsenceFollowUp).filter(
                        AbsenceFollowUp.lesson_attendance_id == att.id,
                    ).first()
                    if not absence:
                        db.add(AbsenceFollowUp(
                            lesson_attendance_id=att.id,
                            student_id=att.student_id,
                            group_id=att.group_id,
                            lesson_date=att.lesson_date,
                            stage="missed",
                            absence_reason=att.absence_reason,
                            absence_comment=att.absence_comment,
                        ))
            continue

        student = db.query(Student).filter(Student.id == att.student_id).first()
        if not student:
            continue
        if is_present and not is_individual:
            all_in_window = (
                db.query(LessonAttendance)
                .filter(
                    LessonAttendance.group_id == att.group_id,
                    LessonAttendance.student_id == att.student_id,
                    LessonAttendance.lesson_date >= window_start,
                    LessonAttendance.lesson_date <= window_end,
                )
                .all()
            )
            current_key = _slot_key(att)
            base_used = sum(
                (att2.base_units_applied or 0)
                for att2 in all_in_window
                if _slot_key(att2) < current_key
            )
            base_left = max(0, BASE_UNITS - base_used)
            base_units_to_apply = min(base_left, U)
            extra_units_to_apply = U - base_units_to_apply
            att.base_units_applied = base_units_to_apply
            att.extra_units_applied = extra_units_to_apply

            abonement = getattr(student, "abonement", None)
            if not abonement:
                abonement = db.query(Abonement).filter(Abonement.id == student.abonement_id).first()
            price_per_unit = 0.0
            if abonement and abonement.price is not None and BASE_UNITS > 0:
                price_per_unit = float(abonement.price) / BASE_UNITS

            account = None
            accounts = db.query(StudentAccount).filter(
                StudentAccount.student_id == att.student_id
            ).order_by(StudentAccount.id).all()
            if accounts:
                direction_hint = None
                gr = att.group
                if gr:
                    try:
                        programs = list(getattr(gr, "programs", []) or [])
                    except Exception:
                        programs = []
                    if programs:
                        prog_name = (programs[0].name or "").strip()
                        if prog_name:
                            direction_hint = prog_name.lower()
                    if not direction_hint and getattr(gr, "direction", None):
                        direction_hint = str(gr.direction).strip().lower()
                for acc in accounts:
                    acc_name = (acc.name or "").strip().lower()
                    if acc_name and direction_hint and direction_hint in acc_name:
                        account = acc
                        break
                if account is None:
                    account = accounts[0]

            if account:
                if base_units_to_apply > 0 and price_per_unit > 0:
                    deduct_base = price_per_unit * base_units_to_apply
                    account.balance -= deduct_base
                    db.add(
                        StudentAccountTransaction(
                            account_id=account.id,
                            amount=-deduct_base,
                            kind=StudentAccountTransactionKind.LESSON_DEDUCTION,
                            note=f"Занятие {att.lesson_date} (база)",
                            lesson_attendance_id=att.id,
                        )
                    )
                if extra_units_to_apply > 0:
                    try:
                        policy = (
                            db.query(LessonSlotExtraPolicy)
                            .filter(
                                LessonSlotExtraPolicy.group_id == att.group_id,
                                LessonSlotExtraPolicy.lesson_date == att.lesson_date,
                                LessonSlotExtraPolicy.start_time == start_t,
                                LessonSlotExtraPolicy.end_time == end_t,
                            )
                            .first()
                        )
                    except Exception:
                        policy = None
                    extra_policy = (policy.extra_policy if policy else None) or "free"
                    if extra_policy == "paid":
                        extra_rate = None
                        if policy and getattr(policy, "extra_rate_per_unit", None) is not None:
                            extra_rate = float(policy.extra_rate_per_unit)
                        if extra_rate is None and getattr(group, "extra_rate_per_unit", None) is not None:
                            extra_rate = float(group.extra_rate_per_unit)
                        if extra_rate is None:
                            extra_rate = price_per_unit
                        deduct_extra = extra_rate * extra_units_to_apply
                        if deduct_extra > 0:
                            account.balance -= deduct_extra
                            db.add(
                                StudentAccountTransaction(
                                    account_id=account.id,
                                    amount=-deduct_extra,
                                    kind=StudentAccountTransactionKind.EXTRA_LESSON_DEDUCTION,
                                    note=f"Доп. занятие (сверх 8) {att.lesson_date}",
                                    lesson_attendance_id=att.id,
                                )
                            )
        if is_absence:
            in_freeze = db.query(StudentFreeze).filter(
                StudentFreeze.student_id == att.student_id,
                StudentFreeze.freeze_start <= att.lesson_date,
                StudentFreeze.freeze_end >= att.lesson_date,
            ).first()
            if not in_freeze:
                absence = db.query(AbsenceFollowUp).filter(
                    AbsenceFollowUp.lesson_attendance_id == att.id,
                ).first()
                if not absence:
                    db.add(AbsenceFollowUp(
                        lesson_attendance_id=att.id,
                        student_id=att.student_id,
                        group_id=att.group_id,
                        lesson_date=att.lesson_date,
                        stage="missed",
                        absence_reason=att.absence_reason,
                        absence_comment=att.absence_comment,
                    ))
    db.commit()
    return {"ok": True}


def _custom_lesson_to_response(db: Session, lesson: CustomLesson) -> CustomLessonResponse:
    trainer = db.query(User).filter(User.id == lesson.trainer_id).first()
    students_rows = (
        db.query(CustomLessonStudent, Student)
        .join(Student, Student.id == CustomLessonStudent.student_id)
        .filter(CustomLessonStudent.lesson_id == lesson.id)
        .all()
    )
    students = [
        {
            "id": cls.id,
            "student_id": cls.student_id,
            "student_name": get_student_display_name(db, s) if s else None,
            "planned_absence_id": cls.planned_absence_id,
            "attended": bool(getattr(cls, "attended", False)),
            "absence_reason": getattr(cls, "absence_reason", None),
            "absence_comment": getattr(cls, "absence_comment", None),
        }
        for cls, s in students_rows
    ]
    start_str = lesson.start_time.strftime("%H:%M") if lesson.start_time else ""
    end_str = lesson.end_time.strftime("%H:%M") if lesson.end_time else None
    return CustomLessonResponse(
        id=lesson.id,
        title=lesson.title,
        lesson_date=lesson.lesson_date,
        start_time=start_str,
        end_time=end_str,
        trainer_id=lesson.trainer_id,
        trainer_name=trainer.full_name if trainer else None,
        lesson_type=lesson.lesson_type.value if hasattr(lesson.lesson_type, "value") else str(lesson.lesson_type),
        comment=lesson.comment,
        students=students,
    )


@router.get("/custom-lessons", response_model=List[CustomLessonResponse])
async def list_trainer_custom_lessons(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список ручных уроков, где текущий пользователь — ведущий тренер. Только для тренера."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Только для тренеров")
    query = db.query(CustomLesson).filter(CustomLesson.trainer_id == current_user.id)
    if date_from:
        query = query.filter(CustomLesson.lesson_date >= date_from)
    if date_to:
        query = query.filter(CustomLesson.lesson_date <= date_to)
    lessons = query.order_by(CustomLesson.lesson_date.desc(), CustomLesson.start_time.asc()).all()
    return [_custom_lesson_to_response(db, l) for l in lessons]


@router.post("/custom-lessons/attendance")
async def save_custom_lesson_attendance(
    payload: CustomLessonAttendancePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Посещаемость по ручному уроку (без группы). Только для тренера этого урока."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Только для тренеров")

    lesson = db.query(CustomLesson).filter(CustomLesson.id == payload.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if lesson.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Не ваш урок")

    # Обновляем посещаемость по ученикам
    for item in payload.items:
        row = db.query(CustomLessonStudent).filter(
            CustomLessonStudent.id == item.lesson_student_id,
            CustomLessonStudent.lesson_id == payload.lesson_id,
        ).first()
        if not row:
            continue
        row.attended = item.attended
        row.absence_reason = (item.absence_reason or "").strip() or None
        row.absence_comment = (item.absence_comment or "").strip() or None

    # После обновления — закрываем пропуски для тех, кто был
    db.flush()
    rows = db.query(CustomLessonStudent).filter(
        CustomLessonStudent.lesson_id == payload.lesson_id,
        CustomLessonStudent.attended.is_(True),
    ).all()
    for row in rows:
        _close_absence_for_custom_lesson(db, lesson=lesson, lesson_student=row)

    db.commit()
    return {"ok": True}


@router.post("/add-student-to-lesson")
async def add_student_to_lesson(
    payload: AddStudentToLessonPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Добавить ученика на урок вручную (создать запись посещаемости). Тренер — своя группа; admin/owner/sales — любая."""
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.role == UserRole.TRAINER:
        if group.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only trainer (own group) or admin/owner/sales")

    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    existing = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
        LessonAttendance.student_id == payload.student_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student already on this lesson")

    lesson_start_time = None
    lesson_end_time = None
    if payload.start_time or payload.end_time:
        try:
            if payload.start_time:
                lesson_start_time = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
            if payload.end_time:
                lesson_end_time = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")

    # Фактический тренер для этого слота (учитываем подмены).
    slot_trainer_override = None
    if lesson_start_time is not None and lesson_end_time is not None:
        slot_trainer_override = (
            db.query(LessonTrainerOverride)
            .filter(
                LessonTrainerOverride.group_id == payload.group_id,
                LessonTrainerOverride.lesson_date == payload.lesson_date,
                LessonTrainerOverride.start_time == lesson_start_time,
                LessonTrainerOverride.end_time == lesson_end_time,
            )
            .first()
        )
    effective_trainer_id = slot_trainer_override.trainer_id if slot_trainer_override else group.trainer_id

    db.add(LessonAttendance(
        group_id=payload.group_id,
        lesson_date=payload.lesson_date,
        student_id=payload.student_id,
        attended=True,
        late=False,
        lesson_start_time=lesson_start_time,
        lesson_end_time=lesson_end_time,
        trainer_id=effective_trainer_id,
    ))
    db.commit()
    return {"ok": True}


@router.post("/remove-student-from-lesson")
async def remove_student_from_lesson(
    payload: RemoveStudentFromLessonPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Удалить ученика из урока. Только owner и admin."""
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owner or admin can remove a student from a lesson")
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    q = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
        LessonAttendance.student_id == payload.student_id,
    )
    if payload.start_time and payload.end_time:
        try:
            start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
            end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
            q = q.filter(
                LessonAttendance.lesson_start_time == start_t,
                LessonAttendance.lesson_end_time == end_t,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")
    attendances = q.all()
    if not attendances:
        raise HTTPException(status_code=404, detail="Student not found on this lesson")
    for att in attendances:
        db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.lesson_attendance_id == att.id,
        ).update({StudentAccountTransaction.lesson_attendance_id: None}, synchronize_session=False)
        db.query(AbsenceFollowUp).filter(AbsenceFollowUp.lesson_attendance_id == att.id).delete(
            synchronize_session=False
        )
        db.delete(att)
    db.commit()
    return {"ok": True}


@router.post("/create-slot")
async def create_lesson_slot(
    payload: CreateLessonSlotPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Создать дополнительный слот урока для группы на указанную дату и время.

    Для тренера — только свои группы; для admin/owner/sales — любая активная группа.
    """
    group = db.query(Group).filter(Group.id == payload.group_id, Group.status == GroupStatus.ACTIVE).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if getattr(group, "start_date", None) and payload.lesson_date < group.start_date:
        raise HTTPException(
            status_code=400,
            detail="Дата урока не может быть раньше начала группы",
        )
    if current_user.role == UserRole.TRAINER:
        if group.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only trainer (own group) or admin/owner/sales")

    try:
        start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")

    if start_t >= end_t:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    existing_slot = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
        LessonAttendance.lesson_start_time == start_t,
        LessonAttendance.lesson_end_time == end_t,
    ).first()
    if existing_slot:
        return {"ok": True}

    # Ограничение в БД: для пары (group_id, lesson_date, student_id) может быть только одна запись.
    # Поэтому сейчас нельзя создать второй слот на ту же дату для той же группы через LessonAttendance.
    # Если по этой дате уже есть урок, возвращаем понятную ошибку вместо IntegrityError.
    existing_for_day = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
    ).first()
    if existing_for_day:
        raise HTTPException(
            status_code=400,
            detail="На эту дату у группы уже есть урок; второй слот в тот же день сейчас не поддерживается",
        )

    first_student = db.query(GroupStudent).filter(GroupStudent.group_id == payload.group_id).first()
    if not first_student or not first_student.student_id:
        raise HTTPException(status_code=400, detail="Group has no students to attach lesson to")

    # Фактический тренер для создаваемого слота (учитываем возможные подмены, если они будут заданы позже).
    slot_trainer_override = (
        db.query(LessonTrainerOverride)
        .filter(
            LessonTrainerOverride.group_id == payload.group_id,
            LessonTrainerOverride.lesson_date == payload.lesson_date,
            LessonTrainerOverride.start_time == start_t,
            LessonTrainerOverride.end_time == end_t,
        )
        .first()
    )
    effective_trainer_id = slot_trainer_override.trainer_id if slot_trainer_override else group.trainer_id

    db.add(
        LessonAttendance(
            group_id=payload.group_id,
            lesson_date=payload.lesson_date,
            student_id=first_student.student_id,
            attended=True,
            late=False,
            lesson_start_time=start_t,
            lesson_end_time=end_t,
            trainer_id=effective_trainer_id,
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/move")
async def move_lesson(
    payload: MoveLessonPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Перенос занятия группы с from_date на to_date. Только admin/owner/sales."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only admin, owner or sales can move lessons")
    if payload.from_date == payload.to_date:
        raise HTTPException(status_code=400, detail="from_date and to_date must differ")
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    attendances = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.from_date,
    ).all()
    existing = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.to_date,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Group already has a lesson on to_date; cannot move",
        )
    to_start: Optional[time] = None
    to_end: Optional[time] = None
    if payload.to_start_time or payload.to_end_time:
        try:
            if payload.to_start_time:
                to_start = datetime.strptime(payload.to_start_time.strip(), "%H:%M").time()
            if payload.to_end_time:
                to_end = datetime.strptime(payload.to_end_time.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")

    from_weekday = payload.from_date.weekday()
    from_scheds = db.query(GroupSchedule).filter(
        GroupSchedule.group_id == payload.group_id,
        GroupSchedule.day_of_week == from_weekday,
    ).order_by(GroupSchedule.start_time).all()
    if payload.from_start_time and payload.from_end_time:
        try:
            from_start = datetime.strptime(payload.from_start_time.strip(), "%H:%M").time()
            from_end = datetime.strptime(payload.from_end_time.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_start_time/from_end_time; use HH:MM")
    elif attendances:
        att0 = attendances[0]
        ast, aet = getattr(att0, "lesson_start_time", None), getattr(att0, "lesson_end_time", None)
        if ast is not None and aet is not None:
            from_start, from_end = ast, aet
        elif from_scheds:
            from_start, from_end = from_scheds[0].start_time, from_scheds[0].end_time
        else:
            raise HTTPException(status_code=400, detail="Provide from_start_time and from_end_time")
    elif from_scheds:
        from_start, from_end = from_scheds[0].start_time, from_scheds[0].end_time
    else:
        raise HTTPException(status_code=400, detail="Provide from_start_time and from_end_time")

    existing_cancel = db.query(LessonCancellation).filter(
        LessonCancellation.group_id == payload.group_id,
        LessonCancellation.lesson_date == payload.from_date,
        LessonCancellation.start_time == from_start,
        LessonCancellation.end_time == from_end,
    ).first()
    if not existing_cancel:
        existing_cancel = LessonCancellation(
            group_id=payload.group_id,
            lesson_date=payload.from_date,
            start_time=from_start,
            end_time=from_end,
        )
        db.add(existing_cancel)
    # Сохраняем целевую дату/время, чтобы на старой дате понимать, куда перенесли урок.
    existing_cancel.moved_to_date = payload.to_date
    existing_cancel.moved_to_start_time = to_start
    existing_cancel.moved_to_end_time = to_end

    if attendances:
        att_ids = [a.id for a in attendances]
        for att in attendances:
            att.lesson_date = payload.to_date
            if to_start is not None:
                att.lesson_start_time = to_start
            if to_end is not None:
                att.lesson_end_time = to_end
        for abs_follow in db.query(AbsenceFollowUp).filter(
            AbsenceFollowUp.lesson_attendance_id.in_(att_ids),
        ).all():
            abs_follow.lesson_date = payload.to_date
    else:
        students_in_group = db.query(GroupStudent).filter(
            GroupStudent.group_id == payload.group_id,
        ).all()
        created = 0
        # Фактический тренер для нового слота (учитываем подмены на дату переноса, если они уже заданы).
        slot_trainer_override = None
        if to_start is not None and to_end is not None:
            slot_trainer_override = (
                db.query(LessonTrainerOverride)
                .filter(
                    LessonTrainerOverride.group_id == payload.group_id,
                    LessonTrainerOverride.lesson_date == payload.to_date,
                    LessonTrainerOverride.start_time == to_start,
                    LessonTrainerOverride.end_time == to_end,
                )
                .first()
            )
        effective_trainer_id = slot_trainer_override.trainer_id if slot_trainer_override else group.trainer_id
        for gs in students_in_group:
            if not gs.student_id:
                continue
            db.add(LessonAttendance(
                group_id=payload.group_id,
                lesson_date=payload.to_date,
                student_id=gs.student_id,
                attended=True,
                late=False,
                lesson_start_time=to_start,
                lesson_end_time=to_end,
                trainer_id=effective_trainer_id,
            ))
            created += 1
        db.commit()
        return {"ok": True, "moved_count": created}
    db.commit()
    return {"ok": True, "moved_count": len(attendances)}


@router.post("/cancel")
async def cancel_lesson(
    payload: CancelLessonPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Отменить занятие: слот не показывается на странице Уроки. Только admin/owner/sales."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only admin, owner or sales can cancel lessons")
    try:
        start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    existing = db.query(LessonCancellation).filter(
        LessonCancellation.group_id == payload.group_id,
        LessonCancellation.lesson_date == payload.lesson_date,
        LessonCancellation.start_time == start_t,
        LessonCancellation.end_time == end_t,
    ).first()
    if not existing:
        db.add(LessonCancellation(
            group_id=payload.group_id,
            lesson_date=payload.lesson_date,
            start_time=start_t,
            end_time=end_t,
        ))
    attendances_to_delete = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
        LessonAttendance.lesson_start_time == start_t,
        LessonAttendance.lesson_end_time == end_t,
    ).all()
    att_ids = [a.id for a in attendances_to_delete]
    db.query(AbsenceFollowUp).filter(AbsenceFollowUp.lesson_attendance_id.in_(att_ids)).delete(synchronize_session=False)
    for a in attendances_to_delete:
        db.delete(a)
    db.commit()
    return {"ok": True}


@router.post("/set-trainer")
async def set_lesson_trainer(
    payload: SetLessonTrainerPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Подменить преподавателя на конкретный урок. Тренер — своя группа; admin/owner/sales — любая."""
    if current_user.role == UserRole.TRAINER:
        group = db.query(Group).filter(Group.id == payload.group_id).first()
        if not group or group.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Only trainer (own group) or admin/owner/sales")
    try:
        start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format; use HH:MM")
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    trainer = db.query(User).filter(User.id == payload.trainer_id, User.role == UserRole.TRAINER).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Trainer not found")
    existing = db.query(LessonTrainerOverride).filter(
        LessonTrainerOverride.group_id == payload.group_id,
        LessonTrainerOverride.lesson_date == payload.lesson_date,
        LessonTrainerOverride.start_time == start_t,
        LessonTrainerOverride.end_time == end_t,
    ).first()
    if existing:
        existing.trainer_id = payload.trainer_id
    else:
        db.add(LessonTrainerOverride(
            group_id=payload.group_id,
            lesson_date=payload.lesson_date,
            start_time=start_t,
            end_time=end_t,
            trainer_id=payload.trainer_id,
        ))
    # Обновляем trainer_id у уже созданных записей посещаемости для этого слота,
    # чтобы расчёты и история использовали нового тренера.
    db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
        LessonAttendance.lesson_start_time == start_t,
        LessonAttendance.lesson_end_time == end_t,
    ).update({LessonAttendance.trainer_id: payload.trainer_id}, synchronize_session=False)
    db.commit()
    return {"ok": True}
