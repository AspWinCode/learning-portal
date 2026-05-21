"""0090: custom roles foundation

Revision ID: 0090_custom_roles_foundation
Revises: 0089_owner_workspace_web_push_outbox
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0090_custom_roles_foundation"
down_revision = "0089_owner_workspace_web_push_outbox"
branch_labels = None
depends_on = None


userrole_enum = postgresql.ENUM(
    "admin",
    "owner",
    "trainer",
    "parent",
    "guest",
    "sales",
    name="userrole",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("base_role", userrole_enum, nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_id", "roles", ["id"], unique=False)
    op.create_index("ix_roles_key", "roles", ["key"], unique=True)

    op.add_column("users", sa.Column("custom_role_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_custom_role_id", "users", ["custom_role_id"], unique=False)
    op.create_foreign_key(
        "fk_users_custom_role_id_roles",
        "users",
        "roles",
        ["custom_role_id"],
        ["id"],
        ondelete="SET NULL",
    )

    roles_table = sa.table(
        "roles",
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("base_role", userrole_enum),
        sa.column("permissions", sa.JSON),
        sa.column("is_system", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        roles_table,
        [
            {
                "key": "admin",
                "name": "Administrator",
                "description": "Built-in system administrator role",
                "base_role": "admin",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
            {
                "key": "owner",
                "name": "Owner",
                "description": "Built-in business owner role",
                "base_role": "owner",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
            {
                "key": "trainer",
                "name": "Trainer",
                "description": "Built-in trainer role",
                "base_role": "trainer",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
            {
                "key": "parent",
                "name": "Parent",
                "description": "Built-in parent role",
                "base_role": "parent",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
            {
                "key": "guest",
                "name": "Guest",
                "description": "Built-in guest role",
                "base_role": "guest",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
            {
                "key": "sales",
                "name": "Sales",
                "description": "Built-in sales role",
                "base_role": "sales",
                "permissions": [],
                "is_system": True,
                "is_active": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_custom_role_id_roles", "users", type_="foreignkey")
    op.drop_index("ix_users_custom_role_id", table_name="users")
    op.drop_column("users", "custom_role_id")

    op.drop_index("ix_roles_key", table_name="roles")
    op.drop_index("ix_roles_id", table_name="roles")
    op.drop_table("roles")
