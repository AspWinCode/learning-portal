from datetime import date, datetime, time as dt_time, timedelta
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    Group,
    GroupSchedule,
    LessonAttendance,
    SalesInstruction,
    SalesInstructionImage,
    Student,
    StudentCard,
    User,
)
from app.routers.action_log import log_action
from app.schemas import (
    LessonCallResultUpdate,
    SalesInstructionCreate,
    SalesInstructionResponse,
    SalesInstructionUpdate,
)
from app.student_display import get_students_display_names

router = APIRouter()


def _lesson_task_status(
    lesson_start: datetime,
    lesson_end: datetime,
    now: datetime,
    call_window_min: int = 25,
) -> str:
    if now < lesson_start - timedelta(minutes=15):
        return "waiting"
    if now < lesson_start:
        return "soon"
    if now < lesson_start + timedelta(minutes=10):
        return "in_progress"
    call_end = min(lesson_start + timedelta(minutes=call_window_min), lesson_end)
    if now < call_end:
        return "call_round"
    return "completed"


def _lesson_tasks_for_date(
    db: Session,
    target_date: date,
    now: Optional[datetime] = None,
) -> List[dict]:
    if now is None:
        now = datetime.now()
    weekday = target_date.weekday()
    schedules = (
        db.query(GroupSchedule)
        .join(Group, Group.id == GroupSchedule.group_id)
        .filter(GroupSchedule.day_of_week == weekday, Group.status == "active")
        .order_by(GroupSchedule.start_time)
        .all()
    )
    out: List[dict] = []
    seen_keys = set()
    for sched in schedules:
        group = (
            db.query(Group)
            .options(joinedload(Group.trainer), joinedload(Group.group_students))
            .filter(Group.id == sched.group_id)
            .first()
        )
        if not group:
            continue
        key = (group.id, sched.start_time, sched.end_time)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        trainer = group.trainer
        lesson_start = datetime.combine(target_date, sched.start_time)
        lesson_end = datetime.combine(target_date, sched.end_time)
        status_value = _lesson_task_status(lesson_start, lesson_end, now) if target_date == date.today() else "waiting"

        student_ids = [group_student.student_id for group_student in group.group_students]
        attendance_rows = {}
        if student_ids:
            attendances = (
                db.query(LessonAttendance)
                .filter(
                    LessonAttendance.group_id == group.id,
                    LessonAttendance.lesson_date == target_date,
                    LessonAttendance.student_id.in_(student_ids),
                )
                .all()
            )
            for attendance in attendances:
                attendance_rows[attendance.student_id] = attendance

        cards = {}
        if student_ids:
            card_list = (
                db.query(StudentCard)
                .filter(StudentCard.student_id.in_(student_ids), StudentCard.archived.is_(False))
                .all()
            )
            for card in card_list:
                if card.student_id:
                    cards[card.student_id] = card

        students_out = []
        students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
        display_names = get_students_display_names(db, student_ids)
        for student in students:
            card = cards.get(student.id)
            attendance = attendance_rows.get(student.id)
            attended = attendance.attended if attendance else None
            late = getattr(attendance, "late", False) if attendance else False
            call_result = getattr(attendance, "call_result", None) if attendance else None
            students_out.append(
                {
                    "student_id": student.id,
                    "full_name": display_names.get(student.id, student.full_name or "—"),
                    "attended": attended,
                    "late": late,
                    "call_result": call_result,
                    "parent_full_name": (card.parent_full_name if card else None) or None,
                    "parent_phone": (card.parent_phone if card else None) or None,
                    "parent_phone_2": (card.parent_phone_2 if card else None) or None,
                    "parent_telegram": (card.parent_telegram if card else None) or None,
                }
            )

        call_contacted_count = sum(1 for item in students_out if item.get("call_result"))
        out.append(
            {
                "group_id": group.id,
                "group_name": group.name,
                "direction": group.direction,
                "schedule_id": sched.id,
                "lesson_date": target_date.isoformat(),
                "start_time": sched.start_time.strftime("%H:%M")
                if hasattr(sched.start_time, "strftime")
                else str(sched.start_time),
                "end_time": sched.end_time.strftime("%H:%M")
                if hasattr(sched.end_time, "strftime")
                else str(sched.end_time),
                "status": status_value,
                "trainer_id": trainer.id if trainer else None,
                "trainer_name": trainer.full_name if trainer else "—",
                "students": students_out,
                "total": len(students_out),
                "present_count": sum(1 for item in students_out if item.get("attended") is True),
                "absent_count": sum(1 for item in students_out if item.get("attended") is False),
                "unknown_count": sum(1 for item in students_out if item.get("attended") is None),
                "call_contacted_count": call_contacted_count,
            }
        )
    return out


