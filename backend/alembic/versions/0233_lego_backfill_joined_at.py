"""Бэкфилл: для активных членств в LEGO-группах joined_at = дата заполнения
анкеты (start_date ребёнка), а не дата, когда админ добавил его в группу.

Revision ID: 0233
Revises: 0232
Create Date: 2026-10-19
"""
import sqlalchemy as sa
from alembic import op

revision = "0233"
down_revision = "0232"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE lego_group_students AS gs
        SET joined_at = s.start_date
        FROM lego_students AS s
        WHERE gs.lego_student_id = s.id
          AND gs.left_at IS NULL
          AND s.start_date IS NOT NULL
          AND gs.joined_at <> s.start_date
        """
    )


def downgrade() -> None:
    pass
