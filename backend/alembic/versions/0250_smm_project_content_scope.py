"""Make SMM project content-source boundaries explicit.

Revision ID: 0250
Revises: 0249
"""
import sqlalchemy as sa
from alembic import op

revision = "0250"
down_revision = "0249"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "smm_projects",
        sa.Column(
            "content_scope",
            sa.String(length=24),
            nullable=False,
            server_default="project_only",
        ),
    )
    # Preserve the established behavior for the dedicated personal-brand
    # workspace. All other projects start isolated regardless of their name.
    op.execute(
        sa.text(
            "UPDATE smm_projects SET content_scope = 'all_projects' "
            "WHERE code = 'lichny_brand'"
        )
    )


def downgrade() -> None:
    op.drop_column("smm_projects", "content_scope")