VALID_CALL_RESULTS = {"contacted", "no_answer", "cancelled", "technical", "messenger"}


@router.get("/lesson-tasks/today")
async def list_lesson_tasks_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    items = _lesson_tasks_for_date(db, date.today())
    items = [item for item in items if item.get("status") != "completed"]
    return {"items": items}


@router.get("/lesson-tasks/tomorrow")
async def list_lesson_tasks_tomorrow(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    items = _lesson_tasks_for_date(db, date.today() + timedelta(days=1))
    return {"items": items}


@router.get("/lesson-tasks/week")
async def list_lesson_tasks_week(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    today = date.today()
    items: List[dict] = []
    for day_offset in range(7):
        items.extend(_lesson_tasks_for_date(db, today + timedelta(days=day_offset)))
    return {"items": items}


@router.post("/lesson-tasks/call-result")
async def set_lesson_call_result(
    payload: LessonCallResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    if payload.call_result not in VALID_CALL_RESULTS:
        raise HTTPException(status_code=400, detail=f"call_result must be one of: {sorted(VALID_CALL_RESULTS)}")
    lesson_date = payload.lesson_date if isinstance(payload.lesson_date, date) else date.fromisoformat(str(payload.lesson_date))
    attendance = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.group_id == payload.group_id,
            LessonAttendance.lesson_date == lesson_date,
            LessonAttendance.student_id == payload.student_id,
        )
        .first()
    )
    if not attendance:
        attendance = LessonAttendance(
            group_id=payload.group_id,
            lesson_date=lesson_date,
            student_id=payload.student_id,
            attended=False,
        )
        db.add(attendance)
        db.commit()
        db.refresh(attendance)
    attendance.call_result = payload.call_result
    attendance.call_result_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/sales-instructions", response_model=List[SalesInstructionResponse])
async def list_sales_instructions(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "sales.access")
    return db.query(SalesInstruction).order_by(SalesInstruction.created_at.asc()).all()


@router.post("/sales-instructions", response_model=SalesInstructionResponse, status_code=status.HTTP_201_CREATED)
async def create_sales_instruction(
    payload: SalesInstructionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    title = (payload.title or "").strip()
    body = (payload.body or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")
    item = SalesInstruction(title=title, body=body, created_by_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "sales_instruction", item.id, {"title": title})
    return item


@router.put("/sales-instructions/{instruction_id}", response_model=SalesInstructionResponse)
async def update_sales_instruction(
    instruction_id: int,
    payload: SalesInstructionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    item = db.query(SalesInstruction).filter(SalesInstruction.id == instruction_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found")
    data = payload.dict(exclude_unset=True)
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        item.title = title
    if "body" in data:
        body = (data["body"] or "").strip()
        if not body:
            raise HTTPException(status_code=400, detail="Body is required")
        item.body = body
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "sales_instruction", item.id, data)
    return item


@router.delete("/sales-instructions/{instruction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sales_instruction(
    instruction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    item = db.query(SalesInstruction).filter(SalesInstruction.id == instruction_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found")
    db.delete(item)
    db.commit()
    log_action(db, current_user.id, "delete", "sales_instruction", instruction_id, {})
    return None


@router.post("/instruction-images")
async def upload_sales_instruction_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(data) > 400 * 1024:
        raise HTTPException(status_code=400, detail="Картинка слишком большая (лимит ~400KB)")
    image = SalesInstructionImage(data=data, content_type=content_type)
    db.add(image)
    db.commit()
    db.refresh(image)
    return {"id": image.id, "url": f"/api/sales/instruction-images/{image.id}"}


@router.get("/instruction-images/{image_id}")
async def get_sales_instruction_image(
    image_id: int,
    db: Session = Depends(get_db),
):
    image = db.query(SalesInstructionImage).filter(SalesInstructionImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return StreamingResponse(BytesIO(image.data), media_type=image.content_type or "application/octet-stream")
