"""0185: normalize legacy admin_tools.manage permission in custom roles

admin_tools.manage was split into admin_tools.reset_trainer_password and
admin_tools.reset_any_password (commit 9b088c9). Custom roles created via the UI
could still carry the old key in their permissions JSON, which broke GET /roles/
(ResponseValidationError: Unknown permission: admin_tools.manage).

Revision ID: 0185
Revises: 0184
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "0185"
down_revision = "0184"
branch_labels = None
depends_on = None


OLD_KEY = "admin_tools.manage"
NEW_KEYS = ["admin_tools.reset_trainer_password", "admin_tools.reset_any_password"]

roles_table = sa.table(
    "roles",
    sa.column("id", sa.Integer),
    sa.column("permissions", sa.JSON),
)


def _normalize(perms):
    if not isinstance(perms, list):
        return None
    if OLD_KEY not in perms:
        return None
    result = []
    for perm in perms:
        candidates = NEW_KEYS if perm == OLD_KEY else [perm]
        for candidate in candidates:
            if candidate not in result:
                result.append(candidate)
    return result


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.select(roles_table.c.id, roles_table.c.permissions)).fetchall()
    for row in rows:
        updated = _normalize(row.permissions)
        if updated is not None:
            conn.execute(
                roles_table.update().where(roles_table.c.id == row.id).values(permissions=updated)
            )


def downgrade() -> None:
    # Не откатываем: обратное преобразование потеряло бы разделение прав.
    pass
