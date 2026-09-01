"""Смысловой поиск по базе знаний академии и библиотеке экспертизы.

Три режима, выбираются автоматически по возможностям БД:
  1. ``vector`` — pgvector: эмбеддинги чанков + косинусная близость (``<=>``).
  2. ``fts``    — Postgres full-text search по generated-колонке ``search_tsv``
     (конфигурация ``russian``), ранжирование ``ts_rank``.
  3. ``ilike``  — грубый фолбэк по подстроке.

Всё через raw SQL — модуль не требует python-пакета pgvector: вектор пишется/
читается строковым литералом ``[..]`` с ``CAST(:q AS vector)``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import ai_gateway

# scope -> (таблица чанков, колонка-ссылка, join к родителю с фильтром «активно», колонка заголовка)
_SCOPES: Dict[str, Dict[str, str]] = {
    "kb": {
        "table": "academy_kb_chunks",
        "ref": "entry_id",
        "join": "JOIN academy_kb_entries p ON p.id = c.entry_id AND p.is_active",
        "title": "p.title",
    },
    "expertise": {
        "table": "academy_expertise_chunks",
        "ref": "source_id",
        "join": "JOIN academy_expertise_sources p ON p.id = c.source_id AND p.status = 'active'",
        "title": "p.title",
    },
}

_DEFAULT_SCOPES = ("kb", "expertise")

_caps: Optional[Dict[str, bool]] = None


@dataclass
class Hit:
    scope: str
    chunk_id: int
    ref_id: int
    title: str
    text: str
    score: float
    method: str


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def capabilities(db: Session, *, refresh: bool = False) -> Dict[str, bool]:
    global _caps
    if _caps is not None and not refresh:
        return _caps
    caps = {"pgvector": False, "fts": False}
    try:
        caps["pgvector"] = bool(db.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).first())
    except Exception:  # noqa: BLE001
        pass
    try:
        caps["fts"] = bool(
            db.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'academy_kb_chunks' AND column_name = 'search_tsv'"
                )
            ).first()
        )
    except Exception:  # noqa: BLE001
        pass
    _caps = caps
    return caps


def search_backend(db: Session) -> str:
    caps = capabilities(db)
    if caps["pgvector"]:
        return "vector"
    if caps["fts"]:
        return "fts"
    return "ilike"


def pending_embeddings(db: Session) -> int:
    if not capabilities(db)["pgvector"]:
        return 0
    total = 0
    for meta in _SCOPES.values():
        try:
            total += int(
                db.execute(text(f"SELECT count(*) FROM {meta['table']} WHERE embedding IS NULL")).scalar() or 0
            )
        except Exception:  # noqa: BLE001
            pass
    return total


async def index_pending(
    db: Session, *, scope: Optional[str] = None, batch: int = 100, user_id: Optional[int] = None
) -> Dict[str, object]:
    """Считает эмбеддинги для чанков без вектора. Возвращает сколько проиндексировано."""
    if not capabilities(db)["pgvector"]:
        return {"indexed": 0, "backend": search_backend(db), "reason": "pgvector unavailable"}

    scopes = [scope] if scope in _SCOPES else list(_SCOPES)
    indexed = 0
    for sc in scopes:
        table = _SCOPES[sc]["table"]
        rows = db.execute(
            text(f"SELECT id, text FROM {table} WHERE embedding IS NULL ORDER BY id LIMIT :lim"),
            {"lim": batch},
        ).all()
        if not rows:
            continue
        result = await ai_gateway.embed(
            feature="academy_retrieval_index", inputs=[r[1] for r in rows], user_id=user_id
        )
        if not result.ok or not result.data or len(result.data) != len(rows):
            continue
        for (chunk_id, _), vector in zip(rows, result.data):
            db.execute(
                text(f"UPDATE {table} SET embedding = CAST(:v AS vector) WHERE id = :id"),
                {"v": _vec_literal(vector), "id": chunk_id},
            )
        db.commit()
        indexed += len(rows)
    return {"indexed": indexed, "backend": "vector"}


async def search(
    db: Session,
    query: str,
    *,
    scopes=_DEFAULT_SCOPES,
    k: int = 8,
    user_id: Optional[int] = None,
) -> List[Hit]:
    q = (query or "").strip()
    if not q:
        return []

    caps = capabilities(db)
    qvec: Optional[str] = None
    if caps["pgvector"]:
        emb = await ai_gateway.embed(feature="academy_retrieval_query", inputs=[q], user_id=user_id)
        if emb.ok and emb.data:
            qvec = _vec_literal(emb.data[0])

    hits: List[Hit] = []
    for sc in scopes:
        meta = _SCOPES.get(sc)
        if not meta:
            continue
        table, ref, join, title = meta["table"], meta["ref"], meta["join"], meta["title"]

        if qvec is not None:
            sql = text(
                f"SELECT c.id, c.{ref}, {title}, c.text, "
                f"1 - (c.embedding <=> CAST(:q AS vector)) AS score "
                f"FROM {table} c {join} "
                f"WHERE c.embedding IS NOT NULL "
                f"ORDER BY c.embedding <=> CAST(:q AS vector) LIMIT :k"
            )
            rows = db.execute(sql, {"q": qvec, "k": k}).all()
            method = "vector"
        elif caps["fts"]:
            sql = text(
                f"SELECT c.id, c.{ref}, {title}, c.text, "
                f"ts_rank(c.search_tsv, plainto_tsquery('russian', :q)) AS score "
                f"FROM {table} c {join} "
                f"WHERE c.search_tsv @@ plainto_tsquery('russian', :q) "
                f"ORDER BY score DESC LIMIT :k"
            )
            rows = db.execute(sql, {"q": q, "k": k}).all()
            method = "fts"
        else:
            sql = text(
                f"SELECT c.id, c.{ref}, {title}, c.text, 0.0 AS score "
                f"FROM {table} c {join} WHERE c.text ILIKE :like LIMIT :k"
            )
            rows = db.execute(sql, {"like": f"%{q}%", "k": k}).all()
            method = "ilike"

        for chunk_id, ref_id, ttl, txt, score in rows:
            hits.append(
                Hit(
                    scope=sc,
                    chunk_id=int(chunk_id),
                    ref_id=int(ref_id),
                    title=str(ttl or ""),
                    text=str(txt or ""),
                    score=float(score or 0.0),
                    method=method,
                )
            )

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]
