"""Disk ACL security regression tests (default-deny, grant covers subtree).

Работают против реальной БД (DATABASE_URL), как test_smart_tables_paste_and_sheets.py:
создаём owner/trainer напрямую через ORM, ходим реальным HTTP через TestClient,
чтобы прогнать настоящий auth/permission dependency-граф, а не замоканный.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import _is_db_configured

pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")


def _get_session():
    from app.database import SessionLocal
    return SessionLocal()


@pytest.fixture
def db():
    session = _get_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def owner_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_disk_owner_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(db.get(User, user.id))
    db.commit()


@pytest.fixture
def trainer_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_disk_trainer_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Trainer",
        role=UserRole.TRAINER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(db.get(User, user.id))
    db.commit()


def _write_storage_file(storage_key: str, content: bytes = b"%PDF-test") -> None:
    from app.routers.disk import DISK_STORAGE_ROOT

    DISK_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    (DISK_STORAGE_ROOT / storage_key).write_bytes(content)


@pytest.fixture
def disk_tree(db, owner_user):
    """folder_a (root, с файлом внутри) и folder_b (root, sibling, с файлом
    внутри) — ровно та форма, которую описывает чек-лист #27 из ТЗ."""
    from app.models import DiskItem

    folder_a = DiskItem(name="Materials A", item_type="folder", owner_id=owner_user.id)
    folder_b = DiskItem(name="Materials B", item_type="folder", owner_id=owner_user.id)
    db.add_all([folder_a, folder_b])
    db.flush()

    key_a = f"test-{uuid.uuid4().hex}"
    key_b = f"test-{uuid.uuid4().hex}"
    file_a = DiskItem(
        name="lesson1.pdf", item_type="file", parent_id=folder_a.id,
        storage_key=key_a, content_type="application/pdf",
        size_bytes=10, owner_id=owner_user.id,
    )
    file_b = DiskItem(
        name="secret.pdf", item_type="file", parent_id=folder_b.id,
        storage_key=key_b, content_type="application/pdf",
        size_bytes=10, owner_id=owner_user.id,
    )
    db.add_all([file_a, file_b])
    db.commit()
    for item in (folder_a, folder_b, file_a, file_b):
        db.refresh(item)
    _write_storage_file(key_a)
    _write_storage_file(key_b)
    yield {"folder_a": folder_a, "folder_b": folder_b, "file_a": file_a, "file_b": file_b}

    from app.models import DiskItem as _DiskItem
    # Удаляем всё, что создал этот owner (включая вложенные папки, которые
    # отдельные тесты добавляют поверх фикстуры, напр. "Python" внутри A) —
    # DiskFolderAccess уходит каскадом по ondelete="CASCADE" на folder_id.
    db.query(_DiskItem).filter(_DiskItem.owner_id == owner_user.id).delete(synchronize_session=False)
    db.commit()


def _client_for(user):
    from app import auth
    from app.main import app

    client = TestClient(app)
    token = auth.create_access_token({"sub": user.email})
    return client, {"Authorization": f"Bearer {token}"}


class TestDiskDefaultDeny:
    def test_trainer_without_acl_sees_nothing_at_root(self, db, trainer_user, disk_tree):
        client, headers = _client_for(trainer_user)
        r = client.get("/api/v1/disk/items", headers=headers)
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_owner_sees_everything_at_root(self, db, owner_user, disk_tree):
        client, headers = _client_for(owner_user)
        r = client.get("/api/v1/disk/items", headers=headers)
        assert r.status_code == 200
        names = {item["name"] for item in r.json()["items"]}
        assert {"Materials A", "Materials B"}.issubset(names)

    def test_trainer_download_known_file_id_without_grant_is_blocked(self, db, trainer_user, disk_tree):
        client, headers = _client_for(trainer_user)
        file_b = disk_tree["file_b"]
        r = client.get(f"/api/v1/disk/files/{file_b.id}/download", headers=headers)
        assert r.status_code in (403, 404)

    def test_trainer_cannot_create_folder(self, db, trainer_user):
        client, headers = _client_for(trainer_user)
        r = client.post("/api/v1/disk/folders", json={"name": "Hack"}, headers=headers)
        assert r.status_code == 403

    def test_trainer_cannot_delete_item(self, db, trainer_user, disk_tree):
        client, headers = _client_for(trainer_user)
        r = client.delete(f"/api/v1/disk/items/{disk_tree['folder_a'].id}", headers=headers)
        assert r.status_code == 403

    def test_trainer_cannot_rename_item(self, db, trainer_user, disk_tree):
        client, headers = _client_for(trainer_user)
        r = client.patch(
            f"/api/v1/disk/items/{disk_tree['folder_a'].id}", json={"name": "Renamed"}, headers=headers,
        )
        assert r.status_code == 403

    def test_trainer_cannot_manage_access(self, db, trainer_user, disk_tree):
        client, headers = _client_for(trainer_user)
        r = client.get(f"/api/v1/disk/items/{disk_tree['folder_a'].id}/access", headers=headers)
        assert r.status_code == 403
        r2 = client.post(
            f"/api/v1/disk/items/{disk_tree['folder_a'].id}/access",
            json={"role": "trainer"}, headers=headers,
        )
        assert r2.status_code == 403


