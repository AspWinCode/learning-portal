"""
LEGO — Ленинец: изолированный API. Префикс /api/v1/lego.

Все эндпоинты проверяют права на бэкенде (lego.* permissions), скрытие пунктов меню — не защита.
Модели и логика полностью отдельны от Академии (Student, Group, LessonAttendance, StudentAccount).
"""

from datetime import date, time
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    LEGO_LESSON_CANCELLED,
    LEGO_LESSON_PLANNED,
    FinanceTarget,
    LegoBranch,
    LegoEvent,
    LegoEventRegistration,
    LEGO_PERIOD_MONTHLY,
    LEGO_STUDENT_ACTIVE,
    LEGO_STUDENT_ARCHIVED,
    LegoAttendance,
    LegoGroup,
    LegoGroupStudent,
    LegoLesson,
    LegoPayment,
    LegoStudent,
    User,
    UserRole,
)
from app.routers.action_log import log_action
from app.services import lego_service
from app.services.lego_payment_status import (
    DEBT_FILTER_STATUSES,
    DEBT_STATUSES,
    STATUS_DUE_SOON,
    STATUS_OVERDUE,
    STATUS_OVERDUE_3,
    STATUS_OVERDUE_10,
    STATUS_UNPAID,
    compute_payment_status,
)

router = APIRouter()


# ── Схемы ────────────────────────────────────────────────────────────────────

class LegoQuestionnaireIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=256)
    birth_date: date
    parent_name: str = Field(..., min_length=1, max_length=256)
    parent_phone: str = Field(..., max_length=32)
    secondary_phone: Optional[str] = Field(None, max_length=32)
    school: Optional[str] = Field(None, max_length=256)
    experience: str = Field(..., pattern=r"^(none|home|classes)$")
    preferred_schedule: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=2000)
    consent: bool

    @field_validator("full_name", "parent_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Укажите ФИО")
        return value

    @field_validator("parent_phone", "secondary_phone")
    @classmethod
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        digits = "".join(c for c in value if c in "0123456789")
        if len(digits) == 11 and digits[0] in "78":
            digits = "7" + digits[1:]
        elif len(digits) == 10:
            digits = "7" + digits
        else:
            raise ValueError("Укажите телефон из 10 цифр или 11 цифр с кодом 7/8")
        return "+" + digits

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        if value > date.today() or value.year < 1900:
            raise ValueError("Проверьте дату рождения")
        return value

    @field_validator("consent")
    @classmethod
    def validate_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Необходимо согласие на обработку данных анкеты")
        return value

class LegoStudentIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=256)
    birth_date: Optional[date] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    comment: Optional[str] = None
    start_date: Optional[date] = None


class LegoStudentPatch(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=256)
    birth_date: Optional[date] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    comment: Optional[str] = None
    start_date: Optional[date] = None
    status: Optional[str] = None  # active | archived


class LegoPaymentPlanIn(BaseModel):
    payment_amount: Optional[Decimal] = Field(None, ge=0)
    payment_active: Optional[bool] = None


class LegoPaymentIn(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_date: Optional[date] = None
    comment: Optional[str] = None
    idempotency_key: Optional[str] = Field(None, max_length=128)


class LegoGroupIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    trainer_id: Optional[int] = None
    branch_id: Optional[int] = None
    location: Optional[str] = "Ленинец"
    weekday: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class LegoGroupPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    trainer_id: Optional[int] = None
    branch_id: Optional[int] = None
    location: Optional[str] = None
    weekday: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    status: Optional[str] = None


class LegoMemberIn(BaseModel):
    student_id: int


class LegoLessonIn(BaseModel):
    group_id: int
    lesson_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    comment: Optional[str] = None


class LegoBranchIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-z0-9_]+$")
    name: str = Field(..., min_length=1, max_length=256)


class LegoEventIn(BaseModel):
    branch_id: int
    title: str = Field(..., min_length=1, max_length=256)
    event_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    price: Optional[Decimal] = Field(None, ge=0)
    capacity: Optional[int] = Field(None, ge=1)
    comment: Optional[str] = None


class LegoRegistrationIn(BaseModel):
    # Либо существующий участник, либо новый (создаётся без месячного тарифа).
    student_id: Optional[int] = None
    full_name: Optional[str] = Field(None, min_length=1, max_length=256)
    parent_phone: Optional[str] = None


class LegoEventPaymentIn(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)  # по умолчанию цена мастер-класса
    payment_date: Optional[date] = None
    idempotency_key: Optional[str] = Field(None, max_length=128)


class LegoAttendanceRecord(BaseModel):
    student_id: int
    attended: bool
    comment: Optional[str] = None


class LegoAttendanceIn(BaseModel):
    records: List[LegoAttendanceRecord]


class LegoLessonCancelIn(BaseModel):
    comment: Optional[str] = None


