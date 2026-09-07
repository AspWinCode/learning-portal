"""Подгрузка дополнительных кастомных ролей пользователя (extra_custom_role_ids)."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Role, User


def load_extra_custom_roles(db: Session, users: Iterable[User]) -> None:
    """Заполнить user._extra_custom_roles объектами Role по extra_custom_role_ids.

    Работает батчем — один запрос на список пользователей.
    """
    users = [u for u in users if u is not None]
    if not users:
        return

    wanted: set[int] = set()
    for user in users:
        for role_id in getattr(user, "extra_custom_role_ids", None) or []:
            wanted.add(int(role_id))

    if not wanted:
        for user in users:
            user._extra_custom_roles = []
        return

    by_id = {r.id: r for r in db.query(Role).filter(Role.id.in_(wanted)).all()}
    for user in users:
        ids = getattr(user, "extra_custom_role_ids", None) or []
        user._extra_custom_roles = [by_id[int(i)] for i in ids if int(i) in by_id]
