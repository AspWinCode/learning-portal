"""Reorder siblings в дереве Codelab (методист, codelab.manage).

Codelab — внешний сервис (https://codelab.tirskix.space), его исходников в
этом репозитории нет: нет ни batch/transactional эндпоинта для позиций, ни
нашей собственной БД для item'ов. Наш PUT /admin/courses/{id}/items/reorder
валидирует siblings по дереву, которое само приходит от Codelab, и шлёт
PUT /admin/items/{id} по одному элементу (best-effort, без настоящего
rollback при обрыве на середине — см. обсуждение в задаче), перед этим
проверяя: один courses (через то, что элементы вообще есть в этом дереве),
один parent_id, ровно полный набор siblings без дублей.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.models import User, UserRole
from app.routers import codelab
from app.schemas.codelab import CodelabItemsReorderIn
from app.services.codelab_client import CodelabError


def _async_result(value):
    async def result(*_args, **_kwargs):
        return value

    return result


def _tree():
    # Занятие Б1 (id=10) с 4 siblings: Материал(51), Черепашка(60), Материал(55), Черепашка(71).
    return [
        {
            "id": 10, "type": "submodule", "title": "Занятие Б1", "parent_id": None, "position": 0,
            "children": [
                {"id": 51, "type": "theory", "title": "Материал", "parent_id": 10, "position": 0, "children": []},
                {"id": 60, "type": "turtle_task", "title": "Черепашка", "parent_id": 10, "position": 1, "children": []},
                {"id": 55, "type": "theory", "title": "Материал 2", "parent_id": 10, "position": 2, "children": []},
                {"id": 71, "type": "turtle_task", "title": "Практика", "parent_id": 10, "position": 3, "children": []},
            ],
        },
        {"id": 90, "type": "submodule", "title": "Занятие Б2", "parent_id": None, "position": 1, "children": []},
    ]


class _FakeDb:
    def commit(self):
        pass


def test_reorder_persists_new_order_and_skips_unchanged_positions(monkeypatch):
    methodist = SimpleNamespace(id=1)
    calls = []

    async def fake_get_tree(*_args, **_kwargs):
        return _tree()

    async def fake_update_item(_user, item_id, payload):
        calls.append((item_id, payload["position"]))
        return {"id": item_id, **payload}

    monkeypatch.setattr(codelab.cl, "get_course_tree", fake_get_tree)
    monkeypatch.setattr(codelab.cl, "update_item", fake_update_item)
    monkeypatch.setattr(codelab, "log_action", lambda *a, **k: None)

    # [51, 60, 55, 71] -> [51, 55, 60, 71]: 55 поднимается, 60 опускается,
    # 51 и 71 остаются на своих позициях (0 и 3) и не должны слать лишний PUT.
    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[51, 55, 60, 71])
    result = asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))

    assert calls == [(55, 1), (60, 2)]
    assert result == _tree()  # get_course_tree re-fetched (второй вызов — тот же fake)


def test_reorder_rejects_different_parent_ids_in_one_batch(monkeypatch):
    methodist = SimpleNamespace(id=1)
    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result(_tree()))

    # 90 принадлежит parent_id=None, а не 10.
    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[51, 60, 55, 90])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))
    assert exc.value.status_code == 400


def test_reorder_rejects_item_from_another_course(monkeypatch):
    methodist = SimpleNamespace(id=1)
    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result(_tree()))

    # 999 не существует в дереве курса 4 (например, относится к другому курсу).
    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[51, 60, 55, 999])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))
    assert exc.value.status_code == 404


def test_reorder_rejects_partial_subset_of_siblings(monkeypatch):
    methodist = SimpleNamespace(id=1)
    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result(_tree()))

    # Пропущен 71 — набор siblings неполный.
    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[51, 60, 55])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))
    assert exc.value.status_code == 400


def test_reorder_rejects_duplicate_item_ids(monkeypatch):
    methodist = SimpleNamespace(id=1)
    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result(_tree()))

    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[51, 51, 60, 55, 71])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))
    assert exc.value.status_code == 400


def test_reorder_surfaces_codelab_error_with_progress_so_far(monkeypatch):
    """Нет batch-эндпоинта у Codelab — PUT шлются по одному; если один из
    них упал на середине, уже применённые изменения не откатываются (нет
    транзакции над внешним сервисом), но ответ называет, что успело
    применится, чтобы frontend мог обновить дерево и показать расхождение."""
    methodist = SimpleNamespace(id=1)

    async def fake_update_item(_user, item_id, payload):
        if item_id == 60:
            raise CodelabError(409, "conflict")
        return {"id": item_id, **payload}

    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result(_tree()))
    monkeypatch.setattr(codelab.cl, "update_item", fake_update_item)
    monkeypatch.setattr(codelab, "log_action", lambda *a, **k: None)

    payload = CodelabItemsReorderIn(parent_id=10, item_ids=[71, 55, 60, 51])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(codelab.admin_reorder_items(4, payload, methodist, _FakeDb()))
    assert exc.value.status_code == 409
    assert exc.value.detail["failed_item_id"] == 60
    assert exc.value.detail["updated_item_ids"] == [71, 55]


def test_user_without_codelab_manage_gets_403_via_http():
    app = FastAPI()
    app.include_router(codelab.router, prefix="/api/v1/codelab")
    trainer = User(role=UserRole.TRAINER, is_active=True)
    app.dependency_overrides[codelab.auth.get_current_active_user] = lambda: trainer
    app.dependency_overrides[codelab.get_db] = lambda: _FakeDb()

    with TestClient(app) as client:
        resp = client.put(
            "/api/v1/codelab/admin/courses/4/items/reorder",
            json={"parent_id": 10, "item_ids": [51, 60, 55, 71]},
        )
    assert resp.status_code == 403
