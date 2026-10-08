"""AI Studio publication state machine and structured content output."""
from alembic import op
import sqlalchemy as sa

revision = "0218"
down_revision = "0217"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_generated_content", sa.Column("output_json", sa.JSON(), nullable=True))
    op.add_column("ai_generated_content", sa.Column("selected_asset_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_ai_generated_content_selected_asset",
        "ai_generated_content", "ai_generated_assets", ["selected_asset_id"], ["id"], ondelete="SET NULL"
    )
    op.add_column("ai_generated_assets", sa.Column("is_selected", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_ai_generated_assets_is_selected", "ai_generated_assets", ["is_selected"])
    op.create_table(
        "ai_publications",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False, index=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("ai_generated_assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("text_snapshot", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="approved", index=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("approved_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("external_id", sa.String(256), nullable=True),
        sa.Column("external_url", sa.String(1024), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("ai_publications")
    op.drop_index("ix_ai_generated_assets_is_selected", table_name="ai_generated_assets")
    op.drop_column("ai_generated_assets", "is_selected")
    op.drop_constraint("fk_ai_generated_content_selected_asset", "ai_generated_content", type_="foreignkey")
    op.drop_column("ai_generated_content", "selected_asset_id")
    op.drop_column("ai_generated_content", "output_json")
