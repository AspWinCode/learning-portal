"""TRAINER role rework: Disk folder ACL (default-deny) + local submission
review log (Codelab/PixelForge/TechnoLab review decisions survive even
though the actual submitted work stays in the external service).

Revision ID: 0223
Revises: 0222
Create Date: 2026-10-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0223"
down_revision = "0222"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "disk_folder_access",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("disk_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("role", sa.String(32), nullable=True, index=True),
        sa.Column("can_view", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "submission_review_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("source", sa.String(32), nullable=False, index=True),
        sa.Column("external_submission_id", sa.String(128), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("attempt_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("submission_review_logs")
    op.drop_table("disk_folder_access")
