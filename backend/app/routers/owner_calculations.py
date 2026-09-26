"""Страница «Расчёты» для owner: тренеры, ставки (в т.ч. по группам), уроки/часы, премии, выплаты."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app import auth
from app.database import get_db
from app.routers.action_log import log_action
from app.models import (
    FinanceArticle,
    FinanceTarget,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
    Group,
    GroupStatus,
    LessonAttendance,
    LessonTrainerOverride,
    TrainerPeriodBonus,
    TrainerPayout,
    User,
    UserRole,
)
from app.schemas.owner_calculations import (
    GroupRateUpdate,
    TrainerBonusPayload,
    TrainerCalculationRow,
    TrainerGroupCalculationRow,
    TrainerPayPayload,
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
    d = datetime.combine(date.today(), end_t) - datetime.combine(date.today(), start_t)
    return max(0, d.total_seconds() / 3600.0)


@router.get("/owner/calculations/trainers", response_model=List[TrainerCalculationRow])
async def get_calculations_trainers(
    month: str = Query(..., description="Период YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.access")),
):
    """Список тренеров для расчётов за месяц: ставки, уроки/часы, оплата, премия, итог. Только owner."""
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
    breakdowns = _compute_trainer_breakdowns(db, trainers, period_start, period_end)

    bonuses = {
        (b.trainer_id, b.period): b.bonus
        for b in db.query(TrainerPeriodBonus).filter(TrainerPeriodBonus.period == month).all()
    }
    paid_periods = {
        (p.trainer_id, p.period) for p in db.query(TrainerPayout).filter(TrainerPayout.period == month).all()
    }

    result = []
    for t in trainers:
        tid = t.id
        b = breakdowns[tid]
        bonus = bonuses.get((tid, month), 0.0)
        total = b.base_payment + bonus
        result.append(
            TrainerCalculationRow(
                trainer_id=tid,
                full_name=t.full_name or "",
                is_individual_format=b.is_individual_format,
                lessons_count=b.lessons_count,
                hours_count=round(b.hours_count, 2),
                base_payment=round(b.base_payment, 2),
                bonus=round(bonus, 2),
                total_payment=round(total, 2),
                already_paid=(tid, month) in paid_periods,
                groups=b.groups,
            )
        )
    return result


@router.put("/owner/calculations/groups/{group_id}/rate")
async def update_group_rate(
    group_id: int,
    payload: GroupRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.manage")),
):
    """Задать ставку за урок/час для конкретной группы. Только owner."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    payload_fields = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    if "rate_per_lesson" in payload_fields:
        group.trainer_rate = payload.rate_per_lesson
    if "rate_per_hour" in payload_fields:
        group.trainer_rate_per_hour = payload.rate_per_hour
    db.commit()
    log_action(
        db,
        current_user.id,
        "update",
        "group_trainer_rate",
        group_id,
        {"rate_per_lesson": group.trainer_rate, "rate_per_hour": group.trainer_rate_per_hour},
    )
    return {"ok": True}


@router.post("/owner/calculations/trainers/{trainer_id}/bonus")
async def add_trainer_bonus(
    trainer_id: int,
    payload: TrainerBonusPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.manage")),
):
    """Добавить премию тренеру за период. Только owner."""
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
    log_action(db, current_user.id, "add_bonus", "trainer_period_bonus", trainer_id, {"period": payload.period, "bonus": payload.bonus})
    return {"ok": True}


class _TrainerBreakdown:
    __slots__ = ("lessons_count", "hours_count", "base_payment", "is_individual_format", "groups")

    def __init__(self) -> None:
        self.lessons_count = 0
        self.hours_count = 0.0
        self.base_payment = 0.0
        self.is_individual_format = False
        self.groups: List[TrainerGroupCalculationRow] = []


