"""0188: доп. поля профиля ученика (для карточки и Excel-импорта)

Добавляет на students поля, ранее существовавшие только в удалённой анкете
(StudentCard): дата рождения, контакты ученика и второго родителя, пол,
формат, город/школа/класс, комментарий, источник. Telegram-поля заменены
единым флагом has_max (есть ли MAX-мессенджер у родителя).

Revision ID: 0188
Revises: 0187
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0188"
down_revision = "0187"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("students", sa.Column("phone", sa.String(32), nullable=True))
    op.add_column("students", sa.Column("email", sa.String(), nullable=True))
    op.add_column("students", sa.Column("gender", sa.String(8), nullable=True))
    op.add_column(
        "students",
        sa.Column("on_grant", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("students", sa.Column("format_type", sa.String(16), nullable=True))
    op.add_column("students", sa.Column("city", sa.String(64), nullable=True))
    op.add_column("students", sa.Column("school", sa.String(255), nullable=True))
    op.add_column("students", sa.Column("grade", sa.String(16), nullable=True))
    op.add_column("students", sa.Column("parent_phone_2", sa.String(32), nullable=True))
    op.add_column(
        "students",
        sa.Column("has_max", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("students", sa.Column("preferred_messenger", sa.String(16), nullable=True))
    op.add_column("students", sa.Column("comment", sa.Text(), nullable=True))
    op.add_column("students", sa.Column("source", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("students", "source")
    op.drop_column("students", "comment")
    op.drop_column("students", "preferred_messenger")
    op.drop_column("students", "has_max")
    op.drop_column("students", "parent_phone_2")
    op.drop_column("students", "grade")
    op.drop_column("students", "school")
    op.drop_column("students", "city")
    op.drop_column("students", "format_type")
    op.drop_column("students", "on_grant")
    op.drop_column("students", "gender")
    op.drop_column("students", "email")
    op.drop_column("students", "phone")
    op.drop_column("students", "birth_date")
