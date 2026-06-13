"""
Интеграционные тесты для произвольных этапов кампании (Фаза 1).

Покрывают:
1. При создании кампании засеваются дефолтные этапы (по типу).
2. CRUD этапов: список (по порядку), создание (slug + в конец), переименование.
3. Переупорядочивание этапов.
4. Удаление этапа переносит школы на первый оставшийся этап.
5. Нельзя удалить последний этап.

Тесты используют in-memory SQLite и реальную логику роутера (не моки).
"""
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app import auth
from app.database import Base, get_db
from app.main import app
from app.models import B2BSchool, SchoolCampaign
from app.routers import campaigns as campaigns_router


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = sa.create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session):
    owner = auth_user_owner(db_session)

    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[auth.get_current_active_user] = lambda: owner
    yield TestClient(app)
    app.dependency_overrides = {}


def auth_user_owner(db):
    from app.models import User

    user = User(
        email="owner@example.com",
        hashed_password="x",
        full_name="Owner",
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_campaign(client, type_="game_jam"):
    resp = client.post(
        "/api/v1/campaigns",
        json={"name": "Тест", "type": type_, "format": "offline", "status": "active"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _stage_keys(client, cid):
    resp = client.get(f"/api/v1/campaigns/{cid}/stages")
    assert resp.status_code == 200, resp.text
    return [s["key"] for s in resp.json()]


# ---------------------------------------------------------------------------
# Чистая функция: набор этапов по типу
# ---------------------------------------------------------------------------

class TestDefaultStages:
    def test_game_jam_default_set(self):
        stages = campaigns_router.default_stages_for_type("game_jam")
        keys = [s["key"] for s in stages]
        assert keys[0] == "not_contacted"
        assert "leads_received" in keys
        assert len(keys) == len(set(keys))  # уникальные ключи

    def test_olympiad_falls_back_to_game_jam(self):
        assert campaigns_router.default_stages_for_type(
            "olympiad"
        ) == campaigns_router.default_stages_for_type("game_jam")

    def test_online_event_has_its_own_set(self):
        keys = [s["key"] for s in campaigns_router.default_stages_for_type("online_event")]
        assert "invited" in keys
        assert "agreed_to_class_visits" not in keys


# ---------------------------------------------------------------------------
# Засев этапов при создании кампании
# ---------------------------------------------------------------------------

class TestSeedingOnCreate:
    def test_create_seeds_game_jam_stages(self, client):
        cid = _create_campaign(client, "game_jam")
        keys = _stage_keys(client, cid)
        assert keys == [s["key"] for s in campaigns_router.default_stages_for_type("game_jam")]

    def test_create_seeds_online_stages(self, client):
        cid = _create_campaign(client, "online_event")
        keys = _stage_keys(client, cid)
        assert keys == [s["key"] for s in campaigns_router.default_stages_for_type("online_event")]

    def test_stages_returned_ordered_by_position(self, client):
        cid = _create_campaign(client, "game_jam")
        resp = client.get(f"/api/v1/campaigns/{cid}/stages")
        positions = [s["position"] for s in resp.json()]
        assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# CRUD этапов
# ---------------------------------------------------------------------------

class TestStageCrud:
    def test_create_stage_appends_at_end(self, client):
        cid = _create_campaign(client, "game_jam")
        before = _stage_keys(client, cid)
        resp = client.post(f"/api/v1/campaigns/{cid}/stages", json={"label": "Extra step"})
        assert resp.status_code == 201, resp.text
        created = resp.json()
        assert created["label"] == "Extra step"
        assert created["key"] == "extra_step"
        after = _stage_keys(client, cid)
        assert after[-1] == "extra_step"
        assert len(after) == len(before) + 1

    def test_create_stage_cyrillic_label_still_creates(self, client):
        cid = _create_campaign(client, "game_jam")
        resp = client.post(f"/api/v1/campaigns/{cid}/stages", json={"label": "Новый этап"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["label"] == "Новый этап"
        assert resp.json()["key"]  # непустой ключ-фолбэк

    def test_update_stage_label(self, client):
        cid = _create_campaign(client, "game_jam")
        stages = client.get(f"/api/v1/campaigns/{cid}/stages").json()
        sid = stages[0]["id"]
        resp = client.patch(
            f"/api/v1/campaigns/{cid}/stages/{sid}", json={"label": "Переименовано"}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["label"] == "Переименовано"

    def test_reorder_stages(self, client):
        cid = _create_campaign(client, "game_jam")
        stages = client.get(f"/api/v1/campaigns/{cid}/stages").json()
        reversed_ids = [s["id"] for s in reversed(stages)]
        resp = client.post(
            f"/api/v1/campaigns/{cid}/stages/reorder", json={"ordered_ids": reversed_ids}
        )
        assert resp.status_code == 200, resp.text
        new_ids = [s["id"] for s in client.get(f"/api/v1/campaigns/{cid}/stages").json()]
        assert new_ids == reversed_ids


# ---------------------------------------------------------------------------
# Удаление этапа
# ---------------------------------------------------------------------------

class TestStageDelete:
    def _add_school_at_stage(self, db, cid, stage_key):
        school = B2BSchool(name="Школа", pipeline_stage="new")
        db.add(school)
        db.commit()
        db.refresh(school)
        sc = SchoolCampaign(b2b_school_id=school.id, campaign_id=cid, stage=stage_key)
        db.add(sc)
        db.commit()
        db.refresh(sc)
        return sc

    def test_delete_stage_moves_schools_to_first_remaining(self, client, db_session):
        cid = _create_campaign(client, "game_jam")
        stages = client.get(f"/api/v1/campaigns/{cid}/stages").json()
        # школа на втором этапе
        second = stages[1]
        sc = self._add_school_at_stage(db_session, cid, second["key"])

        resp = client.delete(f"/api/v1/campaigns/{cid}/stages/{second['id']}")
        assert resp.status_code == 204, resp.text

        remaining = _stage_keys(client, cid)
        assert second["key"] not in remaining
        db_session.refresh(sc)
        assert sc.stage == remaining[0]  # перенесена на первый оставшийся

    def test_cannot_delete_last_stage(self, client):
        cid = _create_campaign(client, "online_event")
        stages = client.get(f"/api/v1/campaigns/{cid}/stages").json()
        # удаляем все, кроме одного
        for s in stages[1:]:
            assert client.delete(f"/api/v1/campaigns/{cid}/stages/{s['id']}").status_code == 204
        last = client.get(f"/api/v1/campaigns/{cid}/stages").json()[0]
        resp = client.delete(f"/api/v1/campaigns/{cid}/stages/{last['id']}")
        assert resp.status_code == 400
