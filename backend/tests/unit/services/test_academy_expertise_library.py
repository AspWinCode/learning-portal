import io
import zipfile

import pytest

from app.services.academy_ai import expertise_library as el


def test_strip_html_removes_scripts_and_tags():
    out = el._strip_html("<p>Привет</p><script>bad()</script><p>мир</p>")
    assert "Привет" in out and "мир" in out
    assert "bad()" not in out and "<p>" not in out


def test_extract_text_sync_plain_and_markdown():
    assert el.extract_text_sync(b"line one\n\nline two", "text/plain", "n.txt") == "line one\n\nline two"
    assert el.extract_text_sync(b"# Title\n\ntext", "", "n.md") == "# Title\n\ntext"


def test_extract_text_sync_html():
    out = el.extract_text_sync(b"<html><body><h1>Zag</h1><p>tekst</p></body></html>", "text/html", "p.html")
    assert "Zag" in out and "tekst" in out


def test_extract_text_sync_unknown_returns_empty():
    assert el.extract_text_sync(b"\x00\x01binary", "application/octet-stream", "x.bin") == ""


def test_extract_epub_reads_xhtml():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("OEBPS/ch1.xhtml", "<html><body><p>Глава первая</p></body></html>")
        zf.writestr("OEBPS/ch2.xhtml", "<html><body><p>Глава вторая</p></body></html>")
    text = el._extract_epub(buf.getvalue())
    assert "Глава первая" in text and "Глава вторая" in text


def test_extract_epub_bad_zip():
    assert el._extract_epub(b"not a zip") == ""


class _Source:
    def __init__(self):
        self.status = "active"


class _DB:
    def commit(self):
        pass

    def refresh(self, _obj):
        pass


def test_set_status_validates():
    src = _Source()
    el.set_status(_DB(), src, "disabled")
    assert src.status == "disabled"
    with pytest.raises(ValueError):
        el.set_status(_DB(), src, "banned")
