"""
Интеграционные тесты для paste_range (clipboard-вставка в Умных таблицах) и
для rename/delete листа.

Работают против реальной БД, заданной DATABASE_URL (как остальные
integration-тесты в этом пакете, см. test_academy_monthly_metrics.py), и
вызывают OperationExecutor напрямую для paste/undo/redo/limit (быстро,
полный контроль), либо реальный HTTP через TestClient для permission-тестов
на PATCH/DELETE /sheets/{id} (нужен настоящий dependency-граф auth).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import _is_db_configured

pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")


def _get_session():
    from app.database import SessionLocal
    return SessionLocal()


@pytest.fixture
def db():
    session = _get_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def owner_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_st_owner_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.MANAGER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def editor_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_st_editor_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Editor",
        role=UserRole.MANAGER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def viewer_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_st_viewer_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Viewer",
        role=UserRole.MANAGER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def workbook(db, owner_user):
    from app.models import SmartTableWorkbook

    wb = SmartTableWorkbook(name=f"Test WB {uuid.uuid4().hex[:6]}", owner_id=owner_user.id)
    db.add(wb)
    db.commit()
    db.refresh(wb)
    return wb


@pytest.fixture
def sheet(db, workbook):
    """2 строки x 2 колонки — text columns, достаточно для in-bounds тестов."""
    from app.models import SmartTableColumn, SmartTableRow, SmartTableSheet

    s = SmartTableSheet(workbook_id=workbook.id, name="Лист 1", position=0.0)
    db.add(s)
    db.flush()
    col_a = SmartTableColumn(sheet_id=s.id, name="A", type="text", position=0.0, config={})
    col_b = SmartTableColumn(sheet_id=s.id, name="B", type="text", position=1.0, config={})
    db.add_all([col_a, col_b])
    row_1 = SmartTableRow(sheet_id=s.id, position=0.0, cells_snapshot={})
    row_2 = SmartTableRow(sheet_id=s.id, position=1.0, cells_snapshot={})
    db.add_all([row_1, row_2])
    db.commit()
    db.refresh(s)
    return s, [row_1, row_2], [col_a, col_b]


def _executor(db, sheet_obj, user_id):
    from app.services.smart_tables.executor import OperationExecutor
    return OperationExecutor(db, sheet_obj, user_id)


def _op_log_count(db, sheet_id):
    from app.models import SmartTableOperationLog
    return db.query(SmartTableOperationLog).filter(SmartTableOperationLog.sheet_id == sheet_id).count()


class TestPasteRangeInBounds:
    def test_writes_all_cells_in_one_log_row(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        before = _op_log_count(db, sheet_obj.id)
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpPasteRange

        op = OpPasteRange(
            anchor_row_id=rows[0].id,
            anchor_column_id=cols[0].id,
            cells=[
                [{"value": "Иван"}, {"value": "15"}],
                [{"value": "Пётр"}, {"value": "20"}],
            ],
        )
        applied = ex.apply_batch([op])
        db.commit()

        assert applied == 1
        assert _op_log_count(db, sheet_obj.id) == before + 1

        from app.models import SmartTableCell
        cell_a1 = db.query(SmartTableCell).filter_by(row_id=rows[0].id, column_id=cols[0].id).first()
        cell_b2 = db.query(SmartTableCell).filter_by(row_id=rows[1].id, column_id=cols[1].id).first()
        assert cell_a1.raw_value == "Иван"
        assert cell_b2.raw_value == "20"


class TestPasteRangeAutoExpand:
    def test_inserts_needed_rows_and_columns(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet  # 2x2 sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpPasteRange

        # 3x3 paste anchored at the last existing row/column -> needs +2 rows, +2 columns
        op = OpPasteRange(
            anchor_row_id=rows[1].id,
            anchor_column_id=cols[1].id,
            cells=[[{"value": f"r{r}c{c}"} for c in range(3)] for r in range(3)],
        )
        ex.apply_batch([op])
        db.commit()

        from app.models import SmartTableColumn, SmartTableRow
        all_rows = db.query(SmartTableRow).filter(SmartTableRow.sheet_id == sheet_obj.id).order_by(SmartTableRow.position).all()
        all_cols = db.query(SmartTableColumn).filter(SmartTableColumn.sheet_id == sheet_obj.id).order_by(SmartTableColumn.position).all()
        assert len(all_rows) == 4  # 2 original + 2 inserted
        assert len(all_cols) == 4

        from app.models import SmartTableCell
        last_row, last_col = all_rows[-1], all_cols[-1]
        cell = db.query(SmartTableCell).filter_by(row_id=last_row.id, column_id=last_col.id).first()
        assert cell.raw_value == "r2c2"


class TestPasteRangeFormula:
    def test_formula_cell_is_stored_and_recalculated(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpPasteRange, OpSetCell

        # seed numeric cells, then paste a formula referencing them
        ex.apply_batch([
            OpSetCell(row_id=rows[0].id, column_id=cols[0].id, value=2),
            OpSetCell(row_id=rows[0].id, column_id=cols[1].id, value=3),
        ])
        op = OpPasteRange(anchor_row_id=rows[1].id, anchor_column_id=cols[0].id, cells=[[{"formula": "=A1+B1"}]])
        ex.apply_batch([op])
        db.commit()

        from app.models import SmartTableCell
        cell = db.query(SmartTableCell).filter_by(row_id=rows[1].id, column_id=cols[0].id).first()
        assert cell.formula == "=A1+B1"


class TestPasteRangeUndoRedo:
    def test_undo_reverts_entire_paste_including_auto_inserted_rows_and_columns(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpPasteRange
        from app.models import SmartTableCell, SmartTableColumn, SmartTableRow

        # overwrite an existing cell AND auto-expand by one row/column in the same paste
        op = OpPasteRange(
            anchor_row_id=rows[0].id,
            anchor_column_id=cols[0].id,
            cells=[
                [{"value": "x"}, {"value": "y"}, {"value": "z"}],
                [{"value": "1"}, {"value": "2"}, {"value": "3"}],
                [{"value": "4"}, {"value": "5"}, {"value": "6"}],
            ],
        )
        ex.apply_batch([op])
        db.commit()
        assert db.query(SmartTableRow).filter(SmartTableRow.sheet_id == sheet_obj.id).count() == 3
        assert db.query(SmartTableColumn).filter(SmartTableColumn.sheet_id == sheet_obj.id).count() == 3

        did_undo = ex.undo_last()
        db.commit()
        assert did_undo is True

        assert db.query(SmartTableRow).filter(SmartTableRow.sheet_id == sheet_obj.id).count() == 2
        assert db.query(SmartTableColumn).filter(SmartTableColumn.sheet_id == sheet_obj.id).count() == 2
        restored = db.query(SmartTableCell).filter_by(row_id=rows[0].id, column_id=cols[0].id).first()
        assert (restored is None) or (restored.raw_value is None)

    def test_second_undo_redoes_the_paste(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpPasteRange
        from app.models import SmartTableCell, SmartTableColumn, SmartTableRow

        op = OpPasteRange(anchor_row_id=rows[0].id, anchor_column_id=cols[0].id, cells=[[{"value": "hi"}]])
        ex.apply_batch([op])
        db.commit()
        ex.undo_last()
        db.commit()
        ex.undo_last()  # second undo = redo of the original paste
        db.commit()

        cell = db.query(SmartTableCell).filter_by(row_id=rows[0].id, column_id=cols[0].id).first()
        assert cell is not None and cell.raw_value == "hi"
        assert db.query(SmartTableRow).filter(SmartTableRow.sheet_id == sheet_obj.id).count() == 2
        assert db.query(SmartTableColumn).filter(SmartTableColumn.sheet_id == sheet_obj.id).count() == 2


class TestPasteRangeLimit:
    def test_rejects_paste_beyond_max_cells(self, sheet):
        sheet_obj, rows, cols = sheet
        from app.schemas.smart_tables import MAX_PASTE_CELLS, OpPasteRange
        import pydantic

        huge_row = [{"value": "x"} for _ in range(MAX_PASTE_CELLS + 1)]
        with pytest.raises(pydantic.ValidationError):
            OpPasteRange(anchor_row_id=rows[0].id, anchor_column_id=cols[0].id, cells=[huge_row])


class TestSmartLinks:
    def test_set_and_undo_restore_label_target_and_metadata(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.models import SmartTableCell
        from app.schemas.smart_tables import OpSetCell, OpSetSmartLink

        ex.apply_batch([OpSetCell(row_id=rows[0].id, column_id=cols[0].id, value="До ссылки")])
        ex.apply_batch([OpSetSmartLink(
            row_id=rows[0].id,
            column_id=cols[0].id,
            label="Открыть",
            target={
                "type": "smart_table",
                "workbook_id": sheet_obj.workbook_id,
                "sheet_id": sheet_obj.id,
                "row_id": rows[1].id,
                "column_id": cols[1].id,
            },
        )])
        db.commit()

        cell = db.query(SmartTableCell).filter_by(row_id=rows[0].id, column_id=cols[0].id).one()
        assert cell.computed_value == "Открыть"
        assert cell.cell_metadata["type"] == "smart_link"
        assert cell.cell_metadata["target"]["row_id"] == rows[1].id
        snapshot = rows[0].cells_snapshot[str(cols[0].id)]
        assert snapshot["metadata"] == cell.cell_metadata

        assert ex.undo_last() is True
        db.commit()
        db.refresh(cell)
        assert cell.computed_value == "До ссылки"
        assert cell.cell_metadata == {}

    def test_plain_set_cell_removes_existing_smart_link_metadata(self, db, sheet, owner_user):
        sheet_obj, rows, cols = sheet
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.models import SmartTableCell
        from app.schemas.smart_tables import OpSetCell, OpSetSmartLink

        ex.apply_batch([OpSetSmartLink(
            row_id=rows[0].id, column_id=cols[0].id, label="Открыть",
            target={"type": "external_url", "url": "https://example.com"},
        )])
        ex.apply_batch([OpSetCell(row_id=rows[0].id, column_id=cols[0].id, value="Текст")])
        db.commit()

        cell = db.query(SmartTableCell).filter_by(row_id=rows[0].id, column_id=cols[0].id).one()
        assert cell.computed_value == "Текст"
        assert cell.cell_metadata == {}


class TestSheetRenamePermissions:
    def test_editor_can_rename_viewer_cannot(self, db, workbook, sheet, editor_user, viewer_user):
        from app import auth
        from app.main import app
        from app.models import SmartTableMember

        db.add_all([
            SmartTableMember(workbook_id=workbook.id, user_id=editor_user.id, role="editor"),
            SmartTableMember(workbook_id=workbook.id, user_id=viewer_user.id, role="viewer"),
        ])
        db.commit()
        sheet_obj, _, _ = sheet

        client = TestClient(app)
        editor_token = auth.create_access_token({"sub": editor_user.email})
        viewer_token = auth.create_access_token({"sub": viewer_user.email})

        r_editor = client.patch(
            f"/api/v1/smart-tables/sheets/{sheet_obj.id}",
            json={"name": "Переименованный"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert r_editor.status_code == 200
        assert r_editor.json()["name"] == "Переименованный"

        r_viewer = client.patch(
            f"/api/v1/smart-tables/sheets/{sheet_obj.id}",
            json={"name": "Не должно сработать"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert r_viewer.status_code == 403


class TestSheetDeletePermissions:
    def test_owner_can_delete_with_cascade_editor_cannot(self, db, workbook, sheet, owner_user, editor_user):
        from app import auth
        from app.main import app
        from app.models import (
            SmartTableCell, SmartTableColumn, SmartTableMember, SmartTableOperationLog, SmartTableRow,
        )

        db.add(SmartTableMember(workbook_id=workbook.id, user_id=editor_user.id, role="editor"))
        db.commit()
        sheet_obj, rows, cols = sheet
        sheet_id = sheet_obj.id
        row_ids = [r.id for r in rows]
        col_ids = [c.id for c in cols]

        # write a cell + an operation-log row so we can confirm cascade cleanup
        ex = _executor(db, sheet_obj, owner_user.id)
        from app.schemas.smart_tables import OpSetCell
        ex.apply_batch([OpSetCell(row_id=rows[0].id, column_id=cols[0].id, value="x")])
        db.commit()
        assert _op_log_count(db, sheet_id) > 0

        client = TestClient(app)
        editor_token = auth.create_access_token({"sub": editor_user.email})
        owner_token = auth.create_access_token({"sub": owner_user.email})

        r_editor = client.delete(
            f"/api/v1/smart-tables/sheets/{sheet_id}",
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert r_editor.status_code == 403

        r_owner = client.delete(
            f"/api/v1/smart-tables/sheets/{sheet_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r_owner.status_code == 204

        db.expire_all()
        assert db.query(SmartTableRow).filter(SmartTableRow.sheet_id == sheet_id).count() == 0
        assert db.query(SmartTableColumn).filter(SmartTableColumn.sheet_id == sheet_id).count() == 0
        assert db.query(SmartTableCell).filter(SmartTableCell.row_id.in_(row_ids)).count() == 0
        assert db.query(SmartTableCell).filter(SmartTableCell.column_id.in_(col_ids)).count() == 0
        assert db.query(SmartTableOperationLog).filter(SmartTableOperationLog.sheet_id == sheet_id).count() == 0
