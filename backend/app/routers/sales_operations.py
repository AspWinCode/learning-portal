from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    Abonement,
    AbsenceFollowUp,
    CustomLesson,
    CustomLessonStudent,
    CustomLessonType,
    LessonAttendance,
    Program,
    ProgramMakeupCompatibility,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
    StudentFreeze,
    StudentStatus,
    User,
    UserRole,
)
from app.schemas import (
    CloseByFactConfirm,
    CloseByFactPreview,
    CustomLessonCreate,
    CustomLessonResponse,
    CustomLessonUpdate,
    PaymentStatusItem,
    PaymentStatusSummary,
    ProgramMakeupCompatibilityCreate,
    ProgramMakeupCompatibilityResponse,
    StudentFreezeCreate,
    StudentFreezeResponse,
)
from app.services.manual_lesson import create_manual_lesson as manual_lesson_create
from app.services.payment_status import (
    get_payment_status_list as payment_status_list_svc,
    get_payment_status_summary as payment_status_summary_svc,
)
from app.services.student_activity import log_student_activity
from app.student_display import get_student_display_name

router = APIRouter()


def _require_owner(user: User) -> None:
    if auth.resolve_effective_role(user) != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Только owner")


def _require_owner_or_admin_settings(user: User) -> None:
    auth.ensure_permission(user, "settings.manage")


def _serialize_time_for_api(value) -> Optional[str]:
    if value is None:
        return None
    return value.strftime("%H:%M")


def _custom_lesson_to_response(db: Session, lesson: CustomLesson) -> CustomLessonResponse:
    trainer = db.query(User).filter(User.id == lesson.trainer_id).first()
    students_rows = (
        db.query(CustomLessonStudent, Student)
        .join(Student, Student.id == CustomLessonStudent.student_id)
        .filter(CustomLessonStudent.lesson_id == lesson.id)
        .all()
    )
    students = []
    for custom_lesson_student, student in students_rows:
        students.append(
            {
                "id": custom_lesson_student.id,
                "student_id": custom_lesson_student.student_id,
                "student_name": get_student_display_name(db, student) if student else None,
                "planned_absence_id": custom_lesson_student.planned_absence_id,
                "attended": bool(getattr(custom_lesson_student, "attended", False)),
                "absence_reason": getattr(custom_lesson_student, "absence_reason", None),
                "absence_comment": getattr(custom_lesson_student, "absence_comment", None),
            }
        )
    return CustomLessonResponse(
        id=lesson.id,
        title=lesson.title,
        lesson_date=lesson.lesson_date,
        start_time=_serialize_time_for_api(lesson.start_time) or "",
        end_time=_serialize_time_for_api(lesson.end_time),
        trainer_id=lesson.trainer_id,
        trainer_name=trainer.full_name if trainer else None,
        lesson_type=lesson.lesson_type.value if isinstance(lesson.lesson_type, CustomLessonType) else str(lesson.lesson_type),
        comment=lesson.comment,
        students=students,
    )


def _resolve_close_by_fact_summary(db: Session, student_id: int):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    period_start = getattr(card, "learning_period_start", None) if card else None
    if not period_start:
        period_start = date.today() - timedelta(days=30)
    period_end = date.today()
    attended = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.student_id == student_id,
            LessonAttendance.attended.is_(True),
            LessonAttendance.lesson_date >= period_start,
            LessonAttendance.lesson_date <= period_end,
        )
        .count()
    )
    abonement = student.abonement or (
        db.query(Abonement).filter(Abonement.id == student.abonement_id).first() if student.abonement_id else None
    )
    if card and getattr(card, "abonement_id", None):
        abonement = db.query(Abonement).filter(Abonement.id == card.abonement_id).first() or abonement
    price_per_lesson = 0.0
    if abonement and (abonement.lessons_count or 8) > 0:
        price_per_lesson = float(abonement.price or 0) / (abonement.lessons_count or 8)
    amount = round(price_per_lesson * attended, 2)
    return student, card, period_start, period_end, attended, amount


