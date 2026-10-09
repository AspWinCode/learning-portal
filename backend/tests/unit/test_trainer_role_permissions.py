"""TRAINER role rework: лок permission-матрицы, чтобы её нельзя было случайно
расширить обратно до прежнего (projects/owner_workspace/lessons.manage).

Чистые unit-тесты на has_permission() — без БД, как test_custom_roles_foundation.py.
"""
from app import auth
from app.models import User, UserRole


def _user(role: UserRole) -> User:
    return User(role=role, is_active=True)


def test_trainer_lost_projects_and_owner_workspace_and_lessons_manage() -> None:
    trainer = _user(UserRole.TRAINER)
    for permission in (
        "projects.access",
        "owner_workspace.access",
        "lessons.manage",
        "lessons.manual_create",
        "lessons.schedule_manage",
        "lessons.reassign_trainer",
        "lessons.override",
        "disk.manage",
        "disk.manage_access",
    ):
        assert not auth.has_permission(trainer, permission), f"TRAINER must not have {permission}"


def test_trainer_keeps_working_functions() -> None:
    trainer = _user(UserRole.TRAINER)
    for permission in (
        "lessons.access",
        "lessons.mark_attendance",
        "lessons.manage_roster",
        "grades.access",
        "grades.manage",
        "characteristics.access",
        "characteristics.manage",
        "groups.access",
        "students.access",
        "trainer_cockpit.access",
        "disk.access",
        "submissions.access",
        "submissions.review",
        "codelab.access",
        "pixelforge.access",
        "technolab.access",
    ):
        assert auth.has_permission(trainer, permission), f"TRAINER must keep {permission}"


def test_manual_lesson_create_granted_to_owner_admin_methodist_manager_sales_not_trainer() -> None:
    for role in (UserRole.OWNER, UserRole.ADMIN, UserRole.METHODIST, UserRole.MANAGER, UserRole.SALES):
        assert auth.has_permission(_user(role), "lessons.manual_create"), f"{role.value} must have lessons.manual_create"
    assert not auth.has_permission(_user(UserRole.TRAINER), "lessons.manual_create")


def test_disk_default_deny_except_owner_admin() -> None:
    for role in (UserRole.OWNER, UserRole.ADMIN):
        u = _user(role)
        assert auth.has_permission(u, "disk.manage")
        assert auth.has_permission(u, "disk.manage_access")
    for role in (UserRole.TRAINER, UserRole.SALES, UserRole.METHODIST, UserRole.MANAGER, UserRole.PARENT):
        u = _user(role)
        assert not auth.has_permission(u, "disk.manage"), f"{role.value} must not bypass Disk ACL"
        assert not auth.has_permission(u, "disk.manage_access"), f"{role.value} must not manage Disk ACL"