# ── Вспомогательные функции ──────────────────────────────────────────────────

def _require(user: User, permission: str) -> None:
    auth.ensure_permission(user, permission)


def _money(value) -> Optional[float]:
    return lego_service.amount_to_float(value)


def _get_student(db: Session, student_id: int) -> LegoStudent:
    row = db.query(LegoStudent).filter(LegoStudent.id == student_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="LEGO-ребёнок не найден")
    return row


def _get_group(db: Session, group_id: int) -> LegoGroup:
    row = db.query(LegoGroup).filter(LegoGroup.id == group_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="LEGO-группа не найдена")
    return row


def _get_lesson(db: Session, lesson_id: int) -> LegoLesson:
    row = db.query(LegoLesson).filter(LegoLesson.id == lesson_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    return row


def _scoped_student_ids(db: Session, user: User) -> Optional[List[int]]:
    """None — все дети; иначе дети, состоящие хотя бы в одной назначенной группе."""
    group_ids = lego_service.visible_group_ids(db, user)
    if group_ids is None:
        return None
    rows = (
        db.query(LegoGroupStudent.lego_student_id)
        .filter(LegoGroupStudent.lego_group_id.in_(group_ids or [-1]))
        .distinct()
        .all()
    )
    return [row.lego_student_id for row in rows]


def _student_query(db: Session, user: User):
    query = db.query(LegoStudent)
    scoped = _scoped_student_ids(db, user)
    if scoped is not None:
        query = query.filter(LegoStudent.id.in_(scoped or [-1]))
    return query


def _current_group_name(db: Session, student_id: int) -> Optional[str]:
    row = (
        db.query(LegoGroup.name)
        .join(LegoGroupStudent, LegoGroupStudent.lego_group_id == LegoGroup.id)
        .filter(LegoGroupStudent.lego_student_id == student_id, LegoGroupStudent.left_at.is_(None))
        .order_by(LegoGroupStudent.joined_at.desc())
        .first()
    )
    return row.name if row else None


def _current_group_row(db: Session, student_id: int):
    return (
        db.query(LegoGroup)
        .join(LegoGroupStudent, LegoGroupStudent.lego_group_id == LegoGroup.id)
        .filter(LegoGroupStudent.lego_student_id == student_id, LegoGroupStudent.left_at.is_(None))
        .order_by(LegoGroupStudent.joined_at.desc())
        .first()
    )


def _student_out(student: LegoStudent, group_name: Optional[str] = None) -> dict:
    return {
        "id": student.id,
        "full_name": student.full_name,
        "birth_date": student.birth_date.isoformat() if student.birth_date else None,
        "parent_name": student.parent_name,
        "parent_phone": student.parent_phone,
        "secondary_phone": student.secondary_phone,
        "comment": student.comment,
        "start_date": student.start_date.isoformat() if student.start_date else None,
        "status": student.status,
        "group_name": group_name,
    }


def _payment_status_out(student: LegoStudent, today: date) -> dict:
    result = compute_payment_status(today, student.paid_until, student.next_payment_date)
    return {
        "status": result.status,
        "days_until_due": result.days_until_due,
        "days_overdue": result.days_overdue,
    }


def _debt_rows(db: Session, user: User, today: date, filter_key: str) -> List[dict]:
    if filter_key not in DEBT_FILTER_STATUSES:
        raise HTTPException(status_code=400, detail="Неизвестный фильтр долгов")
    allowed = DEBT_FILTER_STATUSES[filter_key]
    students = (
        _student_query(db, user)
        .filter(LegoStudent.status == LEGO_STUDENT_ACTIVE, LegoStudent.payment_active.is_(True))
        .all()
    )
    rows: List[dict] = []
    for student in students:
        payment = _payment_status_out(student, today)
        if allowed is not None and payment["status"] not in allowed:
            continue
        group = _current_group_row(db, student.id)
        rows.append(
            {
                "student_id": student.id,
                "full_name": student.full_name,
                "group_name": group.name if group else None,
                "parent_name": student.parent_name,
                "parent_phone": student.parent_phone,
                "payment_amount": _money(student.payment_amount),
                "next_payment_date": student.next_payment_date.isoformat() if student.next_payment_date else None,
                **payment,
            }
        )
    rows.sort(key=lambda r: (-r["days_overdue"], r["full_name"]))
    return rows


def _summary_from_rows(rows: List[dict], include_money: bool) -> dict:
    overdue = [r for r in rows if r["status"] in {STATUS_OVERDUE, STATUS_OVERDUE_3, STATUS_OVERDUE_10}]
    summary = {
        "total_active": len(rows),
        "paid_ok": sum(1 for r in rows if r["status"] == "ok"),
        "due_soon": sum(1 for r in rows if r["status"] == STATUS_DUE_SOON),
        "overdue": len(overdue),
        "overdue_3": sum(1 for r in rows if r["days_overdue"] >= 3),
        "overdue_10": sum(1 for r in rows if r["days_overdue"] >= 10),
        "unpaid": sum(1 for r in rows if r["status"] == STATUS_UNPAID),
        "expected_debt_amount": None,
        "overdue_amount": None,
    }
    if include_money:
        debt_rows = [r for r in rows if r["status"] in DEBT_STATUSES]
        summary["expected_debt_amount"] = round(sum(r["payment_amount"] or 0 for r in debt_rows), 2)
        summary["overdue_amount"] = round(sum(r["payment_amount"] or 0 for r in overdue), 2)
    return summary


@router.post("/public/questionnaire")
def submit_questionnaire(payload: LegoQuestionnaireIn, db: Session = Depends(get_db)) -> dict:
    # Повторная отправка не создаёт вторую карточку и не меняет данные существующей.
    existing = db.query(LegoStudent).filter(
        func.lower(LegoStudent.full_name) == payload.full_name.lower(),
        LegoStudent.birth_date == payload.birth_date,
        func.regexp_replace(LegoStudent.parent_phone, "[^0-9]", "", "g").like(
            f"%{payload.parent_phone[-10:]}"
        ),
    ).first()
    if existing:
        return {"ok": True}
    experience_labels = {"none": "Нет опыта", "home": "Собирает дома", "classes": "Посещал занятия"}
    notes = ["Анкета LEGO — Ленинец", f"Опыт LEGO: {experience_labels[payload.experience]}"]
    for label, value in (
        ("Школа / детский сад", payload.school),
        ("Удобное время", payload.preferred_schedule),
        ("Комментарий", payload.comment),
    ):
        if value and value.strip():
            notes.append(f"{label}: {value.strip()}")
    notes.append(f"Согласие на обработку данных анкеты: {date.today().isoformat()}")
    student = LegoStudent(
        full_name=payload.full_name,
        birth_date=payload.birth_date,
        parent_name=payload.parent_name,
        parent_phone=payload.parent_phone,
        secondary_phone=payload.secondary_phone,
        comment="\n".join(notes),
        start_date=date.today(),
        status=LEGO_STUDENT_ACTIVE,
        payment_period=LEGO_PERIOD_MONTHLY,
        payment_active=False,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    log_action(db, None, "lego_questionnaire_submit", "lego_student", student.id, {})
    return {"ok": True}


# ── Дашборд ──────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def lego_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    today = date.today()
    include_money = auth.has_permission(current_user, "lego.payments_manage")

    group_ids = lego_service.visible_group_ids(db, current_user)
    lessons_q = db.query(LegoLesson).filter(
        LegoLesson.lesson_date == today,
        LegoLesson.status != LEGO_LESSON_CANCELLED,
    )
    if group_ids is not None:
        lessons_q = lessons_q.filter(LegoLesson.group_id.in_(group_ids or [-1]))
    lesson_ids = [lesson.id for lesson in lessons_q.all()]

    attended_today = 0
    if lesson_ids:
        attended_today = (
            db.query(func.count(LegoAttendance.id))
            .filter(LegoAttendance.lesson_id.in_(lesson_ids), LegoAttendance.attended.is_(True))
            .scalar()
            or 0
        )

    rows = _debt_rows(db, current_user, today, "all")
    summary = _summary_from_rows(rows, include_money)

    revenue_month = None
    if include_money:
        month_start = today.replace(day=1)
        revenue_month = float(
            db.query(func.coalesce(func.sum(LegoPayment.amount), 0))
            .filter(LegoPayment.payment_date >= month_start, LegoPayment.payment_date <= today)
            .scalar()
            or 0
        )

    return {
        "active_students": summary["total_active"],
        "lessons_today": len(lesson_ids),
        "attended_today": attended_today,
        "payments_expected": summary["due_soon"] + summary["overdue"] + summary["unpaid"],
        "overdue": summary["overdue"],
        "overdue_amount": summary["overdue_amount"],
        "revenue_this_month": revenue_month,
        "money_visible": include_money,
    }


# ── Дети ─────────────────────────────────────────────────────────────────────

@router.get("/students")
def list_students(
    q: Optional[str] = Query(None, max_length=128),
    status_filter: str = Query("active", alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.access")
    query = _student_query(db, current_user)
    if status_filter in (LEGO_STUDENT_ACTIVE, LEGO_STUDENT_ARCHIVED):
        query = query.filter(LegoStudent.status == status_filter)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(LegoStudent.full_name.ilike(like) | LegoStudent.parent_phone.ilike(like))
    students = query.order_by(LegoStudent.full_name).limit(500).all()
    return [_student_out(s, _current_group_name(db, s.id)) for s in students]


@router.post("/students", status_code=201)
def create_student(
    payload: LegoStudentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.students_manage")
    student = LegoStudent(
        full_name=payload.full_name.strip(),
        birth_date=payload.birth_date,
        parent_name=payload.parent_name,
        parent_phone=payload.parent_phone,
        secondary_phone=payload.secondary_phone,
        comment=payload.comment,
        start_date=payload.start_date or date.today(),
        status=LEGO_STUDENT_ACTIVE,
        payment_period=LEGO_PERIOD_MONTHLY,
        payment_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    log_action(db, current_user.id, "lego_student_create", "lego_student", student.id, {"full_name": student.full_name})
    return _student_out(student)


@router.get("/students/{student_id}")
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    student = _get_student(db, student_id)
    if not lego_service.can_see_student(db, current_user, student):
        raise HTTPException(status_code=404, detail="LEGO-ребёнок не найден")

    today = date.today()
    groups = (
        db.query(LegoGroup, LegoGroupStudent)
        .join(LegoGroupStudent, LegoGroupStudent.lego_group_id == LegoGroup.id)
        .filter(LegoGroupStudent.lego_student_id == student.id)
        .order_by(LegoGroupStudent.joined_at.desc())
        .all()
    )

    history_rows = (
        db.query(LegoAttendance, LegoLesson, LegoGroup)
        .join(LegoLesson, LegoLesson.id == LegoAttendance.lesson_id)
        .join(LegoGroup, LegoGroup.id == LegoLesson.group_id)
        .filter(LegoAttendance.student_id == student.id, LegoLesson.status != LEGO_LESSON_CANCELLED)
        .order_by(LegoLesson.lesson_date.desc(), LegoLesson.id.desc())
        .all()
    )
    history = [
        {
            "lesson_id": lesson.id,
            "date": lesson.lesson_date.isoformat(),
            "group_name": group.name,
            "attended": att.attended,
            "comment": att.comment,
        }
        for att, lesson, group in history_rows
    ]
    attended_count = sum(1 for h in history if h["attended"])

    money_visible = auth.has_permission(current_user, "lego.payments_manage")
    payments_block = None
    if money_visible:
        payments = (
            db.query(LegoPayment)
            .filter(LegoPayment.student_id == student.id)
            .order_by(LegoPayment.payment_date.desc(), LegoPayment.id.desc())
            .all()
        )
        payments_block = {
            "plan": {
                "payment_amount": _money(student.payment_amount),
                "payment_period": student.payment_period,
                "payment_active": bool(student.payment_active),
                "paid_until": student.paid_until.isoformat() if student.paid_until else None,
                "next_payment_date": student.next_payment_date.isoformat() if student.next_payment_date else None,
            },
            "status": _payment_status_out(student, today),
            "history": [
                {
                    "id": p.id,
                    "amount": _money(p.amount),
                    "payment_date": p.payment_date.isoformat(),
                    "period_start": p.period_start.isoformat() if p.period_start else None,
                    "period_end": p.period_end.isoformat() if p.period_end else None,
                    "comment": p.comment,
                    "finance_transaction_id": p.finance_transaction_id,
                }
                for p in payments
            ],
        }

    current_group = groups[0][0].name if groups else None
    return {
        **_student_out(student, current_group),
        "groups": [
            {"group_id": g.id, "name": g.name, "joined_at": m.joined_at.isoformat(), "left_at": m.left_at.isoformat() if m.left_at else None}
            for g, m in groups
        ],
        "attendance": {
            "history": history,
            "total": len(history),
            "attended": attended_count,
            "missed": len(history) - attended_count,
        },
        "payments": payments_block,
    }


@router.patch("/students/{student_id}")
def update_student(
    student_id: int,
    payload: LegoStudentPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.students_manage")
    student = _get_student(db, student_id)
    if not lego_service.can_see_student(db, current_user, student):
        raise HTTPException(status_code=404, detail="LEGO-ребёнок не найден")

    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] not in (LEGO_STUDENT_ACTIVE, LEGO_STUDENT_ARCHIVED):
        raise HTTPException(status_code=400, detail="Статус: active или archived")
    for key, value in changes.items():
        if key == "full_name" and value is not None:
            value = value.strip()
        setattr(student, key, value)
    db.commit()
    db.refresh(student)
    log_action(db, current_user.id, "lego_student_update", "lego_student", student.id, {"fields": sorted(changes.keys())})
    return _student_out(student, _current_group_name(db, student.id))


@router.put("/students/{student_id}/payment-plan")
def set_payment_plan(
    student_id: int,
    payload: LegoPaymentPlanIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.payments_manage")
    student = _get_student(db, student_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(student, key, value)
    db.commit()
    log_action(db, current_user.id, "lego_payment_plan_update", "lego_student", student.id, {"fields": sorted(changes.keys())})
    return {"id": student.id, "payment_amount": _money(student.payment_amount), "payment_active": bool(student.payment_active)}


# ── Оплаты ───────────────────────────────────────────────────────────────────

@router.post("/students/{student_id}/payments", status_code=201)
def register_payment(
    student_id: int,
    payload: LegoPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require(current_user, "lego.payments_manage")
    student = _get_student(db, student_id)
    payment, created = lego_service.register_payment(
        db,
        student,
        amount=payload.amount,
        payment_date=payload.payment_date or date.today(),
        created_by=current_user.id,
        comment=payload.comment,
        idempotency_key=payload.idempotency_key,
    )
    if created:
        log_action(
            db,
            current_user.id,
            "lego_payment_create",
            "lego_payment",
            payment.id,
            {"student_id": student.id, "amount": float(payment.amount), "finance_transaction_id": payment.finance_transaction_id},
        )
    return {
        "id": payment.id,
        "student_id": payment.student_id,
        "amount": _money(payment.amount),
        "payment_date": payment.payment_date.isoformat(),
        "period_start": payment.period_start.isoformat() if payment.period_start else None,
        "period_end": payment.period_end.isoformat() if payment.period_end else None,
        "paid_until": payment.paid_until.isoformat() if payment.paid_until else None,
        "finance_transaction_id": payment.finance_transaction_id,
        "created": created,
    }


@router.get("/payments")
def list_payments(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.payments_manage")
    rows = (
        db.query(LegoPayment, LegoStudent)
        .join(LegoStudent, LegoStudent.id == LegoPayment.student_id)
        .order_by(LegoPayment.payment_date.desc(), LegoPayment.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": p.id,
            "student_id": s.id,
            "student_name": s.full_name,
            "amount": _money(p.amount),
            "payment_date": p.payment_date.isoformat(),
            "paid_until": p.paid_until.isoformat() if p.paid_until else None,
            "finance_transaction_id": p.finance_transaction_id,
        }
        for p, s in rows
    ]


# ── Группы ───────────────────────────────────────────────────────────────────

def _group_out(db: Session, group: LegoGroup) -> dict:
    members = (
        db.query(func.count(LegoGroupStudent.id))
        .filter(LegoGroupStudent.lego_group_id == group.id, LegoGroupStudent.left_at.is_(None))
        .scalar()
        or 0
    )
    return {
        "id": group.id,
        "name": group.name,
        "trainer_id": group.trainer_id,
        "trainer_name": group.trainer.full_name if group.trainer else None,
        "location": group.location,
        "branch_id": group.branch_id,
        "branch_name": group.branch.name if group.branch else None,
        "weekday": group.weekday,
        "start_time": group.start_time.isoformat() if group.start_time else None,
        "end_time": group.end_time.isoformat() if group.end_time else None,
        "status": group.status,
        "students_count": members,
    }


@router.get("/groups")
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.access")
    query = db.query(LegoGroup)
    group_ids = lego_service.visible_group_ids(db, current_user)
    if group_ids is not None:
        query = query.filter(LegoGroup.id.in_(group_ids or [-1]))
    return [_group_out(db, g) for g in query.order_by(LegoGroup.name).all()]


@router.get("/trainers")
def list_trainers(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    """Тренеры для выбора ответственного в LEGO-группе. Нужен lego.manage, а не users.access."""
    _require(current_user, "lego.manage")
    rows = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .order_by(User.full_name)
        .all()
    )
    return [{"id": u.id, "full_name": u.full_name} for u in rows]


@router.get("/groups/{group_id}")
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    group = _get_group(db, group_id)
    if not lego_service.can_see_group(current_user, group):
        raise HTTPException(status_code=404, detail="LEGO-группа не найдена")
    members = (
        db.query(LegoStudent, LegoGroupStudent)
        .join(LegoGroupStudent, LegoGroupStudent.lego_student_id == LegoStudent.id)
        .filter(LegoGroupStudent.lego_group_id == group.id, LegoGroupStudent.left_at.is_(None))
        .order_by(LegoStudent.full_name)
        .all()
    )
    return {
        **_group_out(db, group),
        "members": [
            {"student_id": s.id, "full_name": s.full_name, "joined_at": m.joined_at.isoformat()}
            for s, m in members
        ],
    }


@router.post("/groups", status_code=201)
def create_group(
    payload: LegoGroupIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    group = LegoGroup(
        name=payload.name.strip(),
        trainer_id=payload.trainer_id,
        location=payload.location or "Ленинец",
        branch_id=payload.branch_id or lego_service.default_branch(db).id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=LEGO_STUDENT_ACTIVE,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    log_action(db, current_user.id, "lego_group_create", "lego_group", group.id, {"name": group.name})
    return _group_out(db, group)


@router.patch("/groups/{group_id}")
def update_group(
    group_id: int,
    payload: LegoGroupPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    group = _get_group(db, group_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(group, key, value)
    db.commit()
    db.refresh(group)
    log_action(db, current_user.id, "lego_group_update", "lego_group", group.id, {"fields": sorted(changes.keys())})
    return _group_out(db, group)


@router.post("/groups/{group_id}/members", status_code=201)
def add_group_member(
    group_id: int,
    payload: LegoMemberIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    group = _get_group(db, group_id)
    student = _get_student(db, payload.student_id)
    active = (
        db.query(LegoGroupStudent.id)
        .filter(
            LegoGroupStudent.lego_group_id == group.id,
            LegoGroupStudent.lego_student_id == student.id,
            LegoGroupStudent.left_at.is_(None),
        )
        .first()
    )
    if active:
        raise HTTPException(status_code=409, detail="Ребёнок уже в этой группе")
    db.add(LegoGroupStudent(lego_group_id=group.id, lego_student_id=student.id, joined_at=date.today()))
    db.commit()
    log_action(db, current_user.id, "lego_group_member_add", "lego_group", group.id, {"student_id": student.id})
    return {"group_id": group.id, "student_id": student.id}


@router.post("/groups/{group_id}/members/{student_id}/leave")
def leave_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    membership = (
        db.query(LegoGroupStudent)
        .filter(
            LegoGroupStudent.lego_group_id == group_id,
            LegoGroupStudent.lego_student_id == student_id,
            LegoGroupStudent.left_at.is_(None),
        )
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Активное членство не найдено")
    membership.left_at = date.today()
    db.commit()
    log_action(db, current_user.id, "lego_group_member_leave", "lego_group", group_id, {"student_id": student_id})
    return {"group_id": group_id, "student_id": student_id, "left_at": membership.left_at.isoformat()}


# ── Занятия ──────────────────────────────────────────────────────────────────

def _lesson_out(db: Session, lesson: LegoLesson) -> dict:
    return {
        "id": lesson.id,
        "group_id": lesson.group_id,
        "group_name": lesson.group.name if lesson.group else None,
        "lesson_date": lesson.lesson_date.isoformat(),
        "start_time": lesson.start_time.isoformat() if lesson.start_time else None,
        "end_time": lesson.end_time.isoformat() if lesson.end_time else None,
        "trainer_id": lesson.trainer_id,
        "status": lesson.status,
        "comment": lesson.comment,
        "students_count": len(lego_service.roster_for_lesson(db, lesson)),
    }


@router.get("/lessons")
def list_lessons(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    group_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.access")
    query = db.query(LegoLesson)
    group_ids = lego_service.visible_group_ids(db, current_user)
    if group_ids is not None:
        query = query.filter(LegoLesson.group_id.in_(group_ids or [-1]))
    if group_id is not None:
        query = query.filter(LegoLesson.group_id == group_id)
    if date_from is not None:
        query = query.filter(LegoLesson.lesson_date >= date_from)
    if date_to is not None:
        query = query.filter(LegoLesson.lesson_date <= date_to)
    lessons = query.order_by(LegoLesson.lesson_date, LegoLesson.start_time, LegoLesson.id).limit(500).all()
    return [_lesson_out(db, lesson) for lesson in lessons]


@router.post("/lessons", status_code=201)
def create_lesson(
    payload: LegoLessonIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.attendance")
    group = _get_group(db, payload.group_id)
    if not lego_service.can_see_group(current_user, group):
        raise HTTPException(status_code=403, detail="Группа не назначена вам")
    lesson = LegoLesson(
        group_id=group.id,
        lesson_date=payload.lesson_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        trainer_id=group.trainer_id,
        status=LEGO_LESSON_PLANNED,
        comment=payload.comment,
        created_by=current_user.id,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    log_action(db, current_user.id, "lego_lesson_create", "lego_lesson", lesson.id, {"group_id": group.id, "lesson_date": payload.lesson_date})
    return _lesson_out(db, lesson)


@router.get("/lessons/{lesson_id}")
def get_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    lesson = _get_lesson(db, lesson_id)
    group = _get_group(db, lesson.group_id)
    if not lego_service.can_see_group(current_user, group):
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    marks = {
        row.student_id: row
        for row in db.query(LegoAttendance).filter(LegoAttendance.lesson_id == lesson.id).all()
    }
    roster = lego_service.roster_for_lesson(db, lesson)
    return {
        **_lesson_out(db, lesson),
        "roster": [
            {
                "student_id": s.id,
                "full_name": s.full_name,
                "attended": marks[s.id].attended if s.id in marks else None,
                "comment": marks[s.id].comment if s.id in marks else None,
            }
            for s in roster
        ],
    }


@router.post("/lessons/{lesson_id}/attendance")
def save_attendance(
    lesson_id: int,
    payload: LegoAttendanceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.attendance")
    lesson = _get_lesson(db, lesson_id)
    group = _get_group(db, lesson.group_id)
    if not lego_service.can_see_group(current_user, group):
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    try:
        lego_service.ensure_lesson_editable(lesson)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    roster_ids = {s.id for s in lego_service.roster_for_lesson(db, lesson)}
    foreign = [r.student_id for r in payload.records if r.student_id not in roster_ids]
    if foreign:
        raise HTTPException(status_code=400, detail=f"Дети не в составе группы на эту дату: {foreign}")

    saved = lego_service.upsert_attendance(
        db,
        lesson,
        [(r.student_id, r.attended, r.comment) for r in payload.records],
        marked_by=current_user.id,
    )
    log_action(db, current_user.id, "lego_attendance_save", "lego_lesson", lesson.id, {"saved": saved})
    return {"saved": saved, "message": "Посещаемость сохранена"}


@router.post("/lessons/{lesson_id}/cancel")
def cancel_lesson(
    lesson_id: int,
    payload: LegoLessonCancelIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.attendance")
    lesson = _get_lesson(db, lesson_id)
    group = _get_group(db, lesson.group_id)
    if not lego_service.can_see_group(current_user, group):
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    lesson.status = LEGO_LESSON_CANCELLED
    if payload.comment:
        lesson.comment = payload.comment
    db.commit()
    log_action(db, current_user.id, "lego_lesson_cancel", "lego_lesson", lesson.id, None)
    return {"id": lesson.id, "status": lesson.status}


# ── Филиалы ──────────────────────────────────────────────────────────────────

def _branch_out(branch: LegoBranch) -> dict:
    return {
        "id": branch.id,
        "code": branch.code,
        "name": branch.name,
        "finance_target_id": branch.finance_target_id,
        "is_active": bool(branch.is_active),
    }


@router.get("/branches")
def list_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.access")
    lego_service.default_branch(db)
    db.commit()
    return [_branch_out(b) for b in db.query(LegoBranch).order_by(LegoBranch.name).all()]


@router.post("/branches", status_code=201)
def create_branch(
    payload: LegoBranchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    if db.query(LegoBranch).filter(LegoBranch.code == payload.code).first():
        raise HTTPException(status_code=409, detail="Филиал с таким кодом уже есть")
    # Target создаётся по коду филиала: доходы филиала видны отдельно в finance.
    target = db.query(FinanceTarget).filter(FinanceTarget.code == payload.code).first()
    if target is None:
        target = FinanceTarget(code=payload.code, name=f"LEGO — {payload.name.strip()}", is_active=True)
        db.add(target)
        db.flush()
    branch = LegoBranch(code=payload.code, name=payload.name.strip(), finance_target_id=target.id, is_active=True)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    log_action(db, current_user.id, "lego_branch_create", "lego_branch", branch.id, {"code": branch.code})
    return _branch_out(branch)


# ── Мастер-классы ────────────────────────────────────────────────────────────

def _event_out(db: Session, event: LegoEvent) -> dict:
    return {
        "id": event.id,
        "branch_id": event.branch_id,
        "branch_name": event.branch.name if event.branch else None,
        "title": event.title,
        "event_date": event.event_date.isoformat(),
        "start_time": event.start_time.isoformat() if event.start_time else None,
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "price": _money(event.price),
        "capacity": event.capacity,
        "status": event.status,
        "comment": event.comment,
        "registered": lego_service.event_registered_count(db, event),
    }


@router.get("/events")
def list_events(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[dict]:
    _require(current_user, "lego.access")
    query = db.query(LegoEvent)
    if date_from is not None:
        query = query.filter(LegoEvent.event_date >= date_from)
    if date_to is not None:
        query = query.filter(LegoEvent.event_date <= date_to)
    events = query.order_by(LegoEvent.event_date, LegoEvent.start_time, LegoEvent.id).limit(500).all()
    return [_event_out(db, e) for e in events]


@router.post("/events", status_code=201)
def create_event(
    payload: LegoEventIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.manage")
    branch = db.query(LegoBranch).filter(LegoBranch.id == payload.branch_id).first()
    if branch is None:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    event = LegoEvent(
        branch_id=branch.id,
        title=payload.title.strip(),
        event_date=payload.event_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        price=payload.price,
        capacity=payload.capacity,
        status=LEGO_LESSON_PLANNED,
        comment=payload.comment,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    log_action(db, current_user.id, "lego_event_create", "lego_event", event.id, {"title": event.title, "event_date": payload.event_date.isoformat()})
    return _event_out(db, event)


@router.get("/events/{event_id}")
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    event = db.query(LegoEvent).filter(LegoEvent.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Мастер-класс не найден")
    regs = (
        db.query(LegoEventRegistration, LegoStudent)
        .join(LegoStudent, LegoStudent.id == LegoEventRegistration.student_id)
        .filter(LegoEventRegistration.event_id == event.id)
        .order_by(LegoStudent.full_name)
        .all()
    )
    return {
        **_event_out(db, event),
        "participants": [
            {
                "student_id": s.id,
                "full_name": s.full_name,
                "parent_phone": s.parent_phone,
                "attended": r.attended,
                "paid": r.paid,
                "payment_id": r.payment_id,
            }
            for r, s in regs
        ],
    }


@router.post("/events/{event_id}/registrations", status_code=201)
def register_participant(
    event_id: int,
    payload: LegoRegistrationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.attendance")
    event = db.query(LegoEvent).filter(LegoEvent.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Мастер-класс не найден")
    if payload.student_id is not None:
        student = _get_student(db, payload.student_id)
    elif payload.full_name:
        # Разовый участник: карточка без месячного тарифа, в долги не попадает.
        student = LegoStudent(
            full_name=payload.full_name.strip(),
            parent_phone=payload.parent_phone,
            start_date=date.today(),
            status=LEGO_STUDENT_ACTIVE,
            payment_period=LEGO_PERIOD_MONTHLY,
            payment_active=False,
        )
        db.add(student)
        db.commit()
        db.refresh(student)
    else:
        raise HTTPException(status_code=400, detail="Укажите участника или ФИО нового")
    try:
        registration = lego_service.register_for_event(db, event, student)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    log_action(db, current_user.id, "lego_event_register", "lego_event", event.id, {"student_id": student.id})
    return {"event_id": event.id, "student_id": student.id, "registration_id": registration.id}


@router.post("/events/{event_id}/registrations/{student_id}/attendance")
def mark_event_attendance(
    event_id: int,
    student_id: int,
    attended: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.attendance")
    registration = (
        db.query(LegoEventRegistration)
        .filter(LegoEventRegistration.event_id == event_id, LegoEventRegistration.student_id == student_id)
        .first()
    )
    if registration is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    registration.attended = attended
    db.commit()
    log_action(db, current_user.id, "lego_event_attendance", "lego_event", event_id, {"student_id": student_id, "attended": attended})
    return {"event_id": event_id, "student_id": student_id, "attended": attended}


@router.post("/events/{event_id}/registrations/{student_id}/payment")
def pay_for_event(
    event_id: int,
    student_id: int,
    payload: LegoEventPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require(current_user, "lego.payments_manage")
    event = db.query(LegoEvent).filter(LegoEvent.id == event_id).first()
    registration = (
        db.query(LegoEventRegistration)
        .filter(LegoEventRegistration.event_id == event_id, LegoEventRegistration.student_id == student_id)
        .first()
    )
    if event is None or registration is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    amount = payload.amount or event.price
    if amount is None:
        raise HTTPException(status_code=400, detail="Укажите сумму: у мастер-класса не задана цена")
    if registration.paid and not payload.idempotency_key:
        raise HTTPException(status_code=409, detail="Участник уже оплатил этот мастер-класс")
    try:
        payment, created = lego_service.register_event_payment(
            db,
            registration,
            amount=amount,
            payment_date=payload.payment_date or date.today(),
            created_by=current_user.id,
            idempotency_key=payload.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if created:
        log_action(db, current_user.id, "lego_event_payment", "lego_payment", payment.id, {"event_id": event_id, "student_id": student_id, "amount": float(amount)})
    return {"payment_id": payment.id, "amount": _money(payment.amount), "created": created, "finance_transaction_id": payment.finance_transaction_id}


# ── Долги и сводка ───────────────────────────────────────────────────────────

@router.get("/debts")
def list_debts(
    filter_key: str = Query("all", alias="filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.access")
    today = date.today()
    include_money = auth.has_permission(current_user, "lego.payments_manage")
    all_rows = _debt_rows(db, current_user, today, "all")
    rows = _debt_rows(db, current_user, today, filter_key)
    return {
        "summary": _summary_from_rows(all_rows, include_money),
        "rows": rows,
        "money_visible": include_money,
    }


@router.get("/payment-summary")
def payment_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> dict:
    _require(current_user, "lego.payments_manage")
    today = date.today()
    rows = _debt_rows(db, current_user, today, "all")
    month_start = today.replace(day=1)
    revenue = (
        db.query(func.coalesce(func.sum(LegoPayment.amount), 0))
        .filter(LegoPayment.payment_date >= month_start, LegoPayment.payment_date <= today)
        .scalar()
        or 0
    )
    return {
        "summary": _summary_from_rows(rows, include_money=True),
        "revenue_this_month": float(revenue),
        "month_start": month_start.isoformat(),
    }