@router.get("/payment-status", response_model=List[PaymentStatusItem])
async def list_payment_status(
    status_filter: Optional[str] = Query(None, description="overdue | due_soon | ok | все"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    items = payment_status_list_svc(db, status_filter=status_filter)
    return [PaymentStatusItem(**item) for item in items]


@router.get("/payment-status-summary", response_model=PaymentStatusSummary)
async def get_payment_status_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    data = payment_status_summary_svc(db)
    return PaymentStatusSummary(**data)


@router.post("/custom-lessons", response_model=CustomLessonResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_lesson(
    payload: CustomLessonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("lessons.manage")),
):
    try:
        start_t = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        end_t = None
        if payload.end_time:
            end_t = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Время укажите в формате HH:MM")

    lesson_type_value = payload.lesson_type or "makeup"
    if lesson_type_value not in {lesson_type.value for lesson_type in CustomLessonType}:
        raise HTTPException(
            status_code=400,
            detail=f"lesson_type должен быть одним из: {[lesson_type.value for lesson_type in CustomLessonType]}",
        )

    students_tuples = [(item.student_id, item.planned_absence_id) for item in (payload.students or [])]
    try:
        result = manual_lesson_create(
            db,
            title=payload.title,
            lesson_date=payload.lesson_date,
            start_time=start_t,
            end_time=end_t,
            trainer_id=payload.trainer_id,
            lesson_type=lesson_type_value,
            comment=payload.comment,
            students=students_tuples,
            created_by_id=current_user.id,
        )
    except ValueError as exc:
        message = str(exc)
        if "не найден" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return _custom_lesson_to_response(db, result.lesson)


@router.get("/custom-lessons", response_model=List[CustomLessonResponse])
async def list_custom_lessons(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    trainer_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    lesson_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("lessons.access")),
):
    query = db.query(CustomLesson)
    if date_from:
        query = query.filter(CustomLesson.lesson_date >= date_from)
    if date_to:
        query = query.filter(CustomLesson.lesson_date <= date_to)
    if trainer_id:
        query = query.filter(CustomLesson.trainer_id == trainer_id)
    if lesson_type:
        query = query.filter(CustomLesson.lesson_type == lesson_type)
    lessons = query.order_by(CustomLesson.lesson_date.desc(), CustomLesson.start_time.asc()).all()

    if student_id is not None:
        lesson_ids = {
            lesson_student.lesson_id
            for lesson_student in db.query(CustomLessonStudent).filter(CustomLessonStudent.student_id == student_id).all()
        }
        lessons = [lesson for lesson in lessons if lesson.id in lesson_ids]

    return [_custom_lesson_to_response(db, lesson) for lesson in lessons]


@router.get("/custom-lessons/{lesson_id}", response_model=CustomLessonResponse)
async def get_custom_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("lessons.access")),
):
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")
    return _custom_lesson_to_response(db, lesson)


