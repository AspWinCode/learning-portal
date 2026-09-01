"""Проактивность консультанта (§5 этап 5 концепции).

Набор детерминированных генераторов подсказок по данным модуля academy_ai:
устаревший аудит, новые материалы без разбора, пробелы в базе знаний, пустая
библиотека экспертизы, непроиндексированные чанки, зависшие черновики.

Подсказки складываются в academy_insights с дедупом по dedup_key среди открытых.
Когда условие подсказки перестаёт выполняться — открытая подсказка
авто-закрывается (status=resolved). Отклонённые пользователем (dismissed) не
трогаем.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AcademyAuditSession,
    AcademyContentDraft,
    AcademyExpertiseSource,
    AcademyInsight,
    AcademyKbEntry,
)
from app.services.academy_ai import retrieval

_SECTIONS = {
    "niche": "ниша и продукты",
    "finance": "финансы",
    "marketing": "маркетинг",
    "sales": "продажи",
    "clients": "клиенты и удержание",
    "team": "команда",
}

# Подсказки этих видов авто-закрываются, когда условие ушло.
_AUTO_RESOLVABLE = {
    "audit_stale",
    "audit_from_new_material",
    "kb_gap",
    "expertise_empty",
    "embeddings_pending",
    "drafts_waiting",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Генераторы: возвращают список (dedup_key, kind, severity, title, body, meta) ──

def _candidate(dedup_key, kind, severity, title, body, meta=None):
    return {
        "dedup_key": dedup_key,
        "kind": kind,
        "severity": severity,
        "title": title,
        "body": body,
        "meta": meta or {},
    }


def _gen_audit_stale(db: Session) -> List[Dict[str, Any]]:
    last = (
        db.query(AcademyAuditSession)
        .filter(AcademyAuditSession.status == "completed")
        .order_by(AcademyAuditSession.completed_at.desc().nullslast())
        .first()
    )
    if last is None:
        return [
            _candidate(
                "audit_stale",
                "audit_stale",
                "warn",
                "Аудит бизнеса ещё не проходили",
                "Пройдите структурированный аудит — консультант начнёт опираться на реальные факты академии.",
            )
        ]
    completed = last.completed_at
    if completed and (_now() - completed) > timedelta(days=90):
        days = (_now() - completed).days
        return [
            _candidate(
                "audit_stale",
                "audit_stale",
                "info",
                "Пора обновить аудит",
                f"Последний аудит был {days} дней назад. Рекомендуется повторять раз в квартал.",
                {"days_since": days},
            )
        ]
    return []


def _gen_new_material(db: Session) -> List[Dict[str, Any]]:
    week_ago = _now() - timedelta(days=7)
    new_media = (
        db.query(func.count(AcademyKbEntry.id))
        .filter(
            AcademyKbEntry.is_active.is_(True),
            AcademyKbEntry.kind.in_(("media", "document")),
            AcademyKbEntry.created_at >= week_ago,
        )
        .scalar()
        or 0
    )
    recent_audit = (
        db.query(func.count(AcademyAuditSession.id))
        .filter(AcademyAuditSession.started_at >= week_ago)
        .scalar()
        or 0
    )
    if new_media >= 1 and recent_audit == 0:
        return [
            _candidate(
                "audit_from_new_material",
                "audit_from_new_material",
                "info",
                "Загружены новые материалы — расскажите о них",
                f"За неделю добавлено материалов: {new_media}. Дозаполните аудит по ним, чтобы консультант учитывал контекст.",
                {"new_materials": int(new_media)},
            )
        ]
    return []


def _gen_kb_gaps(db: Session) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for section, label in _SECTIONS.items():
        count = (
            db.query(func.count(AcademyKbEntry.id))
            .filter(AcademyKbEntry.is_active.is_(True), AcademyKbEntry.section == section)
            .scalar()
            or 0
        )
        if count == 0:
            out.append(
                _candidate(
                    f"kb_gap:{section}",
                    "kb_gap",
                    "info",
                    f"Пустой раздел базы знаний: {label}",
                    f"По разделу «{label}» нет ни одной записи. Добавьте факты или пройдите аудит по этому разделу.",
                    {"section": section},
                )
            )
    return out


def _gen_expertise_empty(db: Session) -> List[Dict[str, Any]]:
    active = (
        db.query(func.count(AcademyExpertiseSource.id))
        .filter(AcademyExpertiseSource.status == "active")
        .scalar()
        or 0
    )
    if active == 0:
        return [
            _candidate(
                "expertise_empty",
                "expertise_empty",
                "info",
                "Библиотека экспертизы пуста",
                "Загрузите хотя бы один источник (книга/методичка) — консультант станет давать более обоснованные советы.",
            )
        ]
    return []


def _gen_embeddings_pending(db: Session) -> List[Dict[str, Any]]:
    pending = retrieval.pending_embeddings(db)
    if pending > 20:
        return [
            _candidate(
                "embeddings_pending",
                "embeddings_pending",
                "info",
                "Не проиндексировано для смыслового поиска",
                f"{pending} фрагментов без эмбеддингов. Запустите переиндексацию (POST /search/reindex).",
                {"pending": int(pending)},
            )
        ]
    return []


def _gen_drafts_waiting(db: Session) -> List[Dict[str, Any]]:
    week_ago = _now() - timedelta(days=7)
    stale = (
        db.query(func.count(AcademyContentDraft.id))
        .filter(AcademyContentDraft.status == "draft", AcademyContentDraft.created_at < week_ago)
        .scalar()
        or 0
    )
    if stale >= 3:
        return [
            _candidate(
                "drafts_waiting",
                "drafts_waiting",
                "warn",
                "Черновики контента ждут проверки",
                f"{stale} черновиков старше недели в статусе draft. Просмотрите очередь и опубликуйте или отклоните.",
                {"stale_drafts": int(stale)},
            )
        ]
    return []


_GENERATORS = (
    _gen_audit_stale,
    _gen_new_material,
    _gen_kb_gaps,
    _gen_expertise_empty,
    _gen_embeddings_pending,
    _gen_drafts_waiting,
)


# ─── Скан ──────────────────────────────────────────────────────────────────

def scan(db: Session) -> Dict[str, Any]:
    candidates: List[Dict[str, Any]] = []
    for generator in _GENERATORS:
        try:
            candidates.extend(generator(db))
        except Exception:  # noqa: BLE001 — один сбойный генератор не ломает скан
            continue

    current_keys = {c["dedup_key"] for c in candidates}
    open_insights = db.query(AcademyInsight).filter(AcademyInsight.status == "open").all()
    open_by_key = {ins.dedup_key: ins for ins in open_insights}

    created: List[str] = []
    for cand in candidates:
        if cand["dedup_key"] in open_by_key:
            continue
        db.add(
            AcademyInsight(
                kind=cand["kind"],
                dedup_key=cand["dedup_key"],
                severity=cand["severity"],
                title=cand["title"],
                body=cand["body"],
                meta=cand["meta"],
                status="open",
            )
        )
        created.append(cand["dedup_key"])

    resolved: List[str] = []
    for ins in open_insights:
        if ins.kind in _AUTO_RESOLVABLE and ins.dedup_key not in current_keys:
            ins.status = "resolved"
            ins.resolved_at = _now()
            resolved.append(ins.dedup_key)

    db.commit()
    return {"created": created, "resolved": resolved, "open_after": len(current_keys)}
