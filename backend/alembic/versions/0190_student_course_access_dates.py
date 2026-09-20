"""0190: даты назначения курса витрины (MGR-002)

Добавляет student_course_access.starts_at/deadline_at/closes_at —
информационные поля даты начала/дедлайна/закрытия доступа при выдаче курса
(в т.ч. массовом, см. POST /admin/access/bulk). Не проверяются автоматически
никаким шедулером — используются для отчётов и ручного контроля менеджера.

Revision ID: 0190
Revises: 0189
Create Date: 2026-09-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0190"
down_revision = "0189"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("student_course_access", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("student_course_access", sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("student_course_access", sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("student_course_access", "closes_at")
    op.drop_column("student_course_access", "deadline_at")
    op.drop_column("student_course_access", "starts_at")
