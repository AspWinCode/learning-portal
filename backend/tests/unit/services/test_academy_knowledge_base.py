import pytest

from app.services.academy_ai import knowledge_base as kb
from app.services.academy_ai import storage


def test_chunk_text_merges_short_paragraphs():
    text = "\n\n".join(["короткий абзац"] * 5)
    chunks = kb.chunk_text(text, target_chars=1200, overlap=0)
    assert len(chunks) == 1


def test_chunk_text_splits_long_paragraph():
    chunks = kb.chunk_text("x" * 5000, target_chars=1000, overlap=0)
    assert len(chunks) == 5
    assert all(len(c) <= 1000 for c in chunks)


def test_chunk_text_empty():
    assert kb.chunk_text("") == []
    assert kb.chunk_text("   \n\n  ") == []


def test_chunk_text_overlap_prepends_tail():
    chunks = kb.chunk_text("A" * 1200 + "\n\n" + "B" * 1200, target_chars=1000, overlap=50)
    assert chunks[1].startswith("A" * 50)


def test_parse_enrichment_filters_shape():
    out = kb._parse_enrichment(
        {
            "summary": "  Фото нового филиала на Ленина  ",
            "tags": ["филиал", " ", "открытие", 123],
            "section": "marketing",
            "direction": "латынь",
        }
    )
    assert out["summary"] == "Фото нового филиала на Ленина"
    assert out["tags"] == ["филиал", "открытие", "123"]
    assert out["section"] == "marketing"
    assert "direction" not in out


def test_parse_enrichment_ignores_non_dict():
    assert kb._parse_enrichment(None) == {}
    assert kb._parse_enrichment("nope") == {}


def test_storage_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ACADEMY_STORAGE_ROOT", tmp_path.resolve())
    key = storage.save_bytes(b"hello", "note.txt")
    assert storage.read_bytes(key) == b"hello"
    assert storage.as_data_uri(key, "text/plain").startswith("data:text/plain;base64,")
    storage.delete(key)
    assert storage.read_bytes(key) is None


def test_storage_rejects_empty_and_oversize(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ACADEMY_STORAGE_ROOT", tmp_path.resolve())
    monkeypatch.setattr(storage, "MAX_UPLOAD_BYTES", 4)
    with pytest.raises(ValueError):
        storage.save_bytes(b"", "x")
    with pytest.raises(ValueError):
        storage.save_bytes(b"12345", "x")


def test_storage_resolve_path_escape(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ACADEMY_STORAGE_ROOT", tmp_path.resolve())
    with pytest.raises(ValueError):
        storage.resolve_path("../../etc/passwd")
