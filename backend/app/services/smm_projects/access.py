"""Project-level доступ в SMM-проектах.

smm_projects.access — обычное module-право. Какие конкретно проекты видит
пользователь — решает SmmProjectAccess: если для проекта нет ни одной строки
доступа, он открыт любому с smm_projects.access (owner не оказывается сам
заблокирован сразу после создания проекта); если строки есть — нужен явный
матч по user_id или по роли."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app import auth
from app.models import SmmProject, SmmProjectAccess, User


def _user_roles(user: User) -> Iterable[str]:
    roles = {getattr(user, "role", None)}
    roles.update(getattr(user, "extra_roles", None) or [])
    return {r for r in roles if r}


def can_access_project(db: Session, user: User, project: SmmProject) -> bool:
    if not auth.has_permission(user, "smm_projects.access"):
        return False

    rows = db.query(SmmProjectAccess).filter(SmmProjectAccess.project_id == project.id).all()
    if not rows:
        return True

    user_roles = _user_roles(user)
    for row in rows:
        if row.user_id and row.user_id == user.id:
            return True
        if row.role and row.role in user_roles:
            return True
    return False


def ensure_project_access(db: Session, user: User, project: SmmProject) -> None:
    from fastapi import HTTPException, status

    if not can_access_project(db, user, project):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
