"""Страница «Расчёты» для owner: тренеры, ставки, уроки/часы, премии, выплаты."""
from datetime import date, time, datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app import auth
from app.database import get_db
from app.models import (
    User,
    UserRole,
    Group,
    GroupStatus,
    LessonAttendance,
    LessonTrainerOverride,
    TrainerPeriodBonus,
    TrainerPayout,
)

router = APIRouter()


def _time_eq(a: Optional[time], b: Optional[time]) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return a == b


def _slot_duration_hours(start_t: Optional[time], end_t: Optional[time]) -> float:
    if start_t is None or end_t is None:
        return 0.0
    from datetime import datetime as dt
    d = dt.combine(date.today(), end_t) - dt.combine(date.today(), start_t)
    return max(0, d.total_seconds() / 3600.0)


class TrainerCalculationRow(BaseModel):
    trainer_id: int
    full_name: str
    is_individual_format: bool  # ведёт ли хотя бы одну группу в индивидуальном формате (для отображения «часы»)
    rate_per_lesson: Optional[float] = None
    rate_per_hour: Optional[float] = None
    lessons_count: int = 0
    hours_count: float = 0.0
    base_payment: float = 0.0
    bonus: float = 0.0
    total_payment: float = 0.0
    already_paid: bool = False


class TrainerRateUpdate(BaseModel):
    rate_per_lesson: Optional[float] = None
    rate_per_hour: Optional[float] = None


class TrainerBonusPayload(BaseModel):
    period: str  # YYYY-MM
    bonus: float


class TrainerPayPayload(BaseModel):
    period: str  # YYYY-MM


@router.get("/owner/calculations/trainers", response_model=List[TrainerCalculationRow])
async def get_calculations_trainers(
    month: str = Query(..., description="Период YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список тренеров для расчётов за месяц: ставки, уроки/часы, оплата, премия, итог. Только owner."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner")
    try:
        year, month_num = int(month[:4]), int(month[5:7])
        period_start = date(year, month_num, 1)
        if month_num == 12:
            period_end = date(year, 12, 31)
        else:
            period_end = date(year, month_num + 1, 1) - timedelta(days=1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month; use YYYY-MM")

    trainers = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .order_by(User.full_name)
        .all()
    )
    if not trainers:
        return []

    trainer_ids = {t.id for t in trainers}
    trainer_lessons, trainer_hours = _compute_trainer_lessons_hours(db, trainer_ids, period_start, period_end)

    bonuses = {
        (b.trainer_id, b.period): b.bonus
        for b in db.query(TrainerPeriodBonus).filter(TrainerPeriodBonus.period == month).all()
    }
    paid_periods = {
        (p.trainer_id, p.period) for p in db.query(TrainerPayout).filter(TrainerPayout.period == month).all()
    }
    trainer_has_individual = {}
    for t in trainers:
        has_ind = (
            db.query(Group)
            .filter(Group.trainer_id == t.id, Group.status == GroupStatus.ACTIVE)
            .filter(Group.lesson_format == "individual")
            .limit(1)
            .first()
            is not None
        )
        trainer_has_individual[t.id] = bool(has_ind)

    result = []
    for t in trainers:
        tid = t.id
        rate_lesson = getattr(t, "trainer_rate", None)
        rate_hour = getattr(t, "trainer_rate_per_hour", None)
        lessons = trainer_lessons.get(tid, 0)
        hours = trainer_hours.get(tid, 0.0)
        is_ind = trainer_has_individual.get(tid, False)
        # Оплата: уроки × ставка_урока + часы × ставка_часа (тренер может вести и группы, и индивид)
        base = (rate_lesson or 0) * lessons + (rate_hour or 0) * hours
        bonus = bonuses.get((tid, month), 0.0)
        total = base + bonus
        result.append(
            TrainerCalculationRow(
                trainer_id=tid,
                full_name=t.full_name or "",
                is_individual_format=is_ind,
                rate_per_lesson=rate_lesson,
                rate_per_hour=rate_hour,
                lessons_count=lessons,
                hours_count=round(hours, 2),
                base_payment=round(base, 2),
                bonus=round(bonus, 2),
                total_payment=round(total, 2),
                already_paid=(tid, month) in paid_periods,
            )
        )
    return result


@router.put("/owner/calculations/trainers/{trainer_id}/rate")
async def update_trainer_rate(
    trainer_id: int,
    payload: TrainerRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Обновить ставку за урок и/или за час у тренера. Только owner."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner")
    user = db.query(User).filter(User.id == trainer_id, User.role == UserRole.TRAINER).first()
    if not user:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if payload.rate_per_lesson is not None:
        user.trainer_rate = payload.rate_per_lesson
    if payload.rate_per_hour is not None:
        user.trainer_rate_per_hour = payload.rate_per_hour
    db.commit()
    return {"ok": True}


@router.post("/owner/calculations/trainers/{trainer_id}/bonus")
async def add_trainer_bonus(
    trainer_id: int,
    payload: TrainerBonusPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Добавить премию тренеру за период. Только owner."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner")
    user = db.query(User).filter(User.id == trainer_id, User.role == UserRole.TRAINER).first()
    if not user:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if len(payload.period) != 7 or payload.period[4] != "-":
        raise HTTPException(status_code=400, detail="period must be YYYY-MM")
    rec = (
        db.query(TrainerPeriodBonus)
        .filter(TrainerPeriodBonus.trainer_id == trainer_id, TrainerPeriodBonus.period == payload.period)
        .first()
    )
    if rec:
        rec.bonus = (rec.bonus or 0) + payload.bonus
    else:
        db.add(
            TrainerPeriodBonus(
                trainer_id=trainer_id,
                period=payload.period,
                bonus=payload.bonus,
            )
        )
    db.commit()
    return {"ok": True}


def _compute_trainer_lessons_hours(
    db: Session,
    trainer_ids: Set[int],
    period_start: date,
    period_end: date,
) -> Tuple[Dict[int, int], Dict[int, float]]:
    """По каждому trainer_id возвращает (lessons_count, hours_count) за период с учётом подмен."""
    attendances = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.lesson_date >= period_start,
            LessonAttendance.lesson_date <= period_end,
        )
        .options(selectinload(LessonAttendance.group))
        .all()
    )
    overrides = (
        db.query(LessonTrainerOverride)
        .filter(
            LessonTrainerOverride.lesson_date >= period_start,
            LessonTrainerOverride.lesson_date <= period_end,
        )
        .all()
    )
    override_map = {
        (o.group_id, o.lesson_date, o.start_time, o.end_time): o.trainer_id
        for o in overrides
    }
    slots_by_trainer: Dict[int, List[Tuple[bool, float]]] = {tid: [] for tid in trainer_ids}
    seen = set()
    for att in attendances:
        group = att.group
        if not group:
            continue
        start_t = getattr(att, "lesson_start_time", None)
        end_t = getattr(att, "lesson_end_time", None)
        key = (att.group_id, att.lesson_date, start_t, end_t)
        if key in seen:
            continue
        seen.add(key)
        fmt = (getattr(group, "lesson_format", None) or "group").strip().lower()
        is_ind = fmt == "individual"
        # Исторический тренер слота:
        # 1) Если в LessonAttendance зафиксирован trainer_id — используем его.
        # 2) Иначе — подмена по LessonTrainerOverride.
        # 3) Фолбэк — текущий trainer_id у группы (для старых данных без trainer_id).
        tid = getattr(att, "trainer_id", None) or override_map.get(key, group.trainer_id)
        if tid not in slots_by_trainer:
            continue
        h = _slot_duration_hours(start_t, end_t) if is_ind else 0.0
        slots_by_trainer[tid].append((is_ind, h))
    trainer_lessons = {tid: sum(1 for is_ind, _ in slots if not is_ind) for tid, slots in slots_by_trainer.items()}
    trainer_hours = {tid: round(sum(h for is_ind, h in slots if is_ind), 2) for tid, slots in slots_by_trainer.items()}
    return trainer_lessons, trainer_hours


