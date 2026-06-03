"""Lead converted_to_student_id and Student from_lead_id for convert lead to student.

Revision ID: 0066_lead_student_convert
Revises: 0065_task_kind_reminder
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = "0066_lead_student_convert"
down_revision = "0065_task_kind_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("from_lead_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_students_from_lead_id_leads",
        "students",
        "leads",
        ["from_lead_id"],
        ["id"],
    )
    op.create_index("ix_students_from_lead_id", "students", ["from_lead_id"], unique=False, if_not_exists=True)

    op.add_column("leads", sa.Column("converted_to_student_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_leads_converted_to_student_id_students",
        "leads",
        "students",
        ["converted_to_student_id"],
        ["id"],
    )
    op.create_index("ix_leads_converted_to_student_id", "leads", ["converted_to_student_id"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_leads_converted_to_student_id", table_name="leads")
    op.drop_constraint("fk_leads_converted_to_student_id_students", "leads", type_="foreignkey")
    op.drop_column("leads", "converted_to_student_id")

    op.drop_index("ix_students_from_lead_id", table_name="students")
    op.drop_constraint("fk_students_from_lead_id_leads", "students", type_="foreignkey")
    op.drop_column("students", "from_lead_id")