def _compute_trainer_breakdowns(
    db: Session,
    trainers: List[User],
    period_start: date,
    period_end: date,
) -> Dict[int, _TrainerBreakdown]:
    """Для каждого тренера — итоги за период и разбивка оплаты по его группам.

    Ставка задаётся на уровне группы (Group.trainer_rate / trainer_rate_per_hour) —
    так разные группы одного тренера могут стоить по-разному. Группа без
    заданной ставки не приносит оплаты (subtotal = 0), пока ставку не укажут.
    """
    trainer_ids = {t.id for t in trainers}

    active_groups = (
        db.query(Group)
        .filter(Group.trainer_id.in_(trainer_ids), Group.status == GroupStatus.ACTIVE)
        .all()
    )
    groups_by_trainer: Dict[int, List[Group]] = {tid: [] for tid in trainer_ids}
    for g in active_groups:
        groups_by_trainer.setdefault(g.trainer_id, []).append(g)

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

    # (trainer_id, group_id) -> список (is_individual, hours) по слотам
    slots: Dict[Tuple[int, int], List[Tuple[bool, float]]] = {}
    group_objects: Dict[int, Group] = {g.id: g for g in active_groups}
    seen = set()
    for att in attendances:
        group = att.group
        if not group:
            continue
        group_objects.setdefault(group.id, group)
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
        if tid not in trainer_ids:
            continue
        h = _slot_duration_hours(start_t, end_t) if is_ind else 0.0
        slots.setdefault((tid, group.id), []).append((is_ind, h))

    result: Dict[int, _TrainerBreakdown] = {}
    for tid in trainer_ids:
        b = _TrainerBreakdown()
        group_ids = {g.id for g in groups_by_trainer.get(tid, [])} | {
            gid for (ttid, gid) in slots.keys() if ttid == tid
        }
        group_rows = []
        for gid in group_ids:
            g = group_objects.get(gid)
            if g is None:
                continue
            group_slots = slots.get((tid, gid), [])
            lessons = sum(1 for is_ind, _ in group_slots if not is_ind)
            hours = round(sum(h for is_ind, h in group_slots if is_ind), 2)
            is_ind_group = (getattr(g, "lesson_format", None) or "group").strip().lower() == "individual"
            rate_lesson = g.trainer_rate
            rate_hour = g.trainer_rate_per_hour
            subtotal = (rate_lesson or 0) * lessons + (rate_hour or 0) * hours
            b.lessons_count += lessons
            b.hours_count += hours
            b.base_payment += subtotal
            if is_ind_group:
                b.is_individual_format = True
            group_rows.append(
                TrainerGroupCalculationRow(
                    group_id=gid,
                    group_name=g.name or "",
                    is_individual_format=is_ind_group,
                    rate_per_lesson=g.trainer_rate,
                    rate_per_hour=g.trainer_rate_per_hour,
                    lessons_count=lessons,
                    hours_count=hours,
                    subtotal=round(subtotal, 2),
                )
            )
        group_rows.sort(key=lambda r: r.group_name)
        b.groups = group_rows
        b.hours_count = round(b.hours_count, 2)
        b.base_payment = round(b.base_payment, 2)
        result[tid] = b
    return result


@router.post("/owner/calculations/trainers/{trainer_id}/pay")
async def pay_trainer(
    trainer_id: int,
    payload: TrainerPayPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.manage")),
):
    """Выплатить тренеру за период: создать табель (TrainerPayout). Только owner."""
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
    breakdown = _compute_trainer_breakdowns(db, [user], period_start, period_end)[trainer_id]
    lessons_count = breakdown.lessons_count
    hours_count = breakdown.hours_count
    bonus_rec = (
        db.query(TrainerPeriodBonus)
        .filter(TrainerPeriodBonus.trainer_id == trainer_id, TrainerPeriodBonus.period == payload.period)
        .first()
    )
    bonus = (getattr(bonus_rec, "bonus", None) or 0) if bonus_rec else 0
    # Оплата считается по факту: сумма subtotal каждой группы тренера по её ставке.
    base_payment = breakdown.base_payment
    total = base_payment + bonus
    db.add(
        TrainerPayout(
            trainer_id=trainer_id,
            period=payload.period,
            lessons_count=lessons_count,
            hours_count=hours_count,
            rate_per_lesson=None,
            rate_per_hour=None,
            base_payment=round(base_payment, 2),
            bonus=round(bonus, 2),
            total=round(total, 2),
        )
    )

    # Создаём запись расхода в финансовом журнале (Академия / Зарплата тренеров)
    if total > 0:
        target = db.query(FinanceTarget).filter(FinanceTarget.code == "academy").first()
        article = (
            db.query(FinanceArticle)
            .filter(FinanceArticle.name == "Зарплата тренеров")
            .first()
        )
        period_label = f"{year}-{month_num:02d}"
        description = f"Выплата тренеру {user.full_name} за {period_label}"
        db.add(
            FinanceTransaction(
                occurred_at=datetime.now(tz=timezone.utc),
                amount=round(total, 2),
                direction=FinanceTransactionDirection.EXPENSE,
                account_id=None,
                to_account_id=None,
                transfer_group_id=None,
                counterparty_name=user.full_name,
                counterparty_phone=None,
                description_raw=description,
                bank_source="manual",
                bank_operation_id=None,
                dedup_hash=None,
                target_id=target.id if target else None,
                article_id=article.id if article else None,
                teacher_id=trainer_id,
                student_id=None,
                group_id=None,
                status=FinanceTransactionStatus.CLASSIFIED,
            )
        )

    db.commit()
    log_action(
        db,
        current_user.id,
        "pay",
        "trainer_payout",
        trainer_id,
        {"period": payload.period, "lessons_count": lessons_count, "hours_count": hours_count, "total": round(total, 2)},
    )
    return {"ok": True}
