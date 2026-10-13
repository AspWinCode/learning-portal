"""Страница «Расчёты» для owner: тренеры, ставки (в т.ч. по группам), уроки/часы, премии, выплаты."""
import bisect
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
    GroupTrainerRateHistory,
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
    TrainerGroupRateRow,
    TrainerPayPayload,
    TrainerRateRow,
)

router = APIRouter()


def _rate_effective_from(today: date) -> date:
    """Новая ставка действует на весь текущий (ещё не закрытый) месяц, не только
    «с сегодня» — чтобы урок, прошедший ранее в этом же месяце, тоже посчитался
    по новой ставке. Прошлые, уже завершённые месяцы при этом не трогает: для них
    остаётся в силе более ранняя запись истории."""
    return today.replace(day=1)


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


def _month_window(month: str) -> Tuple[date, date]:
    try:
        year, month_num = int(month[:4]), int(month[5:7])
        period_start = date(year, month_num, 1)
        if month_num == 12:
            period_end = date(year, 12, 31)
        else:
            period_end = date(year, month_num + 1, 1) - timedelta(days=1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month; use YYYY-MM")
    return period_start, period_end


def _range_key(period_start: date, period_end: date) -> str:
    month = period_start.strftime("%Y-%m")
    if (period_start, period_end) == _month_window(month):
        return month
    return f"{period_start.isoformat()}_{period_end.isoformat()}"


def _resolve_period(
    *,
    month: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> Tuple[date, date, str]:
    if date_from or date_to:
        if not date_from or not date_to:
            raise HTTPException(status_code=400, detail="date_from and date_to must be provided together")
        if date_from > date_to:
            raise HTTPException(status_code=400, detail="date_from must be before or equal date_to")
        return date_from, date_to, _range_key(date_from, date_to)

    if not month:
        raise HTTPException(status_code=400, detail="month or date_from/date_to is required")
    period_start, period_end = _month_window(month)
    return period_start, period_end, month


@router.get("/owner/calculations/trainers", response_model=List[TrainerCalculationRow])
async def get_calculations_trainers(
    month: Optional[str] = Query(None, description="Период YYYY-MM"),
    date_from: Optional[date] = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: Optional[date] = Query(None, description="Конец периода YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.access")),
):
    """Список тренеров для расчётов за период: ставки, уроки/часы, оплата, премия, итог. Только owner."""
    period_start, period_end, period = _resolve_period(month=month, date_from=date_from, date_to=date_to)

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
        for b in db.query(TrainerPeriodBonus).filter(TrainerPeriodBonus.period == period).all()
    }
    paid_periods = {
        (p.trainer_id, p.period) for p in db.query(TrainerPayout).filter(TrainerPayout.period == period).all()
    }

    result = []
    for t in trainers:
        tid = t.id
        b = breakdowns[tid]
        bonus = bonuses.get((tid, period), 0.0)
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
                already_paid=(tid, period) in paid_periods,
                groups=b.groups,
            )
        )
    return result


