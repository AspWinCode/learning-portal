"""finance_model: make target_id optional

Revision ID: 0125_finance_model_optional_target
Revises: 0124_finance_template_db
Create Date: 2026-06-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0125_finance_model_optional_target"
down_revision = "0124_finance_template_db"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("finance_models_target_id_fkey", "finance_models", type_="foreignkey")
    op.alter_column("finance_models", "target_id", nullable=True)
    op.create_foreign_key(
        "finance_models_target_id_fkey",
        "finance_models",
        "finance_targets",
        ["target_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("finance_models_target_id_fkey", "finance_models", type_="foreignkey")
    op.alter_column("finance_models", "target_id", nullable=False)
    op.create_foreign_key(
        "finance_models_target_id_fkey",
        "finance_models",
        "finance_targets",
        ["target_id"],
        ["id"],
        ondelete="CASCADE",
    )
