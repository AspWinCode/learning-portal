"""Add student_cards table (личные карточки ученика)

Revision ID: 0019_student_cards
Revises: 0018_sales_instruction_images
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0019_student_cards"
down_revision = "0018_sales_instruction_images"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_cards"):
        op.create_table(
            "student_cards",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_full_name", sa.String(), nullable=False),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("student_phone", sa.String(), nullable=True),
            sa.Column("telegram", sa.String(), nullable=True),
            sa.Column("gender", sa.String(), nullable=True),
            sa.Column("on_grant", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("format_type", sa.String(), nullable=True),
            sa.Column("city", sa.String(), nullable=True),
            sa.Column("school", sa.String(), nullable=True),
            sa.Column("grade", sa.String(), nullable=True),
            sa.Column("parent_full_name", sa.String(), nullable=True),
            sa.Column("parent_phone", sa.String(), nullable=True),
            sa.Column("parent_phone_2", sa.String(), nullable=True),
            sa.Column("abonement_id", sa.Integer(), sa.ForeignKey("abonements.id"), nullable=True),
            sa.Column("discount_type", sa.Enum("none", "amount", "percent", name="discounttype", create_type=False), nullable=False, server_default="none"),
            sa.Column("discount_value", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_student_cards_student_full_name", "student_cards", ["student_full_name"])
        op.create_index("ix_student_cards_archived", "student_cards", ["archived"])
        op.create_index("ix_student_cards_abonement_id", "student_cards", ["abonement_id"])


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "student_cards"):
        op.drop_index("ix_student_cards_abonement_id", table_name="student_cards")
        op.drop_index("ix_student_cards_archived", table_name="student_cards")
        op.drop_index("ix_student_cards_student_full_name", table_name="student_cards")
        op.drop_table("student_cards")
