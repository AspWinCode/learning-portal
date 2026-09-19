"""0189: срок действия персональной скидки ученика (разовая скидка)

Добавляет students.discount_valid_until и student_cards.discount_valid_until
(зеркало, синхронизируется вместе со скидкой ученика). Если поле пустое —
скидка постоянная (текущее поведение). Если задана дата — скидка перестаёт
применяться в расчётах после этой даты, а фоновая задача
expire_student_discounts обнуляет саму скидку на следующий день.

Revision ID: 0189
Revises: 0188
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0189"
down_revision = "0188"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("discount_valid_until", sa.Date(), nullable=True))
    op.add_column("student_cards", sa.Column("discount_valid_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("student_cards", "discount_valid_until")
    op.drop_column("students", "discount_valid_until")
