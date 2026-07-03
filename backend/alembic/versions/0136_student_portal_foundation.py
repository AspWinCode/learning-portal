"""student portal foundation: credentials, course catalog, course access

Revision ID: 0136_student_portal_foundation
Revises: 0135_finance_target_is_personal
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0136_student_portal_foundation"
down_revision = "0135_finance_target_is_personal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("login", sa.String(length=64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_student_credentials_student_id", "student_credentials", ["student_id"])
    op.create_index("ix_student_credentials_login", "student_credentials", ["login"])

    coursecatalogitemkind = sa.Enum("internal", "external", name="coursecatalogitemkind", create_type=False)
    coursecatalogitemkind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "course_catalog_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_image_url", sa.String(length=512), nullable=True),
        sa.Column("kind", coursecatalogitemkind, nullable=False, server_default="external"),
        sa.Column("external_url", sa.String(length=512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_course_catalog_items_code", "course_catalog_items", ["code"])

    studentcourseaccessstatus = sa.Enum("active", "revoked", name="studentcourseaccessstatus", create_type=False)
    studentcourseaccessstatus.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "student_course_access",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("catalog_item_id", sa.Integer(), sa.ForeignKey("course_catalog_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", studentcourseaccessstatus, nullable=False, server_default="active"),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("student_id", "catalog_item_id", name="uq_student_course_access"),
    )
    op.create_index("ix_student_course_access_student_id", "student_course_access", ["student_id"])
    op.create_index("ix_student_course_access_catalog_item_id", "student_course_access", ["catalog_item_id"])


def downgrade() -> None:
    op.drop_table("student_course_access")
    sa.Enum(name="studentcourseaccessstatus").drop(op.get_bind(), checkfirst=True)
    op.drop_table("course_catalog_items")
    sa.Enum(name="coursecatalogitemkind").drop(op.get_bind(), checkfirst=True)
    op.drop_table("student_credentials")
