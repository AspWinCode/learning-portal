"""Normalize Russian owner workspace contact phones."""
import re

from alembic import op
import sqlalchemy as sa


revision = "0246"
down_revision = "0245"
branch_labels = None
depends_on = None


def _format_phone(raw: str | None) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "7" + digits
    elif len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) != 11 or not digits.startswith("7"):
        return None
    return f"+7({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"


def upgrade() -> None:
    bind = op.get_bind()
    table = sa.table(
        "owner_workspace_contacts",
        sa.column("id", sa.Integer),
        sa.column("phone", sa.String),
    )
    rows = bind.execute(sa.select(table.c.id, table.c.phone)).fetchall()
    for contact_id, phone in rows:
        normalized = _format_phone(phone)
        if normalized and normalized != phone:
            bind.execute(table.update().where(table.c.id == contact_id).values(phone=normalized))


def downgrade() -> None:
    # The canonical display format is intentionally not reverted.
    pass
