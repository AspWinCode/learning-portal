# -*- coding: utf-8 -*-
"""
Скрипт для анализа knd_1151158.pdf: размеры страниц, поля формы (AcroForm), позиции.
Запуск из корня backend: python scripts/inspect_knd_pdf.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def _get_annotations(reader, page):
    """Извлечь аннотации страницы с координатами."""
    res = []
    if "/Annots" not in page:
        return res
    annots = page["/Annots"]
    for ref in annots:
        try:
            obj = ref.get_object() if hasattr(ref, "get_object") else ref
            rect = obj.get("/Rect")
            if rect is not None and len(rect) >= 4:
                x0, y0, x1, y1 = float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])
                name = obj.get("/T")
                if name is not None and hasattr(name, "get_object"):
                    name = name.get_object()
                if isinstance(name, bytes):
                    name = name.decode("utf-8", errors="replace")
                name = str(name or "")
                res.append((name, x0, y0, x1, y1))
        except Exception:
            pass
    return res

def main():
    from pypdf import PdfReader

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "templates", "knd_1151158.pdf")
    if not os.path.isfile(path):
        print("File not found: %s" % path)
        return

    reader = PdfReader(path)
    pt_to_mm = 25.4 / 72.0

    for i, page in enumerate(reader.pages):
        mb = page.mediabox
        w_pt = float(mb.width)
        h_pt = float(mb.height)
        w_mm = w_pt * pt_to_mm
        h_mm = h_pt * pt_to_mm
        print("--- Page %d ---" % i)
        print("  Size: %.1f x %.1f pt = %.1f x %.1f mm" % (w_pt, h_pt, w_mm, h_mm))
        ann = _get_annotations(reader, page)
        for name, x0, y0, x1, y1 in ann:
            y_top_mm = (h_pt - y1) * pt_to_mm
            x_mm = x0 * pt_to_mm
            width_mm = (x1 - x0) * pt_to_mm
            height_mm = (y1 - y0) * pt_to_mm
            print("  Field %r  x=%.1f y_top=%.1f w=%.1f h=%.1f mm" % (name, x_mm, y_top_mm, width_mm, height_mm))
        if not ann:
            print("  (no form fields on this page)")
        print()

if __name__ == "__main__":
    main()
