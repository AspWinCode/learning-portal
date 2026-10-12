"""Regression coverage for group rate persistence in owner calculations."""

import uuid
from datetime import date

import pytest

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


def _make_user(db, role, prefix):
    from app.models import User

    user = User(
        email=f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name=f"Test {prefix}",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_group_rate_put_round_trips_through_calculations_reload(db):
    from app.models import ActionLog, Group, GroupStatus, UserRole
    from app.routers.owner_calculations import get_calculations_trainers, update_group_rate
    from app.schemas.owner_calculations import GroupRateUpdate

    owner = _make_user(db, UserRole.OWNER, "calculation_rates_owner")
    trainer = _make_user(db, UserRole.TRAINER, "calculation_rates_trainer")
    group = Group(
        name=f"Calculation Rate Group {uuid.uuid4().hex[:6]}",
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        lesson_format="group",
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    async def current_rate():
        rows = await get_calculations_trainers(
            month="2026-10",
            date_from=None,
            date_to=None,
            db=db,
            current_user=owner,
        )
        row = next(row for row in rows if row.trainer_id == trainer.id)
        return next(group_row for group_row in row.groups if group_row.group_id == group.id).rate_per_lesson

    try:
        await update_group_rate(group.id, GroupRateUpdate(rate_per_lesson=1000), db=db, current_user=owner)
        assert await current_rate() == 1000

        await update_group_rate(group.id, GroupRateUpdate(rate_per_lesson=1200), db=db, current_user=owner)
        assert await current_rate() == 1200

        await update_group_rate(group.id, GroupRateUpdate(rate_per_lesson=None), db=db, current_user=owner)
        assert await current_rate() is None
    finally:
        db.query(ActionLog).filter(ActionLog.entity_type == "group_trainer_rate", ActionLog.entity_id == group.id).delete(
            synchronize_session=False
        )
        db.query(Group).filter(Group.id == group.id).delete(synchronize_session=False)
        db.query(ActionLog).filter(ActionLog.user_id.in_([owner.id, trainer.id])).delete(synchronize_session=False)
        db.delete(db.get(type(owner), owner.id))
        db.delete(db.get(type(trainer), trainer.id))
        db.commit()
