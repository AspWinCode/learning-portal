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

    bind = op.get_bind()
    metadata = sa.MetaData()
    persons = sa.Table(
        "persons",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("full_name", sa.String),
        sa.Column("email", sa.String),
        sa.Column("phone_normalized", sa.String(32)),
        sa.Column("role_hint", sa.String(32)),
    )
    users = sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("person_id", sa.Integer),
        sa.Column("full_name", sa.String),
        sa.Column("email", sa.String),
        sa.Column("phone_normalized", sa.String(32)),
        sa.Column("role", sa.String),
    )
    leads = sa.Table(
        "leads",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("person_id", sa.Integer),
        sa.Column("contact_name", sa.String),
        sa.Column("parent_full_name", sa.String),
        sa.Column("email", sa.String),
        sa.Column("phone_normalized", sa.String(32)),
    )
    student_cards = sa.Table(
        "student_cards",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("person_id", sa.Integer),
        sa.Column("student_full_name", sa.String),
        sa.Column("parent_full_name", sa.String),
        sa.Column("parent_email", sa.String),
        sa.Column("phone_normalized", sa.String(32)),
    )

    key_to_person_id = {}

    def ensure_person(full_name, email, phone_normalized, role_hint):
        key = _key_for_record(full_name, email, phone_normalized)
        if key and key in key_to_person_id:
            return key_to_person_id[key]
        payload = {
            "full_name": (full_name or "").strip() or _normalize_email(email) or (phone_normalized or "").strip() or "Unknown",
            "email": _normalize_email(email),
            "phone_normalized": (phone_normalized or "").strip() or None,
            "role_hint": role_hint,
        }
        person_id = bind.execute(sa.insert(persons).values(**payload)).inserted_primary_key[0]
        if key:
            key_to_person_id[key] = person_id
        return person_id

    user_rows = bind.execute(
        sa.select(
            users.c.id,
            users.c.full_name,
            users.c.email,
            users.c.phone_normalized,
            users.c.role,
        )
    ).mappings()
    for row in user_rows:
        person_id = ensure_person(row["full_name"], row["email"], row["phone_normalized"], row["role"])
        bind.execute(
            sa.update(users)
            .where(users.c.id == row["id"])
            .values(person_id=person_id)
        )

    lead_rows = bind.execute(
        sa.select(
            leads.c.id,
            leads.c.contact_name,
            leads.c.parent_full_name,
            leads.c.email,
            leads.c.phone_normalized,
        )
    ).mappings()
    for row in lead_rows:
        full_name = (row["parent_full_name"] or row["contact_name"] or "").strip()
        person_id = ensure_person(full_name, row["email"], row["phone_normalized"], "lead")
        bind.execute(
            sa.update(leads)
            .where(leads.c.id == row["id"])
            .values(person_id=person_id)
        )

    card_rows = bind.execute(
        sa.select(
            student_cards.c.id,
            student_cards.c.student_full_name,
            student_cards.c.parent_full_name,
            student_cards.c.parent_email,
            student_cards.c.phone_normalized,
        )
    ).mappings()
    for row in card_rows:
        full_name = (row["parent_full_name"] or row["student_full_name"] or "").strip()
        person_id = ensure_person(full_name, row["parent_email"], row["phone_normalized"], "student_card")
        bind.execute(
            sa.update(student_cards)
            .where(student_cards.c.id == row["id"])
            .values(person_id=person_id)
        )


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