@router.put("/custom-lessons/{lesson_id}", response_model=CustomLessonResponse)
async def update_custom_lesson(
    lesson_id: int,
    payload: CustomLessonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("lessons.manage")),
):
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")

    if payload.title is not None:
        lesson.title = payload.title.strip()
    if payload.lesson_date is not None:
        lesson.lesson_date = payload.lesson_date
    if payload.start_time is not None:
        try:
            lesson.start_time = datetime.strptime(payload.start_time.strip(), "%H:%M").time()
        except ValueError:
            raise HTTPException(status_code=400, detail="start_time: формат HH:MM")
    if payload.end_time is not None:
        if payload.end_time == "":
            lesson.end_time = None
        else:
            try:
                lesson.end_time = datetime.strptime(payload.end_time.strip(), "%H:%M").time()
            except ValueError:
                raise HTTPException(status_code=400, detail="end_time: формат HH:MM")
    if payload.trainer_id is not None:
        trainer = db.query(User).filter(User.id == payload.trainer_id).first()
        if not trainer:
            raise HTTPException(status_code=404, detail="Тренер не найден")
        lesson.trainer_id = payload.trainer_id
    if payload.lesson_type is not None:
        if payload.lesson_type not in {lesson_type.value for lesson_type in CustomLessonType}:
            raise HTTPException(
                status_code=400,
                detail=f"lesson_type должен быть одним из: {[lesson_type.value for lesson_type in CustomLessonType]}",
            )
        lesson.lesson_type = CustomLessonType(payload.lesson_type)
    if payload.comment is not None:
        lesson.comment = payload.comment.strip() or None

    if payload.students is not None:
        db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson.id).delete(synchronize_session=False)
        for item in payload.students:
            student = db.query(Student).filter(Student.id == item.student_id).first()
            if not student:
                raise HTTPException(status_code=404, detail=f"Ученик {item.student_id} не найден")
            planned_absence_id = item.planned_absence_id
            if planned_absence_id is not None:
                absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == planned_absence_id).first()
                if not absence or absence.student_id != item.student_id:
                    raise HTTPException(status_code=400, detail=f"Пропуск {planned_absence_id} не найден для этого ученика")
            db.add(
                CustomLessonStudent(
                    lesson_id=lesson.id,
                    student_id=item.student_id,
                    planned_absence_id=planned_absence_id,
                    attended=False,
                )
            )

    db.commit()
    db.refresh(lesson)
    return _custom_lesson_to_response(db, lesson)


@router.delete("/custom-lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("lessons.manage")),
):
    lesson = db.query(CustomLesson).filter(CustomLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Ручной урок не найден")
    db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson.id).delete(synchronize_session=False)
    db.delete(lesson)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/program-makeup-compatibility", response_model=List[ProgramMakeupCompatibilityResponse])
async def list_program_makeup_compatibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner_or_admin_settings(current_user)
    items = (
        db.query(ProgramMakeupCompatibility)
        .order_by(
            ProgramMakeupCompatibility.source_program_id,
            ProgramMakeupCompatibility.target_program_id,
        )
        .all()
    )
    result = []
    for compatibility in items:
        source_program = db.query(Program).filter(Program.id == compatibility.source_program_id).first()
        target_program = db.query(Program).filter(Program.id == compatibility.target_program_id).first()
        result.append(
            ProgramMakeupCompatibilityResponse(
                id=compatibility.id,
                source_program_id=compatibility.source_program_id,
                target_program_id=compatibility.target_program_id,
                source_program_name=source_program.name if source_program else None,
                target_program_name=target_program.name if target_program else None,
            )
        )
    return result


