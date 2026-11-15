"""Add monthly Kodik feedback answers for student portal."""
from alembic import op
import sqlalchemy as sa

revision = "0240"
down_revision = "0239"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kodik_student_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("period_label", sa.String(length=16), nullable=False),
        sa.Column("answer", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "period_label", name="uq_kodik_feedback_student_period"),
    )
    op.create_index(op.f("ix_kodik_student_feedback_student_id"), "kodik_student_feedback", ["student_id"])
    op.create_index(op.f("ix_kodik_student_feedback_period_label"), "kodik_student_feedback", ["period_label"])


def downgrade() -> None:
    op.drop_index(op.f("ix_kodik_student_feedback_period_label"), table_name="kodik_student_feedback")
    op.drop_index(op.f("ix_kodik_student_feedback_student_id"), table_name="kodik_student_feedback")
    op.drop_table("kodik_student_feedback")