@router.post("/owner/calculations/trainers/{trainer_id}/pay")
async def pay_trainer(
    trainer_id: int,
    payload: TrainerPayPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Выплатить тренеру за период: создать табель (TrainerPayout). Только owner."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner")
    user = db.query(User).filter(User.id == trainer_id, User.role == UserRole.TRAINER).first()
    if not user:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if len(payload.period) != 7 or payload.period[4] != "-":
        raise HTTPException(status_code=400, detail="period must be YYYY-MM")
    existing = (
        db.query(TrainerPayout)
        .filter(TrainerPayout.trainer_id == trainer_id, TrainerPayout.period == payload.period)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Период уже выплачен")

    year, month_num = int(payload.period[:4]), int(payload.period[5:7])
    period_start = date(year, month_num, 1)
    period_end = (date(year, month_num + 1, 1) - timedelta(days=1)) if month_num < 12 else date(year, 12, 31)
    trainer_lessons, trainer_hours = _compute_trainer_lessons_hours(db, {trainer_id}, period_start, period_end)
    lessons_count = trainer_lessons.get(trainer_id, 0)
    hours_count = trainer_hours.get(trainer_id, 0.0)
    bonus_rec = (
        db.query(TrainerPeriodBonus)
        .filter(TrainerPeriodBonus.trainer_id == trainer_id, TrainerPeriodBonus.period == payload.period)
        .first()
    )
    bonus = (getattr(bonus_rec, "bonus", None) or 0) if bonus_rec else 0
    rate_lesson = getattr(user, "trainer_rate", None)
    rate_hour = getattr(user, "trainer_rate_per_hour", None)
    # Оплата: уроки × ставка_урока + часы × ставка_часа (тренер может вести и группы, и индивид)
    base_payment = (rate_lesson or 0) * lessons_count + (rate_hour or 0) * hours_count
    total = base_payment + bonus
    db.add(
        TrainerPayout(
            trainer_id=trainer_id,
            period=payload.period,
            lessons_count=lessons_count,
            hours_count=hours_count,
            rate_per_lesson=rate_lesson,
            rate_per_hour=rate_hour,
            base_payment=round(base_payment, 2),
            bonus=round(bonus, 2),
            total=round(total, 2),
        )
    )
    db.commit()
    return {"ok": True}
