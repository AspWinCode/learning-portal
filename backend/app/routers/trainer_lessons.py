"""API для тренера: занятия по расписанию и посещаемость."""
from datetime import date, time, datetime
from typing import List

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
)
from app.schemas import TrainerLessonSlotResponse, LessonAttendanceSave
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
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only for trainers")
    weekday = lesson_date.weekday()  # 0=Monday, 6=Sunday
    groups = db.query(Group).filter(
        Group.trainer_id == current_user.id,
        Group.status == GroupStatus.ACTIVE,
    ).all()
    result: List[TrainerLessonSlotResponse] = []
    for group in groups:
        schedules = db.query(GroupSchedule).filter(
            GroupSchedule.group_id == group.id,
            GroupSchedule.day_of_week == weekday,
        ).order_by(GroupSchedule.start_time).all()
        for sched in schedules:
            students_in_group = db.query(GroupStudent).filter(GroupStudent.group_id == group.id).all()
            attendance_map = {}
            for att in db.query(LessonAttendance).filter(
                LessonAttendance.group_id == group.id,
                LessonAttendance.lesson_date == lesson_date,
            ).all():
                attendance_map[att.student_id] = att.attended
            program_name = None
            if group.programs:
                program_name = group.programs[0].name if group.programs else None
            student_ids = [gs.student_id for gs in students_in_group if gs.student_id]
            display_names = get_students_display_names(db, student_ids)
            students_data = []
            for gs in students_in_group:
                student = gs.student
                if not student:
                    continue
                attended = attendance_map.get(student.id)
                students_data.append({
                    "id": student.id,
                    "full_name": display_names.get(student.id, student.full_name),
                    "attended": attended,
                })
            result.append(TrainerLessonSlotResponse(
                group_id=group.id,
                group_name=group.name,
                program_name=program_name,
                day_of_week=weekday,
                start_time=sched.start_time,
                end_time=sched.end_time,
                lesson_date=lesson_date,
                students=students_data,
            ))
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
        if att:
            att.attended = item.attended
        else:
            att = LessonAttendance(
                group_id=payload.group_id,
                lesson_date=payload.lesson_date,
                student_id=item.student_id,
                attended=item.attended,
            )
            db.add(att)
    db.commit()

    # Списание за занятие с счёта ученика (пропорционально абонементу) и создание записи пропуска при отсутствии
    attendances_saved = db.query(LessonAttendance).filter(
        LessonAttendance.group_id == payload.group_id,
        LessonAttendance.lesson_date == payload.lesson_date,
    ).all()
    default_lessons = 8
    for att in attendances_saved:
        # Уже списывали за это занятие?
        existing_tx = db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.lesson_attendance_id == att.id,
        ).first()
        if existing_tx:
            if not att.attended:
                # Обеспечиваем запись в воронку пропусков
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
                    ))
            continue

        student = db.query(Student).filter(Student.id == att.student_id).first()
        if not student:
            continue
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

        if not att.attended:
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
                ))
    db.commit()
    return {"ok": True}
