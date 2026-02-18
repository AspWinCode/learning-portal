"""API ╨┤╨╗╤П ╤В╤А╨╡╨╜╨╡╤А╨░: ╨╖╨░╨╜╤П╤В╨╕╤П ╨┐╨╛ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤О ╨╕ ╨┐╨╛╤Б╨╡╤Й╨░╨╡╨╝╨╛╤Б╤В╤М."""
from datetime import date, time, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import auth
from app.models import User, Group, GroupSchedule, GroupStudent, LessonAttendance, UserRole
from app.schemas import TrainerLessonSlotResponse, LessonAttendanceSave

router = APIRouter()


def _serialize_time(t: time) -> str:
    return t.strftime("%H:%M") if t else ""


@router.get("/", response_model=List[TrainerLessonSlotResponse])
async def get_lessons_for_date(
    lesson_date: date = Query(..., description="╨Ф╨░╤В╨░ ╨▓ ╤Д╨╛╤А╨╝╨░╤В╨╡ YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """╨Ч╨░╨╜╤П╤В╨╕╤П ╤В╤А╨╡╨╜╨╡╤А╨░ ╨╜╨░ ╤Г╨║╨░╨╖╨░╨╜╨╜╤Г╤О ╨┤╨░╤В╤Г (╨┐╨╛ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤О ╨│╤А╤Г╨┐╨┐). ╨в╨╛╨╗╤М╨║╨╛ ╨┤╨╗╤П ╤В╤А╨╡╨╜╨╡╤А╨░."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only for trainers")
    weekday = lesson_date.weekday()  # 0=Monday, 6=Sunday
    groups = db.query(Group).filter(
        Group.trainer_id == current_user.id,
        Group.status == 'ACTIVE',
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
            students_data = []
            for gs in students_in_group:
                student = gs.student
                if not student:
                    continue
                attended = attendance_map.get(student.id)
                students_data.append({
                    "id": student.id,
                    "full_name": student.full_name,
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
    return {"ok": True}
