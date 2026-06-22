from datetime import date, timedelta, time as dt_time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    AbsenceFollowUp,
    CustomLesson,
    Group,
    GroupProgram,
    GroupSchedule,
    ProgramMakeupCompatibility,
    Student,
    StudentProgram,
    User,
)
from app.schemas.sales import (
    AbsenceFollowUpResponse,
    AbsenceFollowUpStageUpdate,
    MakeupSuggestionItem,
    PublicMakeupSelectionRequest,
    PublicMakeupSlotsResponse,
    AbsenceMakeupAssign,
)
from app.services.absence_makeup import assign_makeup_for_absence as absence_makeup_assign
from app.services.makeup_selection import (
    close_send_link_tasks_for_absence,
    create_sales_confirmation_task,
    list_makeup_suggestions_for_absence,
    queue_makeup_selection_request,
    resolve_absence_by_token,
)
from app.services.student_activity import log_student_activity
from app.student_display import get_student_display_name

router = APIRouter()


def _require_sales_admin_owner(user: User) -> None:
    auth.ensure_permission(user, "sales.access")


def _get_student_program_name(
    db: Session,
    student_id: int,
    fallback_group_id: Optional[int] = None,
) -> Optional[str]:
    student_program = (
        db.query(StudentProgram)
        .filter(StudentProgram.student_id == student_id, StudentProgram.status == "active")
        .first()
    )
    if student_program and student_program.program:
        return student_program.program.name
    if fallback_group_id:
        group_program = db.query(GroupProgram).filter(GroupProgram.group_id == fallback_group_id).first()
        if group_program and group_program.program:
            return group_program.program.name
    return None


def _absence_to_response(db: Session, absence: AbsenceFollowUp) -> AbsenceFollowUpResponse:
    student = db.query(Student).filter(Student.id == absence.student_id).first()
    group = db.query(Group).filter(Group.id == absence.group_id).first()
    makeup_group = db.query(Group).filter(Group.id == absence.makeup_group_id).first() if absence.makeup_group_id else None
    makeup_custom_lesson = None
    if getattr(absence, "makeup_custom_lesson_id", None):
        makeup_custom_lesson = db.query(CustomLesson).filter(CustomLesson.id == absence.makeup_custom_lesson_id).first()
    return AbsenceFollowUpResponse(
        id=absence.id,
        lesson_attendance_id=absence.lesson_attendance_id,
        student_id=absence.student_id,
        group_id=absence.group_id,
        lesson_date=absence.lesson_date,
        stage=absence.stage,
        absence_reason=getattr(absence, "absence_reason", None),
        absence_comment=getattr(absence, "absence_comment", None),
        makeup_group_id=getattr(absence, "makeup_group_id", None),
        makeup_lesson_date=getattr(absence, "makeup_lesson_date", None),
        makeup_custom_lesson_id=getattr(absence, "makeup_custom_lesson_id", None),
        makeup_custom_lesson_title=makeup_custom_lesson.title if makeup_custom_lesson else None,
        created_at=absence.created_at,
        updated_at=absence.updated_at,
        student_name=get_student_display_name(db, student) if student else None,
        group_name=group.name if group else None,
        program_name=_get_student_program_name(db, absence.student_id, absence.group_id),
        makeup_group_name=makeup_group.name if makeup_group else None,
    )