@router.get("/owner/calculations/trainer-rates", response_model=List[TrainerRateRow])
async def get_trainer_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.access")),
):
    """Тренеры и ВСЕ их активные группы со ставками — как основные, так и те, где тренер
    когда-либо подменял. Вне привязки к периоду. Для страницы настройки ставок."""
    trainers = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .order_by(User.full_name)
        .all()
    )
    if not trainers:
        return []

    trainer_ids = {t.id for t in trainers}
    active_groups = db.query(Group).filter(Group.status == GroupStatus.ACTIVE).all()
    group_by_id: Dict[int, Group] = {g.id: g for g in active_groups}

    # (trainer_id, group_id) -> является ли тренер основным для этой группы
    pairs: Dict[Tuple[int, int], bool] = {}
    for g in active_groups:
        if g.trainer_id in trainer_ids:
            pairs[(g.trainer_id, g.id)] = True

    att_subs = (
        db.query(LessonAttendance.trainer_id, LessonAttendance.group_id)
        .filter(LessonAttendance.trainer_id.isnot(None))
        .distinct()
        .all()
    )
    override_subs = (
        db.query(LessonTrainerOverride.trainer_id, LessonTrainerOverride.group_id)
        .distinct()
        .all()
    )
    for tid, gid in list(att_subs) + list(override_subs):
        if tid not in trainer_ids:
            continue
        g = group_by_id.get(gid)
        if not g or g.trainer_id == tid:
            continue
        pairs.setdefault((tid, gid), False)

    # Персональные ставки подменяющих тренеров (последняя запись на (group_id, trainer_id)).
    substitute_pairs = [(tid, gid) for (tid, gid), is_primary in pairs.items() if not is_primary]
    substitute_rates: Dict[Tuple[int, int], Tuple[Optional[float], Optional[float]]] = {}
    if substitute_pairs:
        sub_group_ids = {gid for _tid, gid in substitute_pairs}
        sub_trainer_ids = {tid for tid, _gid in substitute_pairs}
        history = (
            db.query(GroupTrainerRateHistory)
            .filter(
                GroupTrainerRateHistory.group_id.in_(sub_group_ids),
                GroupTrainerRateHistory.trainer_id.in_(sub_trainer_ids),
            )
            .order_by(GroupTrainerRateHistory.effective_from, GroupTrainerRateHistory.id)
            .all()
        )
        for h in history:
            substitute_rates[(h.trainer_id, h.group_id)] = (h.rate_per_lesson, h.rate_per_hour)

    groups_by_trainer: Dict[int, List[Tuple[Group, bool]]] = {tid: [] for tid in trainer_ids}
    for (tid, gid), is_primary in pairs.items():
        g = group_by_id.get(gid)
        if g:
            groups_by_trainer[tid].append((g, is_primary))

    result = []
    for t in trainers:
        rows = sorted(groups_by_trainer.get(t.id, []), key=lambda item: (not item[1], item[0].name or ""))
        group_rows = []
        for g, is_primary in rows:
            if is_primary:
                rate_lesson, rate_hour = g.trainer_rate, g.trainer_rate_per_hour
            else:
                rate_lesson, rate_hour = substitute_rates.get((t.id, g.id), (None, None))
            group_rows.append(
                TrainerGroupRateRow(
                    group_id=g.id,
                    group_name=g.name or "",
                    is_individual_format=(getattr(g, "lesson_format", None) or "group").strip().lower() == "individual",
                    is_primary=is_primary,
                    rate_per_lesson=rate_lesson,
                    rate_per_hour=rate_hour,
                )
            )
        result.append(TrainerRateRow(trainer_id=t.id, full_name=t.full_name or "", groups=group_rows))
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
    # Новая ставка действует на весь текущий месяц (и позже), прошлые завершённые
    # месяцы остаются при прежней ставке — смена не меняет их задним числом.
    db.add(
        GroupTrainerRateHistory(
            group_id=group.id,
            rate_per_lesson=group.trainer_rate,
            rate_per_hour=group.trainer_rate_per_hour,
            effective_from=_rate_effective_from(date.today()),
        )
    )
    db.commit()
    db.refresh(group)
    log_action(
        db,
        current_user.id,
        "update",
        "group_trainer_rate",
        group_id,
        {"rate_per_lesson": group.trainer_rate, "rate_per_hour": group.trainer_rate_per_hour},
    )
    return {
        "ok": True,
        "group_id": group.id,
        "rate_per_lesson": group.trainer_rate,
        "rate_per_hour": group.trainer_rate_per_hour,
    }


