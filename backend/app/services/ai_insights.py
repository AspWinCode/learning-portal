from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AbsenceFollowUp, Grade, Lead, LeadStatus, LessonAttendance, Module, Topic
from app.utils.datetime import utcnow


def _as_naive_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _clamp_int(value: float, lower: int = 0, upper: int = 100) -> int:
    return max(lower, min(int(round(value)), upper))


def _lead_stage_from_score(score: int) -> str:
    if score >= 80:
        return "hot"
    if score >= 60:
        return "warm"
    if score >= 40:
        return "cooling"
    return "cold"


def build_lead_ai_insight(lead: Lead, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    current_time = _as_naive_datetime(now) or utcnow()
    status = getattr(lead, "status", None)

    if status == LeadStatus.WON:
        return {
            "score": 100,
            "stage": "hot",
            "best_next_action": "Лид уже успешно конвертирован",
            "reasons": ["Сделка уже закрыта успешно."],
        }
    if status in (LeadStatus.LOST, LeadStatus.REFUSED):
        return {
            "score": 5,
            "stage": "cold",
            "best_next_action": "Лид закрыт, повторно касаться только при новом интересе",
            "reasons": ["Лид уже находится в закрытом статусе."],
        }

    base_scores = {
        LeadStatus.NEW: 78,
        LeadStatus.CONTACTED: 72,
        LeadStatus.NO_ANSWER: 48,
        LeadStatus.DEMO: 68,
        LeadStatus.INVOICE_SENT: 82,
        LeadStatus.THINKING: 58,
        LeadStatus.TRIAL_SCHEDULED: 76,
        LeadStatus.EVENT_REGISTERED: 70,
        LeadStatus.DECIDED_IMMEDIATELY: 92,
    }
    score = float(base_scores.get(status, 55))
    reasons: List[str] = []

    last_touch = _as_naive_datetime(getattr(lead, "last_contact_at", None))
    created_at = _as_naive_datetime(getattr(lead, "created_at", None))
    if last_touch is None:
        last_touch = created_at
        reasons.append("Нет зафиксированного последнего контакта.")

    if last_touch is not None:
        idle_days = max((current_time - last_touch).days, 0)
        if idle_days >= 21:
            score -= 35
            reasons.append(f"Без контакта уже {idle_days} дн.")
        elif idle_days >= 10:
            score -= 20
            reasons.append(f"Контакта не было {idle_days} дн.")
        elif idle_days >= 5:
            score -= 8
            reasons.append(f"Последний контакт был {idle_days} дн. назад.")
        else:
            score += 4
            reasons.append("Контакт был недавно.")

    next_contact_at = _as_naive_datetime(getattr(lead, "next_contact_at", None))
    if next_contact_at is None:
        score -= 10
        reasons.append("Не запланирован следующий шаг.")
    elif next_contact_at < current_time:
        score -= 18
        reasons.append("Следующий шаг просрочен.")
    elif next_contact_at.date() == current_time.date():
        score += 6
        reasons.append("Есть задача связаться сегодня.")
    else:
        score += 3
        reasons.append("Следующий шаг уже стоит в календаре.")

    no_answer_attempt = int(getattr(lead, "no_answer_attempt", 0) or 0)
    if no_answer_attempt >= 3:
        score -= 18
        reasons.append("Три и более безуспешных попыток дозвона.")
    elif no_answer_attempt == 2:
        score -= 10
        reasons.append("Две безуспешные попытки дозвона.")

    if getattr(lead, "questionnaire_filled", False):
        score += 6
        reasons.append("Анкета заполнена, интерес подтверждён.")

    stage = _lead_stage_from_score(_clamp_int(score))
    best_next_action = "Позвонить и подтвердить интерес"
    if next_contact_at is not None and next_contact_at < current_time:
        best_next_action = "Позвонить сегодня и снять просроченный follow-up"
    elif status == LeadStatus.NO_ANSWER:
        best_next_action = "Написать в мессенджер вместо ещё одного холодного звонка"
    elif status == LeadStatus.THINKING:
        best_next_action = "Сделать мягкий follow-up и предложить ближайшее мероприятие"
    elif status == LeadStatus.EVENT_REGISTERED:
        best_next_action = "Подтвердить участие в мероприятии и напомнить дату"
    elif status == LeadStatus.INVOICE_SENT:
        best_next_action = "Напомнить про инвойс и уточнить препятствие к оплате"
    elif status == LeadStatus.TRIAL_SCHEDULED:
        best_next_action = "Подтвердить пробное занятие и напомнить детали"
    elif stage == "cold":
        best_next_action = "Перевести в мягкий re-engagement через мессенджер или событие"

    return {
        "score": _clamp_int(score),
        "stage": stage,
        "best_next_action": best_next_action,
        "reasons": reasons[:4],
    }


def build_student_learning_ai_snapshot(
    db: Session,
    *,
    student_id: int,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    current_day = today or date.today()
    grades_since = datetime.combine(current_day - timedelta(days=90), time.min)
    attendance_since = current_day - timedelta(days=30)

    topic_rows = (
        db.query(
            Topic.name.label("topic_name"),
            Module.name.label("module_name"),
            func.avg(Grade.grade).label("average_grade"),
            func.count(Grade.id).label("grade_count"),
        )
        .join(Topic, Topic.id == Grade.topic_id)
        .join(Module, Module.id == Topic.module_id)
        .filter(Grade.student_id == student_id, Grade.date >= grades_since)
        .group_by(Topic.id, Topic.name, Module.name)
        .all()
    )

    weak_zone: Optional[Dict[str, Any]] = None
    if topic_rows:
        ordered = sorted(
            topic_rows,
            key=lambda row: (float(row.average_grade or 0), -int(row.grade_count or 0), str(row.topic_name or "")),
        )
        weakest = ordered[0]
        if float(weakest.average_grade or 0) <= 4.0:
            weak_zone = {
                "topic_name": str(weakest.topic_name or ""),
                "module_name": str(weakest.module_name or ""),
                "average_grade": round(float(weakest.average_grade or 0), 2),
                "grade_count": int(weakest.grade_count or 0),
                "recommendation": f"Повторить тему «{weakest.topic_name}» и дать 1 дополнительное закрепление.",
            }

    attendance_rows = (
        db.query(LessonAttendance.attended)
        .filter(
            LessonAttendance.student_id == student_id,
            LessonAttendance.lesson_date >= attendance_since,
            LessonAttendance.lesson_date <= current_day,
        )
        .all()
    )
    total_lessons = len(attendance_rows)
    attended_lessons = sum(1 for row in attendance_rows if bool(row[0]))
    missed_lessons = max(total_lessons - attended_lessons, 0)
    attendance_rate = (attended_lessons / total_lessons) if total_lessons else 1.0

    average_grade_recent = (
        db.query(func.avg(Grade.grade))
        .filter(Grade.student_id == student_id, Grade.date >= grades_since)
        .scalar()
    )
    average_grade_recent_value = float(average_grade_recent or 0.0) if average_grade_recent is not None else None

    open_makeups = (
        db.query(AbsenceFollowUp)
        .filter(
            AbsenceFollowUp.student_id == student_id,
            AbsenceFollowUp.stage.in_(("missed", "link_sent", "assigned", "missed_makeup")),
        )
        .count()
    )

    risk_score = 0.0
    reasons: List[str] = []
    if total_lessons >= 3:
        if attendance_rate < 0.6:
            risk_score += 38
            reasons.append(f"Посещаемость за 30 дней упала до {round(attendance_rate * 100)}%.")
        elif attendance_rate < 0.8:
            risk_score += 22
            reasons.append(f"Посещаемость за 30 дней ниже комфортной: {round(attendance_rate * 100)}%.")

    if average_grade_recent_value is not None:
        if average_grade_recent_value < 3.5:
            risk_score += 28
            reasons.append(f"Средняя оценка за 90 дней — {average_grade_recent_value:.2f}.")
        elif average_grade_recent_value < 4.2:
            risk_score += 12
            reasons.append(f"Оценки просели до {average_grade_recent_value:.2f}.")

    if open_makeups >= 2:
        risk_score += 22
        reasons.append(f"Есть {open_makeups} незакрытых пропуска без завершённой отработки.")
    elif open_makeups == 1:
        risk_score += 10
        reasons.append("Есть незавершённая отработка.")

    if missed_lessons >= 3:
        risk_score += 12
        reasons.append(f"За 30 дней пропущено {missed_lessons} занятий.")

    risk_score = _clamp_int(risk_score)
    if risk_score >= 65:
        risk_level = "high"
    elif risk_score >= 35:
        risk_level = "medium"
    else:
        risk_level = "low"

    recommended_action = "Держать обычный ритм наблюдения."
    if open_makeups > 0:
        recommended_action = "Закрыть пропуски и договориться об отработках."
    elif weak_zone is not None:
        recommended_action = weak_zone["recommendation"]
    elif risk_level == "high":
        recommended_action = "Связаться с родителем и обсудить удержание ребёнка в программе."

    return {
        "weak_zone": weak_zone,
        "dropout_risk": {
            "score": risk_score,
            "level": risk_level,
            "reasons": reasons[:4],
            "recommended_action": recommended_action,
        },
    }


def build_owner_ai_insights(summary: Dict[str, Any]) -> List[Dict[str, str]]:
    insights: List[Dict[str, str]] = []

    payments = [float(point.get("value", 0) or 0) for point in summary.get("payments_last_14_days", [])]
    labels = [str(point.get("label", "")) for point in summary.get("payments_last_14_days", [])]
    if len(payments) >= 5:
        latest_value = payments[-1]
        baseline_values = payments[:-1] or [latest_value]
        baseline = sum(baseline_values) / max(len(baseline_values), 1)
        if baseline > 0 and latest_value > baseline * 2.2:
            insights.append(
                {
                    "kind": "cashflow",
                    "severity": "info",
                    "title": "Аномально высокий приток за день",
                    "summary": f"{labels[-1]} дал {latest_value:,.0f} ₽ против обычных {baseline:,.0f} ₽. Проверьте крупные оплаты и их источник.".replace(",", " "),
                }
            )
        elif baseline > 0 and latest_value < baseline * 0.35:
            insights.append(
                {
                    "kind": "cashflow",
                    "severity": "warning",
                    "title": "Просадка cashflow относительно последних дней",
                    "summary": f"{labels[-1]} дал только {latest_value:,.0f} ₽ при среднем фоне {baseline:,.0f} ₽. Имеет смысл проверить просрочки и инвойсы в ожидании.".replace(",", " "),
                }
            )

    new_leads_month = int(summary.get("new_leads_month", 0) or 0)
    won_leads_month = int(summary.get("won_leads_month", 0) or 0)
    if new_leads_month >= 10:
        conversion = won_leads_month / max(new_leads_month, 1)
        if conversion < 0.2:
            insights.append(
                {
                    "kind": "sales",
                    "severity": "warning",
                    "title": "Конверсия лидов выглядит просевшей",
                    "summary": f"За месяц закрыто {won_leads_month} из {new_leads_month} лидов. Стоит проверить follow-up дисциплину и этапы thinking / no_answer.",
                }
            )

    waiting_parent = int(summary.get("makeups_waiting_parent", 0) or 0)
    pending_makeups = int(summary.get("makeups_pending_total", 0) or 0)
    if pending_makeups >= 6 and waiting_parent >= max(3, pending_makeups // 2):
        insights.append(
            {
                "kind": "operations",
                "severity": "info",
                "title": "Узкое место в цепочке отработок",
                "summary": f"{waiting_parent} из {pending_makeups} активных отработок ждут реакции родителя. Полезно усилить напоминания и контроль ответа.",
            }
        )

    if not insights:
        insights.append(
            {
                "kind": "summary",
                "severity": "info",
                "title": "Критичных AI-сигналов не найдено",
                "summary": "По текущим эвристикам явных аномалий в cashflow и операционном потоке не видно.",
            }
        )

    return insights[:3]
