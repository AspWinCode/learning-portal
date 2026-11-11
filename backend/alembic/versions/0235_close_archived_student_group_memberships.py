"""Close active group memberships for archived students.

Revision ID: 0235
Revises: 0234
"""

from alembic import op


revision = "0235"
down_revision = "0234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE group_students AS gs
        SET left_at = COALESCE(s.archived_at, NOW())
        FROM students AS s
        WHERE gs.student_id = s.id
          AND gs.left_at IS NULL
          AND s.status = 'archived'
        """
    )


def downgrade() -> None:
    # Нельзя безопасно восстановить исходные даты членства после backfill.
    pass