@router.put("/owner/calculations/groups/{group_id}/trainers/{trainer_id}/rate")
async def update_group_trainer_rate(
    group_id: int,
    trainer_id: int,
    payload: GroupRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.manage")),
):
    """Персональная ставка для тренера, ПОДМЕНЯЮЩЕГО в этой группе — не зависит от
    ставки основного тренера группы и от ставок других подменяющих. Только owner."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    trainer = db.query(User).filter(User.id == trainer_id, User.role == UserRole.TRAINER).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Trainer not found")

    payload_fields = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    last = (
        db.query(GroupTrainerRateHistory)
        .filter(
            GroupTrainerRateHistory.group_id == group_id,
            GroupTrainerRateHistory.trainer_id == trainer_id,
        )
        .order_by(GroupTrainerRateHistory.effective_from.desc(), GroupTrainerRateHistory.id.desc())
        .first()
    )
    rate_per_lesson = last.rate_per_lesson if last else None
    rate_per_hour = last.rate_per_hour if last else None
    if "rate_per_lesson" in payload_fields:
        rate_per_lesson = payload.rate_per_lesson
    if "rate_per_hour" in payload_fields:
        rate_per_hour = payload.rate_per_hour

    # Действует на весь текущий месяц, как и основная ставка — см. _rate_effective_from.
    db.add(
        GroupTrainerRateHistory(
            group_id=group_id,
            trainer_id=trainer_id,
            rate_per_lesson=rate_per_lesson,
            rate_per_hour=rate_per_hour,
            effective_from=_rate_effective_from(date.today()),
        )
    )
    db.commit()
    log_action(
        db,
        current_user.id,
        "update",
        "group_trainer_substitute_rate",
        group_id,
        {"trainer_id": trainer_id, "rate_per_lesson": rate_per_lesson, "rate_per_hour": rate_per_hour},
    )
    return {
        "ok": True,
        "group_id": group_id,
        "trainer_id": trainer_id,
        "rate_per_lesson": rate_per_lesson,
        "rate_per_hour": rate_per_hour,
    }


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
    if not payload.period or len(payload.period) > 32:
        raise HTTPException(status_code=400, detail="period is required")
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


_RateLookup = Dict[Tuple[int, Optional[int]], Tuple[List[date], List[Tuple[Optional[float], Optional[float]]]]]


def _build_rate_lookup(db: Session, group_ids: List[int]) -> _RateLookup:
    """(group_id, trainer_id|None) -> (отсортированные даты вступления в силу, [(rate_per_lesson, rate_per_hour), ...]).

    trainer_id=None — общая ставка группы (основной тренер); конкретный trainer_id —
    персональное переопределение для тренера, подменяющего в этой группе."""
    if not group_ids:
        return {}
    history = (
        db.query(GroupTrainerRateHistory)
        .filter(GroupTrainerRateHistory.group_id.in_(group_ids))
        .order_by(GroupTrainerRateHistory.effective_from, GroupTrainerRateHistory.id)
        .all()
    )
    result: _RateLookup = {}
    for h in history:
        dates, rates = result.setdefault((h.group_id, h.trainer_id), ([], []))
        dates.append(h.effective_from)
        rates.append((h.rate_per_lesson, h.rate_per_hour))
    return result


def _rate_at(
    lookup: _RateLookup,
    group_id: int,
    trainer_id: int,
    lesson_date: date,
    fallback: Tuple[Optional[float], Optional[float]],
) -> Tuple[Optional[float], Optional[float]]:
    """Ставка, действовавшая на дату урока, для конкретного тренера в конкретной группе.

    1) Если у этого тренера когда-либо была персональная ставка для этой группы (он
       подменял и ему выставили отдельную ставку) — берём последнюю запись на дату урока.
    2) Иначе — общая ставка группы (основной тренер) на ту же дату.
    3) Если истории нет вовсе — fallback (текущая ставка группы; покрывает группы,
       созданные до введения истории ставок)."""
    dates, rates = lookup.get((group_id, trainer_id), ([], []))
    if dates:
        idx = bisect.bisect_right(dates, lesson_date) - 1
        if idx >= 0:
            return rates[idx]

    dates, rates = lookup.get((group_id, None), ([], []))
    if not dates:
        return fallback
    idx = bisect.bisect_right(dates, lesson_date) - 1
    if idx < 0:
        return (None, None)
    return rates[idx]


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
    Ставка каждого урока берётся на дату самого урока (GroupTrainerRateHistory),
    поэтому смена ставки сегодня не меняет задним числом прошедшие периоды.
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

    # (trainer_id, group_id) -> список (is_individual, hours, дата_урока) по слотам
    slots: Dict[Tuple[int, int], List[Tuple[bool, float, date]]] = {}
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
        slots.setdefault((tid, group.id), []).append((is_ind, h, att.lesson_date))

    rate_lookup = _build_rate_lookup(db, list(group_objects.keys()))

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
            fallback = (g.trainer_rate, g.trainer_rate_per_hour)
            lessons = 0
            hours = 0.0
            subtotal = 0.0
            for is_ind, h, lesson_date in group_slots:
                rate_lesson, rate_hour = _rate_at(rate_lookup, gid, tid, lesson_date, fallback)
                if is_ind:
                    hours += h
                    subtotal += (rate_hour or 0) * h
                else:
                    lessons += 1
                    subtotal += rate_lesson or 0
            hours = round(hours, 2)
            is_ind_group = (getattr(g, "lesson_format", None) or "group").strip().lower() == "individual"
            b.lessons_count += lessons
            b.hours_count += hours
            b.base_payment += subtotal
            if is_ind_group:
                b.is_individual_format = True
            # Для отображения — та же ставка, что реально применена к этому тренеру в этой
            # группе: его персональная (если когда-либо задавалась), иначе ставка группы.
            own_dates, own_rates = rate_lookup.get((gid, tid), ([], []))
            display_rate_lesson, display_rate_hour = (
                own_rates[-1] if own_dates else (g.trainer_rate, g.trainer_rate_per_hour)
            )
            group_rows.append(
                TrainerGroupCalculationRow(
                    group_id=gid,
                    group_name=g.name or "",
                    is_individual_format=is_ind_group,
                    rate_per_lesson=display_rate_lesson,
                    rate_per_hour=display_rate_hour,
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
        if not payload.date_from or not payload.date_to:
            raise HTTPException(status_code=400, detail="date_from/date_to are required for custom periods")
    period_start, period_end, period = _resolve_period(
        month=payload.period if len(payload.period) == 7 and payload.period[4] == "-" else None,
        date_from=payload.date_from,
        date_to=payload.date_to,
    )
    existing = (
        db.query(TrainerPayout)
        .filter(TrainerPayout.trainer_id == trainer_id, TrainerPayout.period == period)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Период уже выплачен")

    breakdown = _compute_trainer_breakdowns(db, [user], period_start, period_end)[trainer_id]
    lessons_count = breakdown.lessons_count
    hours_count = breakdown.hours_count
    bonus_rec = (
        db.query(TrainerPeriodBonus)
        .filter(TrainerPeriodBonus.trainer_id == trainer_id, TrainerPeriodBonus.period == period)
        .first()
    )
    bonus = (getattr(bonus_rec, "bonus", None) or 0) if bonus_rec else 0
    # Оплата считается по факту: сумма subtotal каждой группы тренера по её ставке.
    base_payment = breakdown.base_payment
    total = base_payment + bonus
    payout = TrainerPayout(
        trainer_id=trainer_id,
        period=period,
        lessons_count=lessons_count,
        hours_count=hours_count,
        rate_per_lesson=None,
        rate_per_hour=None,
        base_payment=round(base_payment, 2),
        bonus=round(bonus, 2),
        total=round(total, 2),
    )
    db.add(payout)

    # Создаём запись расхода в финансовом журнале (Академия / Зарплата тренеров)
    if total > 0:
        target = db.query(FinanceTarget).filter(FinanceTarget.code == "academy").first()
        article = (
            db.query(FinanceArticle)
            .filter(FinanceArticle.name == "Зарплата тренеров")
            .first()
        )
        period_label = period if len(period) == 7 else f"{period_start.isoformat()} - {period_end.isoformat()}"
        description = f"Выплата тренеру {user.full_name} за {period_label}"
        transaction = FinanceTransaction(
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
        db.add(transaction)
        db.flush()
        payout.finance_transaction_id = transaction.id

    db.commit()
    log_action(
        db,
        current_user.id,
        "pay",
        "trainer_payout",
        trainer_id,
        {"period": period, "lessons_count": lessons_count, "hours_count": hours_count, "total": round(total, 2)},
    )
    return {"ok": True}


@router.post("/owner/calculations/trainers/{trainer_id}/cancel-pay")
async def cancel_pay_trainer(
    trainer_id: int,
    payload: TrainerPayPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_calculations.manage")),
):
    """Отменить выплату тренеру за период: удалить табель и связанную финансовую транзакцию. Только owner."""
    user = db.query(User).filter(User.id == trainer_id, User.role == UserRole.TRAINER).first()
    if not user:
        raise HTTPException(status_code=404, detail="Trainer not found")
    if len(payload.period) != 7 or payload.period[4] != "-":
        if not payload.date_from or not payload.date_to:
            raise HTTPException(status_code=400, detail="date_from/date_to are required for custom periods")
    _period_start, _period_end, period = _resolve_period(
        month=payload.period if len(payload.period) == 7 and payload.period[4] == "-" else None,
        date_from=payload.date_from,
        date_to=payload.date_to,
    )

    payout = (
        db.query(TrainerPayout)
        .filter(TrainerPayout.trainer_id == trainer_id, TrainerPayout.period == period)
        .first()
    )
    if not payout:
        raise HTTPException(status_code=404, detail="Выплата за этот период не найдена")

    if payout.finance_transaction_id:
        transaction = (
            db.query(FinanceTransaction)
            .filter(FinanceTransaction.id == payout.finance_transaction_id)
            .first()
        )
        if transaction:
            db.delete(transaction)

    total = payout.total
    db.delete(payout)
    db.commit()
    log_action(
        db,
        current_user.id,
        "cancel_pay",
        "trainer_payout",
        trainer_id,
        {"period": period, "total": total},
    )
    return {"ok": True}
