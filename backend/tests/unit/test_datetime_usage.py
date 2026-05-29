from pathlib import Path


def test_backend_has_no_datetime_utcnow_calls():
    backend_app = Path(__file__).resolve().parents[2] / "app"
    offenders = []
    for path in backend_app.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "datetime.utcnow(" in text:
            offenders.append(str(path))
    assert offenders == []
