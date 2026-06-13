"""
Интеграционные тесты для режима Game Jam (Фаза 2).

Покрывают:
1. is_game_jam флаг — сохраняется и возвращается в Campaign
2. CampaignEvent.host_b2b_school_id — школа-площадка джема
3. CRUD этапов внутри джема (CampaignEventStage)
4. Добавление/удаление школы в джем (SchoolCampaignEvent в режиме джема)
5. Смена этапа школы внутри джема
6. Удаление этапа джема переносит школы на первый оставшийся
7. Нельзя удалить последний этап джема
8. Список школ джема возвращает stage из внутреннего канбана
"""
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth
from app.database import Base, get_db
from app.main import app
from app.models import B2BSchool, User


# ---------------------------------------------------------------------------
# Fixtures (идентично test_campaign_stages.py)
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = sa.create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session):
    user = _make_owner(db_session)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[auth.get_current_active_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides = {}


def _make_owner(db):
    from app.models import User
    user = User(email="owner@x.com", hashed_password="x", full_name="Owner", role="owner")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_school(db, name="School A", city=None, district=None):
    school = B2BSchool(name=name, city=city, district=district, pipeline_stage="new")
    db.add(school)
    db.commit()
    db.refresh(school)
    return school


def _make_trainer(db, email="trainer@x.com", full_name="Trainer"):
    trainer = User(email=email, hashed_password="x", full_name=full_name, role="trainer")
    db.add(trainer)
    db.commit()
    db.refresh(trainer)
    return trainer


def _make_user(db, email, role, full_name="User"):
    user = User(email=email, hashed_password="x", full_name=full_name, role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_gj_campaign(client):
    """Создаёт кампанию с is_game_jam=True."""
    r = client.post("/api/v1/campaigns", json={
        "name": "GJ Test", "type": "game_jam", "format": "offline", "is_game_jam": True,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _create_event(client, cid, title="Джем #1"):
    r = client.post(f"/api/v1/campaigns/{cid}/events", json={
        "title": title, "event_date": "2026-09-01",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _add_school_to_campaign(client, db, cid, name="School"):
    school = _make_school(db, name)
    r = client.post(f"/api/v1/campaigns/{cid}/school-campaigns/add-schools",
                    json={"school_ids": [school.id], "create_contact_task": False})
    assert r.status_code == 200, r.text
    sc_id = next(s["id"] for s in r.json() if s["b2b_school_id"] == school.id)
    return school.id, sc_id


# ---------------------------------------------------------------------------
# 1. Флаг is_game_jam
# ---------------------------------------------------------------------------

class TestIsGameJamFlag:
    def test_campaign_has_is_game_jam_false_by_default(self, client):
        r = client.post("/api/v1/campaigns", json={
            "name": "Regular", "type": "olympiad", "format": "offline",
        })
        assert r.status_code == 201, r.text
        assert r.json()["is_game_jam"] is False

    def test_campaign_can_be_created_with_is_game_jam_true(self, client):
        data = _create_gj_campaign(client)
        assert data["is_game_jam"] is True

    def test_get_campaign_returns_is_game_jam(self, client):
        cid = _create_gj_campaign(client)["id"]
        r = client.get(f"/api/v1/campaigns/{cid}")
        assert r.status_code == 200
        assert r.json()["is_game_jam"] is True


# ---------------------------------------------------------------------------
# 2. Школа-площадка джема (host_b2b_school_id)
# ---------------------------------------------------------------------------

class TestEventHostSchool:
    def test_event_host_school_null_by_default(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        assert ev["host_b2b_school_id"] is None

    def test_can_set_host_school_on_create(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        school = _make_school(db_session)
        r = client.post(f"/api/v1/campaigns/{cid}/events", json={
            "title": "Хост джем", "event_date": "2026-09-10",
            "host_b2b_school_id": school.id,
        })
        assert r.status_code == 201, r.text
        assert r.json()["host_b2b_school_id"] == school.id

    def test_can_update_host_school(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        school = _make_school(db_session)
        r = client.put(f"/api/v1/campaigns/{cid}/events/{ev['id']}", json={
            "title": ev["title"], "event_date": ev["event_date"],
            "host_b2b_school_id": school.id,
        })
        assert r.status_code == 200, r.text
        assert r.json()["host_b2b_school_id"] == school.id

    def test_event_create_returns_extended_fields(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        trainer = _make_trainer(db_session)
        r = client.post(f"/api/v1/campaigns/{cid}/events", json={
            "title": "Extended jam",
            "description": "Jam description",
            "event_date": "2026-09-10",
            "starts_at": "2026-09-10T10:00:00",
            "ends_at": "2026-09-10T12:00:00",
            "trainer_id": trainer.id,
            "location": "Main address",
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["description"] == "Jam description"
        assert data["starts_at"].startswith("2026-09-10T10:00:00")
        assert data["ends_at"].startswith("2026-09-10T12:00:00")
        assert data["trainer_id"] == trainer.id
        assert data["trainer_full_name"] == trainer.full_name
        assert data["location"] == "Main address"

    def test_event_rejects_non_trainer_user(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        owner = _make_user(db_session, "not-trainer@x.com", "owner", "Not Trainer")
        r = client.post(f"/api/v1/campaigns/{cid}/events", json={
            "title": "Bad trainer",
            "event_date": "2026-09-10",
            "trainer_id": owner.id,
        })
        assert r.status_code == 400


class TestAvailableSchoolFilters:
    def test_available_schools_support_multi_city_and_district_filters(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        school_a = _make_school(db_session, "A", city="City A", district="North")
        school_b = _make_school(db_session, "B", city="City B", district="South")
        _make_school(db_session, "C", city="City C", district="North")
        r = client.get(
            f"/api/v1/campaigns/{cid}/schools-available",
            params={"cities": "City A,City B", "districts": "North,South"},
        )
        assert r.status_code == 200, r.text
        ids = {school["id"] for school in r.json()}
        assert ids == {school_a.id, school_b.id}
        assert all("district" in school for school in r.json())


# ---------------------------------------------------------------------------
# 3. CRUD этапов внутри джема
# ---------------------------------------------------------------------------

class TestJamStageCrud:
    def test_new_event_seeded_with_default_stages(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        r = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages")
        assert r.status_code == 200, r.text
        stages = r.json()
        assert len(stages) > 0
        assert stages[0]["key"] == "registered"

    def test_stages_ordered_by_position(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        stages = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        positions = [s["position"] for s in stages]
        assert positions == sorted(positions)

    def test_create_jam_stage(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        before = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        r = client.post(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages",
                        json={"label": "Финальный раунд"})
        assert r.status_code == 201, r.text
        assert r.json()["label"] == "Финальный раунд"
        after = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        assert len(after) == len(before) + 1

    def test_update_jam_stage_label(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        stage = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()[0]
        r = client.patch(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages/{stage['id']}",
                         json={"label": "Переименован"})
        assert r.status_code == 200, r.text
        assert r.json()["label"] == "Переименован"

    def test_delete_jam_stage_moves_schools_to_first(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        _, sc_id = _add_school_to_campaign(client, db_session, cid)

        stages = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        # Ставим школу на второй этап джема
        second = stages[1]
        client.patch(
            f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools/{sc_id}",
            json={"jam_stage": second["key"]},
        )

        r = client.delete(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages/{second['id']}")
        assert r.status_code == 204, r.text

        remaining = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        assert second["key"] not in [s["key"] for s in remaining]

        # Школа переехала на первый оставшийся
        schools = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools").json()
        sc = next(s for s in schools if s["school_campaign_id"] == sc_id)
        assert sc["jam_stage"] == remaining[0]["key"]

    def test_cannot_delete_last_jam_stage(self, client):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        stages = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        for s in stages[1:]:
            client.delete(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages/{s['id']}")
        last = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()[0]
        r = client.delete(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages/{last['id']}")
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# 4 & 5. Добавление школы в джем и смена jam_stage
# ---------------------------------------------------------------------------

class TestJamSchoolStage:
    def test_add_school_to_event_creates_sce_with_first_stage(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        _, sc_id = _add_school_to_campaign(client, db_session, cid)

        r = client.put(
            f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools/{sc_id}",
            json={},
        )
        assert r.status_code == 200, r.text

        stages = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        schools = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools").json()
        sc = next(s for s in schools if s["school_campaign_id"] == sc_id)
        assert sc["jam_stage"] == stages[0]["key"]

    def test_update_jam_stage_for_school(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        _, sc_id = _add_school_to_campaign(client, db_session, cid)

        stages = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/stages").json()
        second_key = stages[1]["key"]

        r = client.patch(
            f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools/{sc_id}",
            json={"jam_stage": second_key},
        )
        assert r.status_code == 200, r.text
        assert r.json()["jam_stage"] == second_key

    def test_list_event_schools_returns_jam_stage(self, client, db_session):
        cid = _create_gj_campaign(client)["id"]
        ev = _create_event(client, cid)
        _, sc_id = _add_school_to_campaign(client, db_session, cid)
        # Добавляем в джем
        client.put(f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools/{sc_id}", json={})

        schools = client.get(f"/api/v1/campaigns/{cid}/events/{ev['id']}/schools").json()
        sc = next(s for s in schools if s["school_campaign_id"] == sc_id)
        assert "jam_stage" in sc
