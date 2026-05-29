import pytest

from app import database


class FakeSession:
    def __init__(self):
        self.commit_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0

    def commit(self):
        self.commit_calls += 1

    def rollback(self):
        self.rollback_calls += 1

    def close(self):
        self.close_calls += 1


def test_get_db_rolls_back_on_exception(monkeypatch):
    fake = FakeSession()
    monkeypatch.setattr(database, "SessionLocal", lambda: fake)

    gen = database.get_db()
    assert next(gen) is fake

    with pytest.raises(RuntimeError):
        gen.throw(RuntimeError("boom"))

    assert fake.rollback_calls == 1
    assert fake.close_calls == 1


def test_get_db_closes_without_rollback_on_success(monkeypatch):
    fake = FakeSession()
    monkeypatch.setattr(database, "SessionLocal", lambda: fake)

    gen = database.get_db()
    assert next(gen) is fake
    gen.close()

    assert fake.rollback_calls == 0
    assert fake.close_calls == 1


def test_db_transaction_commits_on_success():
    fake = FakeSession()

    with database.db_transaction(fake):
        pass

    assert fake.commit_calls == 1
    assert fake.rollback_calls == 0


def test_db_transaction_rolls_back_on_failure():
    fake = FakeSession()

    with pytest.raises(ValueError):
        with database.db_transaction(fake):
            raise ValueError("fail")

    assert fake.commit_calls == 0
    assert fake.rollback_calls == 1
