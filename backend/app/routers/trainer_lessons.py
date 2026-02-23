"""API для тренера: занятия по расписанию и посещаемость."""
from datetime import date, time, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import auth
from app.models import (
    User,
    Group,
    GroupStatus,
    GroupSchedule,
    GroupStudent,
    LessonAttendance,
    UserRole,
    Student,
    Abonement,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    AbsenceFollowUp,
    StudentFreeze,
)
from app.schemas import TrainerLessonSlotResponse, LessonAttendanceSave, MoveLessonPayload
from app.student_display import get_students_display_names

router = APIRouter()


def _serialize_time(t: time) -> str:
    return t.strftime("%H:%M") if t else ""


@router.get("/", response_model=List[TrainerLessonSlotResponse])
async def get_lessons_for_date(
    lesson_date: date = Query(..., description="Дата в формате YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """╨Ч╨░╨╜╤П╤В╨╕╤П ╤В╤А╨╡╨╜╨╡╤А╨░ ╨╜╨░ ╤Г╨║╨░╨╖╨░╨╜╨╜╤Г╤О ╨┤╨░╤В╤Г (╨┐╨╛ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤О ╨│╤А╤Г╨┐╨┐). ╨в╨╛╨╗╤М╨║╨╛ ╨┤╨╗╤П ╤В╤А╨╡╨╜╨╡╤А╨░."""
    weekday = lesson_date.weekday()  # 0=Monday, 6=Sunday
    if current_user.role == UserRole.TRAINER:
        groups = db.query(Group).filter(
            Group.trainer_id == current_user.id,
            Group.status == GroupStatus.ACTIVE,
        ).all()
    elif current_user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        groups = db.query(Group).filter(Group.status == GroupStatus.ACTIVE).all()
    else:
        raise HTTPException(status_code=403, detail="Only for trainers or admin/owner/sales")
    def _time_eq(a: Optional[time], b: Optional[time]) -> bool:
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return a == b

    result: List[TrainerLessonSlotResponse] = []
    for group in groups:
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
        student_ids = [gs.student_id for gs in students_in_group if gs.student_id]
        display_names = get_students_display_names(db, student_ids)
        freezes = db.query(StudentFreeze).filter(
            StudentFreeze.student_id.in_(student_ids),
            StudentFreeze.freeze_start <= lesson_date,
            StudentFreeze.freeze_end >= lesson_date,
        ).all()
        freeze_badges = {f.student_id: f"Заморожен с {f.freeze_start.strftime('%d.%m')} по {f.freeze_end.strftime('%d.%m')}" for f in freezes}
        program_name = group.programs[0].name if group.programs else None

        def build_slot(slot_start: time, slot_end: time, atts: list) -> None:
            attendance_map = {
                att.student_id: {
                    "attended": att.attended,
                    "late": getattr(att, "late", False),
                    "absence_reason": getattr(att, "absence_reason", None),
                    "absence_comment": getattr(att, "absence_comment", None),
                }
                for att in atts
            }
            students_data = []
            for gs in students_in_group:
                student = gs.student
                if not student:
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
            ))

        for sched in schedules:
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
            matching = [att for att in attendances if getattr(att, "lesson_start_time", None) == st and getattr(att, "lesson_end_time", None) == et]
            build_slot(st, et, matching)

    result.sort(key=lambda x: (x.start_time, x.group_name))
    return result


@router.post("/attendance")
async def save_attendance(
    payload: LessonAttendanceSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨┐╨╛╤Б╨╡╤Й╨░╨╡╨╝╨╛╤Б╤В╤М ╨┐╨╛ ╨╖╨░╨╜╤П╤В╨╕╤О. ╨в╨╛╨╗╤М╨║╨╛ ╤В╤А╨╡╨╜╨╡╤А ╤Б╨▓╨╛╨╡╨╣ ╨│╤А╤Г╨┐╨┐╤Л."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only for trainers")
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your group")
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
        else:
            att = LessonAttendance(
                group_id=payload.group_id,
                lesson_date=payload.lesson_date,
                student_id=item.student_id,
                attended=item.attended,
                late=late,
                absence_reason=reason,
                absence_comment=comment,
            )
            db.add(att)
    db.commit()

    # ТЗ п.3.2: списываем только если "Был" (attended + reason was); иначе — пропуск, не списываем
    attendances_saved = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
    ).all()
    default_lessons = 8
    for att in attendances_saved:
        is_present = att.attended and (not att.absence_reason or att.absence_reason == "was")
        is_absence = not att.attended or (att.absence_reason and att.absence_reason != "was")

        existing_tx = db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.lesson_attendance_id == att.id,
        ).first()
        if existing_tx:
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
        if is_present:
            abonement = student.abonement
            if not abonement:
                abonement = db.query(Abonement).filter(Abonement.id == student.abonement_id).first()
            amount_per_lesson = 0.0
            if abonement and abonement.price is not None and (abonement.lessons_count or default_lessons) > 0:
                amount_per_lesson = float(abonement.price) / (abonement.lessons_count or default_lessons)
            account = db.query(StudentAccount).filter(StudentAccount.student_id == att.student_id).order_by(StudentAccount.id).first()
            if account and amount_per_lesson > 0 and account.balance >= amount_per_lesson:
                account.balance -= amount_per_lesson
                db.add(StudentAccountTransaction(
                    account_id=account.id,
                    amount=-amount_per_lesson,
                    kind=StudentAccountTransactionKind.LESSON_DEDUCTION,
                    note=f"Занятие {att.lesson_date}",
                    lesson_attendance_id=att.id,
                ))
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
    if not attendances:
        raise HTTPException(status_code=404, detail="No lesson on from_date for this group")
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
    db.commit()
    return {"ok": True, "moved_count": len(attendances)}