@router.get("/absences", response_model=List[AbsenceFollowUpResponse])
async def list_absences(
    stage: Optional[str] = Query(None),
    student_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    query = db.query(AbsenceFollowUp).order_by(AbsenceFollowUp.lesson_date.desc(), AbsenceFollowUp.id.desc())
    if stage:
        query = query.filter(AbsenceFollowUp.stage == stage)
    else:
        query = query.filter(AbsenceFollowUp.stage != "no_makeup_needed")
    if student_id is not None:
        query = query.filter(AbsenceFollowUp.student_id == student_id)
    return [_absence_to_response(db, item) for item in query.all()]


@router.patch("/absences/{absence_id}", response_model=AbsenceFollowUpResponse)
async def update_absence_stage(
    absence_id: int,
    payload: AbsenceFollowUpStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    valid_stages = ("missed", "assigned", "link_sent", "made_up", "missed_makeup", "no_makeup_needed")
    if payload.stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"stage должен быть один из: {valid_stages}")
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == absence_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Пропуск не найден")
    prev_stage = absence.stage
    absence.stage = payload.stage
    if payload.stage in ("missed_makeup", "no_makeup_needed"):
        absence.makeup_group_id = None
        absence.makeup_lesson_date = None
        absence.makeup_custom_lesson_id = None
    db.commit()
    db.refresh(absence)
    if payload.stage == "link_sent" and prev_stage != "link_sent":
        try:
            queue_makeup_selection_request(db, absence, created_by=current_user.id)
        except Exception:
            pass
    return _absence_to_response(db, absence)


@router.post("/absences/{absence_id}/assign-makeup", response_model=AbsenceFollowUpResponse)
async def assign_makeup(
    absence_id: int,
    payload: AbsenceMakeupAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    try:
        result = absence_makeup_assign(
            db,
            absence_id,
            makeup_group_id=payload.makeup_group_id,
            makeup_lesson_date=payload.makeup_lesson_date,
        )
    except ValueError as exc:
        message = str(exc)
        if "не найден" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    absence = result.absence
    log_student_activity(
        db,
        student_id=absence.student_id,
        activity_type="makeup_scheduled",
        title="Назначена отработка",
        description=f"Дата: {absence.makeup_lesson_date}"
        if getattr(absence, "makeup_lesson_date", None)
        else "Назначена отработка",
        created_by=current_user.id,
        payload_json={
            "absence_id": absence.id,
            "makeup_group_id": absence.makeup_group_id,
            "makeup_lesson_date": str(getattr(absence, "makeup_lesson_date", None) or ""),
        },
    )
    db.commit()
    db.refresh(absence)
    return _absence_to_response(db, absence)


@router.get("/absences/{absence_id}/suggest-makeups", response_model=List[MakeupSuggestionItem])
async def suggest_makeups(
    absence_id: int,
    days_ahead: int = Query(30, ge=7, le=60),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_sales_admin_owner(current_user)
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == absence_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Пропуск не найден")
    student_id = absence.student_id
    today = date.today()
    end_date = today + timedelta(days=days_ahead)
    student_programs = (
        db.query(StudentProgram)
        .filter(StudentProgram.student_id == student_id, StudentProgram.status == "active")
        .all()
    )
    source_program_ids = [student_program.program_id for student_program in student_programs if student_program.program_id]
    if not source_program_ids:
        group_program = db.query(GroupProgram).filter(GroupProgram.group_id == absence.group_id).first()
        if group_program:
            source_program_ids = [group_program.program_id]
    allowed_target_ids = set()
    for program_id in source_program_ids:
        compatibilities = (
            db.query(ProgramMakeupCompatibility)
            .filter(ProgramMakeupCompatibility.source_program_id == program_id)
            .all()
        )
        for compatibility in compatibilities:
            allowed_target_ids.add(compatibility.target_program_id)
    if not allowed_target_ids and source_program_ids:
        allowed_target_ids = set(source_program_ids)
    group_ids = (
        list(
            {
                row[0]
                for row in db.query(GroupProgram.group_id)
                .filter(GroupProgram.program_id.in_(allowed_target_ids))
                .distinct()
                .all()
            }
        )
        if allowed_target_ids
        else []
    )
    groups_active = (
        db.query(Group).filter(Group.id.in_(group_ids), Group.status == "active").all()
        if group_ids
        else []
    )
    groups_active = [group for group in groups_active if "индивид" not in (group.name or "").lower()]
    group_ids = [group.id for group in groups_active]
    slots = []
    for schedule in db.query(GroupSchedule).filter(GroupSchedule.group_id.in_(group_ids)).all():
        for day in range((end_date - today).days + 1):
            lesson_date = today + timedelta(days=day)
            if lesson_date.weekday() == schedule.day_of_week:
                slots.append((schedule.group_id, lesson_date, schedule.start_time))
    result = []
    seen = set()
    for group_id, lesson_date, start_time in sorted(slots, key=lambda item: (item[1], item[2] or dt_time(0, 0))):
        if (group_id, lesson_date) in seen:
            continue
        seen.add((group_id, lesson_date))
        group = next((item for item in groups_active if item.id == group_id), None) or db.query(Group).filter(Group.id == group_id).first()
        if not group:
            continue
        group_program = db.query(GroupProgram).filter(GroupProgram.group_id == group_id).first()
        program_name = group_program.program.name if group_program and group_program.program else None
        result.append(
            MakeupSuggestionItem(
                group_id=group_id,
                group_name=group.name,
                program_name=program_name,
                lesson_date=lesson_date,
                day_of_week=lesson_date.weekday(),
                start_time=start_time.strftime("%H:%M") if start_time else None,
            )
        )
    return result[:50]


@router.get("/public/makeup-selection", response_model=PublicMakeupSlotsResponse)
async def get_public_makeup_selection(
    token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    try:
        absence = resolve_absence_by_token(db, token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    student = db.query(Student).filter(Student.id == absence.student_id).first()
    group = db.query(Group).filter(Group.id == absence.group_id).first()
    return PublicMakeupSlotsResponse(
        absence_id=absence.id,
        student_id=absence.student_id,
        student_name=get_student_display_name(db, student) if student else None,
        original_group_name=group.name if group else None,
        missed_lesson_date=absence.lesson_date,
        available_slots=list_makeup_suggestions_for_absence(db, absence),
    )


@router.post("/public/makeup-selection/confirm", response_model=AbsenceFollowUpResponse)
async def confirm_public_makeup_selection(
    payload: PublicMakeupSelectionRequest,
    db: Session = Depends(get_db),
):
    try:
        absence = resolve_absence_by_token(db, payload.token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    try:
        result = absence_makeup_assign(
            db,
            absence.id,
            makeup_group_id=payload.makeup_group_id,
            makeup_lesson_date=payload.makeup_lesson_date,
        )
    except ValueError as exc:
        message = str(exc)
        if "не найден" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)

    absence = result.absence
    log_student_activity(
        db,
        student_id=absence.student_id,
        activity_type="makeup_scheduled",
        title="Назначена отработка",
        description=f"Дата: {absence.makeup_lesson_date}"
        if getattr(absence, "makeup_lesson_date", None)
        else "Назначена отработка",
        created_by=None,
        payload_json={
            "absence_id": absence.id,
            "makeup_group_id": absence.makeup_group_id,
            "makeup_lesson_date": str(getattr(absence, "makeup_lesson_date", None) or ""),
        },
    )
    selected_group = db.query(Group).filter(Group.id == absence.makeup_group_id).first()
    create_sales_confirmation_task(
        db,
        absence=absence,
        selected_group_name=selected_group.name if selected_group else f"#{absence.makeup_group_id}",
        created_by_id=None,
    )
    close_send_link_tasks_for_absence(db, absence_id=absence.id)
    db.commit()
    db.refresh(absence)
    return _absence_to_response(db, absence)
