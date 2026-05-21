"""person registry phase 2

Revision ID: 0096_person_registry_phase2
Revises: 0095_student_activity_timeline
Create Date: 2026-05-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0096_person_registry_phase2"
down_revision = "0095_student_activity_timeline"
branch_labels = None
depends_on = None


def _normalize_email(value):
    email = (value or "").strip().lower()
    return email or None


def _key_for_record(full_name, email, phone_normalized):
    normalized_email = _normalize_email(email)
    normalized_phone = (phone_normalized or "").strip() or None
    normalized_name = (full_name or "").strip()
    if normalized_email:
        return ("email", normalized_email)
    if normalized_phone:
        return ("phone", normalized_phone)
    if normalized_name:
        return ("name", normalized_name.lower())
    return None


def upgrade():
    op.create_table(
        "persons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone_normalized", sa.String(length=32), nullable=True),
        sa.Column("role_hint", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_persons_full_name", "persons", ["full_name"], unique=False)
    op.create_index("ix_persons_email", "persons", ["email"], unique=False)
    op.create_index("ix_persons_phone_normalized", "persons", ["phone_normalized"], unique=False)
    op.create_index("ix_persons_role_hint", "persons", ["role_hint"], unique=False)

    op.add_column("users", sa.Column("person_id", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("person_id", sa.Integer(), nullable=True))
    op.add_column("student_cards", sa.Column("person_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_person_id", "users", ["person_id"], unique=False)
    op.create_index("ix_leads_person_id", "leads", ["person_id"], unique=False)
    op.create_index("ix_student_cards_person_id", "student_cards", ["person_id"], unique=False)
    op.create_foreign_key("fk_users_person_id", "users", "persons", ["person_id"], ["id"])
    op.create_foreign_key("fk_leads_person_id", "leads", "persons", ["person_id"], ["id"])
    op.create_foreign_key("fk_student_cards_person_id", "student_cards", "persons", ["person_id"], ["id"])

    # Keep the migration additive-only. Legacy production databases may contain
    # broken orphan FK triggers on users/leads, so backfilling person links via
    # mass UPDATEs inside Alembic is unsafe there. Runtime sync paths and manual
    # registry operations can populate person_id after deployment.


def downgrade():
    op.drop_constraint("fk_student_cards_person_id", "student_cards", type_="foreignkey")
    op.drop_constraint("fk_leads_person_id", "leads", type_="foreignkey")
    op.drop_constraint("fk_users_person_id", "users", type_="foreignkey")
    op.drop_index("ix_student_cards_person_id", table_name="student_cards")
    op.drop_index("ix_leads_person_id", table_name="leads")
    op.drop_index("ix_users_person_id", table_name="users")
    op.drop_column("student_cards", "person_id")
    op.drop_column("leads", "person_id")
    op.drop_column("users", "person_id")
    op.drop_index("ix_persons_role_hint", table_name="persons")
    op.drop_index("ix_persons_phone_normalized", table_name="persons")
    op.drop_index("ix_persons_email", table_name="persons")
    op.drop_index("ix_persons_full_name", table_name="persons")
    op.drop_table("persons")