@router.post("/program-makeup-compatibility", response_model=ProgramMakeupCompatibilityResponse, status_code=status.HTTP_201_CREATED)
async def create_program_makeup_compatibility(
    payload: ProgramMakeupCompatibilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner_or_admin_settings(current_user)
    for program_id in (payload.source_program_id, payload.target_program_id):
        if not db.query(Program).filter(Program.id == program_id).first():
            raise HTTPException(status_code=404, detail=f"Программа {program_id} не найдена")
    compatibility = ProgramMakeupCompatibility(
        source_program_id=payload.source_program_id,
        target_program_id=payload.target_program_id,
    )
    db.add(compatibility)
    db.commit()
    db.refresh(compatibility)
    source_program = db.query(Program).filter(Program.id == compatibility.source_program_id).first()
    target_program = db.query(Program).filter(Program.id == compatibility.target_program_id).first()
    return ProgramMakeupCompatibilityResponse(
        id=compatibility.id,
        source_program_id=compatibility.source_program_id,
        target_program_id=compatibility.target_program_id,
        source_program_name=source_program.name if source_program else None,
        target_program_name=target_program.name if target_program else None,
    )


@router.delete("/program-makeup-compatibility/{compat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program_makeup_compatibility(
    compat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner_or_admin_settings(current_user)
    compatibility = db.query(ProgramMakeupCompatibility).filter(ProgramMakeupCompatibility.id == compat_id).first()
    if not compatibility:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    db.delete(compatibility)
    db.commit()


@router.get("/students/{student_id}/freezes", response_model=List[StudentFreezeResponse])
async def list_student_freezes(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "sales.access")
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    freezes = (
        db.query(StudentFreeze)
        .filter(StudentFreeze.student_id == student_id)
        .order_by(StudentFreeze.freeze_start.desc())
        .all()
    )
    return [
        StudentFreezeResponse(
            id=freeze.id,
            student_id=freeze.student_id,
            freeze_start=freeze.freeze_start,
            freeze_end=freeze.freeze_end,
            created_at=freeze.created_at,
        )
        for freeze in freezes
    ]


@router.post("/students/{student_id}/freezes", response_model=StudentFreezeResponse, status_code=status.HTTP_201_CREATED)
async def create_student_freeze(
    student_id: int,
    payload: StudentFreezeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if payload.freeze_end <= payload.freeze_start:
        raise HTTPException(status_code=400, detail="freeze_end должна быть больше freeze_start")
    freeze = StudentFreeze(student_id=student_id, freeze_start=payload.freeze_start, freeze_end=payload.freeze_end)
    db.add(freeze)
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if card and getattr(card, "next_payment_date", None):
        delta = (payload.freeze_end - payload.freeze_start).days
        card.next_payment_date = card.next_payment_date + timedelta(days=delta)
    log_student_activity(
        db,
        student_id=student_id,
        activity_type="freeze_set",
        title="Поставлена заморозка",
        description=f"{payload.freeze_start} — {payload.freeze_end}",
        created_by=current_user.id,
        payload_json={
            "freeze_start": payload.freeze_start.isoformat(),
            "freeze_end": payload.freeze_end.isoformat(),
        },
    )
    db.commit()
    db.refresh(freeze)
    return StudentFreezeResponse(
        id=freeze.id,
        student_id=freeze.student_id,
        freeze_start=freeze.freeze_start,
        freeze_end=freeze.freeze_end,
        created_at=freeze.created_at,
    )


@router.delete("/students/{student_id}/freezes/{freeze_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_freeze(
    student_id: int,
    freeze_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    freeze = (
        db.query(StudentFreeze)
        .filter(StudentFreeze.id == freeze_id, StudentFreeze.student_id == student_id)
        .first()
    )
    if not freeze:
        raise HTTPException(status_code=404, detail="Заморозка не найдена")
    db.delete(freeze)
    db.commit()


@router.get("/students/{student_id}/close-by-fact-preview", response_model=CloseByFactPreview)
async def close_by_fact_preview(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _, _, period_start, period_end, attended, amount = _resolve_close_by_fact_summary(db, student_id)
    return CloseByFactPreview(
        lessons_attended_in_period=attended,
        amount=amount,
        period_start=period_start,
        period_end=period_end,
    )


@router.post("/students/{student_id}/close-by-fact")
async def close_by_fact_confirm(
    student_id: int,
    payload: CloseByFactConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Подтвердите закрытие")
    student, card, period_start, period_end, attended, amount = _resolve_close_by_fact_summary(db, student_id)
    account = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).order_by(StudentAccount.id).first()
    if account and amount > 0:
        db.add(
            StudentAccountTransaction(
                account_id=account.id,
                amount=amount,
                kind=StudentAccountTransactionKind.PAYMENT,
                note=f"Закрытие по факту: {attended} занятий за период {period_start}–{period_end}",
            )
        )
        account.balance += amount
    for absence in db.query(AbsenceFollowUp).filter(AbsenceFollowUp.student_id == student_id).all():
        absence.stage = "made_up"
    if card:
        card.archived = True
    student.status = StudentStatus.ARCHIVED
    db.commit()
    return {"ok": True, "student_id": student_id, "amount": amount, "lessons_attended": attended}
