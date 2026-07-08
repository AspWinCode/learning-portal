"""
Интеграционный тест: применение обновлённого шаблона финансовой модели к уже
созданной модели (POST /finance/models/{id}/sync-template).

Материализация шаблона в статьи/метрики происходит только один раз — при
создании модели. Если шаблон потом отредактировали (например, добавили новые
статьи расходов), у существующих моделей они сами не появляются — это баг,
о котором сообщил пользователь ("завёл в шаблон новые расходы, но не могу их
нигде применить"). Тест проверяет починку: ручной sync добавляет только
недостающие статьи/метрики и не дублирует уже существующие при повторном вызове.

Использует in-memory SQLite и реальную логику роутера (не моки).
"""
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
import pytest

from app import auth
from app.database import Base, get_db
from app.main import app


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
    from app.models import User

    owner = User(email="owner@example.com", hashed_password="x", full_name="Owner", role="owner")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[auth.get_current_active_user] = lambda: owner
    yield TestClient(app)
    app.dependency_overrides = {}


def _create_template(client, key="lesovik", articles=None, metrics=None):
    resp = client.post(
        "/api/v1/finance/model-templates",
        json={
            "key": key,
            "name": "Лесовик",
            "articles": articles or [],
            "metrics": metrics or [],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_model(client, template_key):
    resp = client.post(
        "/api/v1/finance/models",
        json={
            "name": "Лесовик модель",
            "template_key": template_key,
            "target_code": "lesovik_target",
            "target_name": "Лесовик",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _article_codes(client, target_id):
    resp = client.get("/api/v1/finance/articles", params={"target_id": target_id, "only_active": False})
    assert resp.status_code == 200, resp.text
    return {a["code"] for a in resp.json()}


class TestSyncTemplate:
    def test_new_template_articles_are_added_to_existing_model(self, client):
        _create_template(
            client,
            articles=[{"code": "rent", "name": "Аренда", "direction": "expense"}],
        )
        model = _create_model(client, "lesovik")
        target_id = model["target_id"]
        assert _article_codes(client, target_id) == {"rent"}

        # Пользователь добавил в шаблон новую статью расходов уже после создания модели.
        template_resp = client.get("/api/v1/finance/model-templates")
        template_id = next(t["id"] for t in template_resp.json() if t["key"] == "lesovik")
        patch_resp = client.patch(
            f"/api/v1/finance/model-templates/{template_id}",
            json={
                "articles": [
                    {"code": "rent", "name": "Аренда", "direction": "expense"},
                    {"code": "internet", "name": "Интернет", "direction": "expense"},
                ],
            },
        )
        assert patch_resp.status_code == 200, patch_resp.text

        # Без sync-template новая статья не появляется сама по себе.
        assert _article_codes(client, target_id) == {"rent"}

        sync_resp = client.post(f"/api/v1/finance/models/{model['id']}/sync-template")
        assert sync_resp.status_code == 200, sync_resp.text
        assert sync_resp.json() == {"created_articles": 1, "created_metrics": 0}
        assert _article_codes(client, target_id) == {"rent", "internet"}

    def test_sync_is_idempotent_and_does_not_duplicate(self, client):
        _create_template(
            client,
            articles=[
                {"code": "rent", "name": "Аренда", "direction": "expense"},
                {"code": "internet", "name": "Интернет", "direction": "expense"},
            ],
            metrics=[{"name": "Маржа", "formula": "SUM(revenue)", "unit": "%"}],
        )
        model = _create_model(client, "lesovik")
        target_id = model["target_id"]

        first = client.post(f"/api/v1/finance/models/{model['id']}/sync-template")
        assert first.json() == {"created_articles": 0, "created_metrics": 0}

        second = client.post(f"/api/v1/finance/models/{model['id']}/sync-template")
        assert second.json() == {"created_articles": 0, "created_metrics": 0}
        assert _article_codes(client, target_id) == {"rent", "internet"}

    def test_sync_without_target_returns_400(self, client):
        resp = client.post(
            "/api/v1/finance/models",
            json={"name": "Без проекта", "template_key": "blank"},
        )
        assert resp.status_code == 201, resp.text
        model = resp.json()
        assert model["target_id"] is None

        sync_resp = client.post(f"/api/v1/finance/models/{model['id']}/sync-template")
        assert sync_resp.status_code == 400
