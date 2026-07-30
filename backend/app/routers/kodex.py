import json
import os
import time
import urllib.parse
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import KodexCase, User
from app.routers.action_log import log_action
from app.schemas.kodex import (
    KodexCaseCreate,
    KodexCaseResponse,
    KodexCaseSummary,
    KodexCaseUpdate,
)

router = APIRouter()

# ─── External Kodex proxy ────────────────────────────────────────────────────

KODEX_EXTERNAL_BASE = os.getenv("KODEX_BASE_URL", "https://kodex.tirskix.space")

_cases_cache: Optional[tuple[float, list]] = None


def _invalidate_cases_cache() -> None:
    global _cases_cache
    _cases_cache = None


def _to_portal(c: dict, meta: Optional[dict] = None, *, is_seed: bool = True) -> dict:
    return {
        "slug": c.get("id", ""),
        "num": c.get("num"),
        "title": c.get("title", ""),
        "curator": c.get("curator"),
        "rank": c.get("rank", 1),
        "difficulty": c.get("difficulty", 1),
        "reward_credits": c.get("rewardCredits", 0),
        "reward_rep": c.get("rewardRep", 0),
        "anno": c.get("anno"),
        "playable": c.get("playable", False),
        "goal": c.get("goal"),
        "suspects": c.get("suspects"),
        "task": c.get("task"),
        "fn_name": c.get("fnName"),
        "starter": c.get("starter"),
        "briefing": c.get("briefing", []),
        "materials": c.get("materials", []),
        "evidence": c.get("evidence", []),
        "hints": c.get("hints", {}),
        "versions": c.get("versions", []),
        "finale": c.get("finale", []),
        "status": (meta or {}).get("status"),
        "is_override": meta is not None,
        "is_seed": is_seed,
    }


def _to_external(payload: dict) -> dict:
    result = dict(payload)
    if "slug" in result:
        result["id"] = result.pop("slug")
    if "reward_credits" in result:
        result["rewardCredits"] = result.pop("reward_credits")
    if "reward_rep" in result:
        result["rewardRep"] = result.pop("reward_rep")
    if "fn_name" in result:
        result["fnName"] = result.pop("fn_name")
    for f in ("is_override", "is_seed", "status"):
        result.pop(f, None)
    return result


async def _fetch_merged_cases() -> list:
    global _cases_cache
    now = time.monotonic()
    if _cases_cache and (now - _cases_cache[0]) < 60:
        return list(_cases_cache[1])

    async with httpx.AsyncClient(timeout=15) as client:
        data_js_res = await client.get(f"{KODEX_EXTERNAL_BASE}/packages/game-data/data.js?v=1")
        data_js_res.raise_for_status()
        content = data_js_res.text
        idx = content.find("const CASES = ")
        if idx < 0:
            raise ValueError("CASES array not found in data.js")
        start = content.index("[", idx)
        seed_cases, _ = json.JSONDecoder().raw_decode(content, start)

        overrides_res = await client.get(f"{KODEX_EXTERNAL_BASE}/api/content?all=1")
        store = overrides_res.json() if overrides_res.is_success else {"cases": {}, "meta": {}}

    seed_ids = {c["id"] for c in seed_cases}
    cases_map: dict = {c["id"]: dict(c) for c in seed_cases}
    override_cases = store.get("cases", {})
    meta = store.get("meta", {})

    for case_id, override in override_cases.items():
        if case_id in cases_map:
            cases_map[case_id].update(override)
        else:
            cases_map[case_id] = {"id": case_id, **override}

    result = [
        _to_portal(c, meta.get(c["id"]), is_seed=(c["id"] in seed_ids))
        for c in cases_map.values()
    ]
    _cases_cache = (now, result)
    return result


@router.get("/external")
async def list_external_cases(
    current_user: User = Depends(auth.require_permission("kodex.access")),
) -> list:
    try:
        return await _fetch_merged_cases()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Не удалось загрузить дела из Кодэкс: {e}")


@router.get("/external/{slug}")
async def get_external_case(
    slug: str,
    current_user: User = Depends(auth.require_permission("kodex.access")),
) -> dict:
    try:
        cases = await _fetch_merged_cases()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    case = next((c for c in cases if c["slug"] == slug), None)
    if not case:
        raise HTTPException(status_code=404, detail="Дело не найдено")
    return case


@router.put("/external/{slug}")
async def upsert_external_case(
    slug: str,
    body: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("kodex.manage")),
) -> dict:
    external = _to_external({**body, "slug": slug})
    author = urllib.parse.quote(current_user.full_name or "Методист")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.put(
            f"{KODEX_EXTERNAL_BASE}/api/content/{urllib.parse.quote(slug, safe='')}",
            json=external,
            headers={"Content-Type": "application/json", "X-Studio-Author": author},
        )

    if res.status_code == 409:
        raise HTTPException(status_code=409, detail=res.json())
    if not res.is_success:
        err_body: dict = {}
        try:
            err_body = res.json()
        except Exception:
            pass
        raise HTTPException(
            status_code=res.status_code if res.status_code < 500 else 502,
            detail=err_body or {"error": f"HTTP {res.status_code}"},
        )

    _invalidate_cases_cache()
    return {**body, "slug": slug, "is_override": True, "is_seed": body.get("is_seed", True)}


@router.delete("/external/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_external_case(
    slug: str,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.delete(
            f"{KODEX_EXTERNAL_BASE}/api/content/{urllib.parse.quote(slug, safe='')}"
        )
    if res.status_code not in (200, 204, 404):
        raise HTTPException(status_code=res.status_code, detail="Ошибка сброса дела")
    _invalidate_cases_cache()

VALID_STATUSES = {"draft", "in_review", "approved", "changes_requested"}


def _get_case_or_404(db: Session, case_id: int) -> KodexCase:
    case = db.query(KodexCase).filter(KodexCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Дело не найдено")
    return case


@router.get("/", response_model=List[KodexCaseSummary])
async def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.access")),
):
    return db.query(KodexCase).order_by(KodexCase.created_at.desc()).all()


@router.post("/", response_model=KodexCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: KodexCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    existing = db.query(KodexCase).filter(KodexCase.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Дело с таким идентификатором уже существует")

    case = KodexCase(
        **payload.model_dump(),
        created_by_id=current_user.id,
        status="draft",
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    log_action(db, current_user.id, "create", "kodex_case", case.id, {"slug": case.slug, "title": case.title})
    return case


@router.get("/{case_id}", response_model=KodexCaseResponse)
async def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.access")),
):
    return _get_case_or_404(db, case_id)


@router.put("/{case_id}", response_model=KodexCaseResponse)
async def update_case(
    case_id: int,
    payload: KodexCaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    case = _get_case_or_404(db, case_id)

    update_data = payload.model_dump(exclude_unset=True)

    if "slug" in update_data and update_data["slug"] != case.slug:
        conflict = db.query(KodexCase).filter(KodexCase.slug == update_data["slug"]).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Дело с таким идентификатором уже существует")

    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {', '.join(VALID_STATUSES)}")

    for field, value in update_data.items():
        setattr(case, field, value)

    db.commit()
    db.refresh(case)
    log_action(db, current_user.id, "update", "kodex_case", case.id, update_data)
    return case


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    case = _get_case_or_404(db, case_id)
    db.delete(case)
    db.commit()
    log_action(db, current_user.id, "delete", "kodex_case", case_id, {"slug": case.slug})
