"""student personal discount

Revision ID: 0130_student_personal_discount
Revises: 0129_student_card_tochka_payer_name
Create Date: 2026-06-23
"""

from alembic import op
import sqlalchemy as sa


revision = "0130_student_personal_discount"
down_revision = "0129_student_card_tochka_payer_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    discount_type = sa.Enum("none", "amount", "percent", name="discounttype", create_type=False)
    op.add_column(
        "students",
        sa.Column("discount_type", discount_type, nullable=False, server_default="none"),
    )
    op.add_column(
        "students",
        sa.Column("discount_value", sa.Float(), nullable=False, server_default="0"),
    )

    op.execute(
        """
        UPDATE students AS s
        SET discount_type = a.discount_type,
            discount_value = COALESCE(a.discount_value, 0)
        FROM abonements AS a
        WHERE s.abonement_id = a.id
          AND (a.discount_type <> 'none' OR COALESCE(a.discount_value, 0) <> 0)
        """
    )
    op.execute(
        """
        UPDATE abonements
        SET discount_type = 'none',
            discount_value = 0
        WHERE discount_type <> 'none' OR COALESCE(discount_value, 0) <> 0
        """
    )


def downgrade() -> None:
    op.drop_column("students", "discount_value")
    op.drop_column("students", "discount_type")