class TestDiskGrantedAccess:
    def test_trainer_with_grant_sees_folder_a_and_descendant_not_sibling(self, db, owner_user, trainer_user, disk_tree):
        from app.models import DiskFolderAccess

        grant = DiskFolderAccess(folder_id=disk_tree["folder_a"].id, user_id=trainer_user.id, created_by_id=owner_user.id)
        db.add(grant)
        db.commit()

        client, headers = _client_for(trainer_user)

        r_root = client.get("/api/v1/disk/items", headers=headers)
        assert r_root.status_code == 200
        root_names = {item["name"] for item in r_root.json()["items"]}
        assert root_names == {"Materials A"}  # sibling "Materials B" invisible

        r_inside = client.get("/api/v1/disk/items", params={"parent_id": disk_tree["folder_a"].id}, headers=headers)
        assert r_inside.status_code == 200
        assert {item["name"] for item in r_inside.json()["items"]} == {"lesson1.pdf"}

        r_sibling = client.get("/api/v1/disk/items", params={"parent_id": disk_tree["folder_b"].id}, headers=headers)
        assert r_sibling.status_code == 404

        r_download_own = client.get(f"/api/v1/disk/files/{disk_tree['file_a'].id}/download", headers=headers)
        assert r_download_own.status_code == 200

        r_download_sibling = client.get(f"/api/v1/disk/files/{disk_tree['file_b'].id}/download", headers=headers)
        assert r_download_sibling.status_code in (403, 404)

    def test_search_does_not_leak_sibling_folder_names(self, db, owner_user, trainer_user, disk_tree):
        from app.models import DiskFolderAccess

        db.add(DiskFolderAccess(folder_id=disk_tree["folder_a"].id, user_id=trainer_user.id, created_by_id=owner_user.id))
        db.commit()

        client, headers = _client_for(trainer_user)
        r = client.get("/api/v1/disk/items", params={"search": "pdf"}, headers=headers)
        assert r.status_code == 200
        names = {item["name"] for item in r.json()["items"]}
        assert "lesson1.pdf" in names
        assert "secret.pdf" not in names

    def test_breadcrumbs_do_not_leak_ancestor_above_grant(self, db, owner_user, trainer_user, disk_tree):
        from app.models import DiskFolderAccess, DiskItem

        nested = DiskItem(name="Python", item_type="folder", parent_id=disk_tree["folder_a"].id, owner_id=owner_user.id)
        db.add(nested)
        db.commit()
        db.refresh(nested)

        # Грант на nested-папку напрямую, НЕ на folder_a — folder_a не должен
        # всплыть в breadcrumbs, иначе утечка названия закрытой папки.
        db.add(DiskFolderAccess(folder_id=nested.id, user_id=trainer_user.id, created_by_id=owner_user.id))
        db.commit()

        client, headers = _client_for(trainer_user)
        r = client.get("/api/v1/disk/items", params={"parent_id": nested.id}, headers=headers)
        assert r.status_code == 200
        breadcrumb_names = {b["name"] for b in r.json()["breadcrumbs"]}
        assert "Materials A" not in breadcrumb_names
        assert "Python" in breadcrumb_names

    def test_owner_grant_and_revoke_access(self, db, owner_user, trainer_user, disk_tree):
        owner_client, owner_headers = _client_for(owner_user)

        r_grant = owner_client.post(
            f"/api/v1/disk/items/{disk_tree['folder_a'].id}/access",
            json={"user_id": trainer_user.id}, headers=owner_headers,
        )
        assert r_grant.status_code == 201
        access_id = r_grant.json()["id"]

        trainer_client, trainer_headers = _client_for(trainer_user)
        r_sees = trainer_client.get("/api/v1/disk/items", headers=trainer_headers)
        assert {item["name"] for item in r_sees.json()["items"]} == {"Materials A"}

        r_revoke = owner_client.delete(f"/api/v1/disk/access/{access_id}", headers=owner_headers)
        assert r_revoke.status_code == 204

        r_sees_after = trainer_client.get("/api/v1/disk/items", headers=trainer_headers)
        assert r_sees_after.json()["items"] == []

    def test_role_based_grant_covers_every_trainer(self, db, owner_user, trainer_user, disk_tree):
        from app.models import DiskFolderAccess

        db.add(DiskFolderAccess(folder_id=disk_tree["folder_a"].id, role="trainer", created_by_id=owner_user.id))
        db.commit()

        client, headers = _client_for(trainer_user)
        r = client.get("/api/v1/disk/items", headers=headers)
        assert {item["name"] for item in r.json()["items"]} == {"Materials A"}
