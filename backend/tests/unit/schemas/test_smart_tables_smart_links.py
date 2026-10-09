import pytest
from pydantic import ValidationError

from app.schemas.smart_tables import OpSetSmartLink


def test_accepts_workbook_sheet_and_cell_targets():
    workbook = OpSetSmartLink(
        row_id=1, column_id=2, label="Открыть",
        target={"type": "smart_table", "workbook_id": 7},
    )
    sheet = OpSetSmartLink(
        row_id=1, column_id=2, label="План",
        target={"type": "smart_table", "workbook_id": 7, "sheet_id": 24},
    )
    cell = OpSetSmartLink(
        row_id=1, column_id=2, label="D27",
        target={
            "type": "smart_table", "workbook_id": 7, "sheet_id": 24,
            "row_id": 91, "column_id": 18,
        },
    )

    assert workbook.target.workbook_id == 7
    assert sheet.target.sheet_id == 24
    assert cell.target.row_id == 91


@pytest.mark.parametrize("url", ["https://example.com/path", "http://example.com"])
def test_accepts_http_external_urls(url):
    op = OpSetSmartLink(
        row_id=1, column_id=2, label="Сайт",
        target={"type": "external_url", "url": url},
    )
    assert op.target.url == url


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/plain,hello", "file:///tmp/test", "example.com"])
def test_rejects_unsafe_external_urls(url):
    with pytest.raises(ValidationError):
        OpSetSmartLink(
            row_id=1, column_id=2, label="Сайт",
            target={"type": "external_url", "url": url},
        )


def test_cell_target_requires_both_ids_and_sheet():
    with pytest.raises(ValidationError):
        OpSetSmartLink(
            row_id=1, column_id=2, label="Ячейка",
            target={"type": "smart_table", "workbook_id": 7, "row_id": 91},
        )
