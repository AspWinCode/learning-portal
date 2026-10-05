"""Workspace-level доступ в AI Studio.

ai_studio.access — обычное module-право (кто угодно с ним может открыть сам
AI Studio). Какие конкретно направления видит пользователь — решает отдельно
AiWorkspaceAccess: если для направления нет ни одной строки доступа, оно
открыто любому с ai_studio.access (чтобы owner не оказался сам заблокирован
сразу после создания направления); если строки есть — нужен явный матч по
user_id или по роли (базовой или дополнительной).

Направление "academy" не участвует в этой проверке вообще — вход в него
по-прежнему регулируется легаси-правом academy_ai.access на самой странице,
AI Studio тут ничего не меняет.
"""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app import auth
from app.models import AiWorkspace, AiWorkspaceAccess, User


def _user_roles(user: User) -> Iterable[str]:
    roles = {getattr(user, "role", None)}
    roles.update(getattr(user, "extra_roles", None) or [])
    return {r for r in roles if r}


def can_access_workspace(db: Session, user: User, workspace: AiWorkspace) -> bool:
    if workspace.code == "academy":
        # Легаси-направление: вход регулируется исключительно academy_ai.access,
        # как и раньше — AI Studio ничего не меняет и не требует ai_studio.access
        # у тех, кто и так имеет доступ к существующему модулю Академии.
        return auth.has_permission(user, "academy_ai.access")

    if not auth.has_permission(user, "ai_studio.access"):
        return False

    rows = db.query(AiWorkspaceAccess).filter(AiWorkspaceAccess.workspace_id == workspace.id).all()
    if not rows:
        return True

    user_roles = _user_roles(user)
    for row in rows:
        if row.user_id and row.user_id == user.id:
            return True
        if row.role and row.role in user_roles:
            return True
    return False


def ensure_workspace_access(db: Session, user: User, workspace: AiWorkspace) -> None:
    from fastapi import HTTPException, status

    if not can_access_workspace(db, user, workspace):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
