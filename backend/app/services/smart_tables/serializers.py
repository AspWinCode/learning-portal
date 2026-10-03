"""Сериализация SmartTableSheet -> SheetDetail — общая для роутера и AI-сервиса
(чтобы app/services/smart_tables/ai/service.py не импортировал app/routers/*)."""
from app.models import SmartTableSheet
from app.schemas.smart_tables import ColumnOut, RowOut, SheetDetail, SheetSummary


def sheet_detail(sheet: SmartTableSheet) -> SheetDetail:
    columns = sorted(sheet.columns_, key=lambda c: c.position)
    rows = sorted(sheet.rows, key=lambda r: r.position)
    return SheetDetail(
        sheet=SheetSummary.model_validate(sheet),
        columns=[ColumnOut.model_validate(c) for c in columns],
        rows=[
            RowOut(
                id=r.id,
                sheet_id=r.sheet_id,
                position=r.position,
                height=r.height,
                cells=r.cells_snapshot or {},
            )
            for r in rows
        ],
    )
