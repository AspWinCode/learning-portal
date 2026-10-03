"""Минимальный контекст для AI — Phase 5.

LLM получает схему листа целиком (колонки дёшевы по объёму) и выборку
строк (не весь лист — см. docs/smart-tables-architecture.md, раздел H),
чтобы промпт оставался компактным даже на тысячах строк. Содержимое
ячеек — недоверенные данные: оборачивается в маркированный блок, и
system-промпт (service.py) явно требует не исполнять инструкции внутри
него (защита от prompt injection).
"""
from __future__ import annotations

import json
from typing import List

from app.models import SmartTableColumn, SmartTableRow, SmartTableSheet
from app.services.smart_tables.formula.parser import index_to_col_letters

MAX_SAMPLE_ROWS = 50


def build_context(sheet: SmartTableSheet, columns: List[SmartTableColumn], rows: List[SmartTableRow]) -> str:
    columns_desc = [
        {"id": c.id, "letter": index_to_col_letters(i), "name": c.name, "type": c.type}
        for i, c in enumerate(columns)
    ]
    sample = rows[:MAX_SAMPLE_ROWS]
    rows_desc = []
    for r in sample:
        cells = {}
        for col in columns:
            snap = (r.cells_snapshot or {}).get(str(col.id))
            cells[str(col.id)] = snap.get("value") if isinstance(snap, dict) else None
        rows_desc.append({"row_id": r.id, "cells": cells})

    payload = {
        "sheet_name": sheet.name,
        "columns": columns_desc,
        "total_rows": len(rows),
        "sample_rows_count": len(sample),
        "rows": rows_desc,
    }
    return (
        "<sheet_data>\n"
        + json.dumps(payload, ensure_ascii=False, default=str)
        + "\n</sheet_data>"
    )
