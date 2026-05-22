import os
from datetime import date
from io import BytesIO
from typing import Dict

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    mm = 2.834645669  # pt per mm, for default arg when reportlab not installed

try:
    from pypdf import PdfReader, PdfWriter

    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False


def knd_template_path() -> str:
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.path.join(base_path, "templates", "knd_1151158.pdf")


_KND_OVERLAY_CHECKBOXES = [
    (0, 80.0, 85.0, 100.3, "fulltime_study", 5.0),
    (0, 90.6, 96.0, 175.8, "taxpayer_same_as_student", 5.4),
]

_KND_OVERLAY_BOXED = [
    (0, 69.5, 5.1, "org_inn", 12, 5.02, 12),
    (0, 69.5, 12.9, "org_kpp", 12, 5.04, 9),
    (0, 29.4, 46.0, "cert_number", 12, 5.4, 5),
    (0, 134.4, 45.9, "correction_number", 12, 5.17, 3),
    (0, 184.5, 45.9, "report_year", 12, 5.08, 4),
    (0, 24.9, 141.8, "taxpayer_inn", 12, 5.4, 12),
    (0, 39.3, 158.0, "doc_type_code", 12, 5.3, 2),
    (0, 104.7, 158.0, "doc_series_number", 12, 6.0, 14),
    (0, 94.7, 186.0, "amount", 12, 5.2, 12),
    (0, 44.6, 247.7, "pages_count", 12, 7.6, 2),
    (1, 64.5, 5.2, "org_inn", 12, 5.02, 12),
    (1, 64.5, 12.9, "org_kpp", 12, 5.04, 9),
    (1, 129.7, 64.2, "student_inn", 12, 5.0, 12),
    (1, 39.6, 81.3, "student_doc_type_code", 12, 5.05, 2),
    (1, 104.5, 81.3, "student_doc_series_number", 12, 7.16, 14),
]

_KND_OVERLAY_TEXT_PER_CELL = [
    (0, 4.8, 61.5, "org_name", 12, 4.2, 80),
    (0, 24.9, 114.8, "taxpayer_lastname", 12, 4.2, 35),
    (0, 24.9, 123.8, "taxpayer_firstname", 12, 4.2, 30),
    (0, 24.9, 132.8, "taxpayer_patronymic", 12, 4.2, 40),
    (0, 4.9, 207.1, "confirm_fio", 12, 4.2, 55),
    (1, 24.9, 37.1, "student_lastname", 12, 4.0, 35),
    (1, 24.9, 46.2, "student_firstname", 12, 4.0, 30),
    (1, 24.9, 55.2, "student_patronymic", 12, 4.0, 40),
]

_KND_OVERLAY_DATES_PER_CELL = [
    (0, 129.5, 141.8, 5.1, "taxpayer_dob", 12),
    (0, 39.8, 166.7, 5.1, "doc_issue_date", 12),
    (0, 56.6, 237.4, 5.1, "confirm_date", 12),
    (1, 39.7, 90.3, 5.1, "student_dob", 12),
    (1, 39.7, 90.3, 5.1, "student_doc_issue_date", 12),
    (1, 119.6, 286.3, 5.1, "confirm_date", 12),
]

_KND_Y_OFFSET_MM = 5.0
_PDF_FONT_NAME = "Helvetica"
_PDF_FONT_BOLD = "Helvetica-Bold"


def _register_cyrillic_font() -> None:
    global _PDF_FONT_NAME, _PDF_FONT_BOLD
    if _PDF_FONT_NAME != "Helvetica":
        return
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    candidates = [
        os.path.join(base_path, "fonts", "DejaVuSans.ttf"),
        os.path.join(base_path, "app", "fonts", "DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "Fonts", "arial.ttf"),
    ]
    font_path = None
    for path in candidates:
        if path and os.path.isfile(path):
            font_path = path
            break
    if not font_path:
        return
    try:
        pdfmetrics.registerFont(TTFont("Cyrillic", font_path))
        _PDF_FONT_NAME = "Cyrillic"
        bold_path = font_path.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf").replace("arial.ttf", "arialbd.ttf")
        if os.path.isfile(bold_path):
            pdfmetrics.registerFont(TTFont("CyrillicBold", bold_path))
            _PDF_FONT_BOLD = "CyrillicBold"
        else:
            _PDF_FONT_BOLD = "Cyrillic"
    except Exception:
        pass


def _draw_date_cells(c, x: float, y: float, d: str, cell_w: float = 7 * mm):
    parts = (d or "").replace("-", ".").split(".") if d else []
    day = (parts[0] if len(parts) > 0 else "").zfill(2)[:2]
    month = (parts[1] if len(parts) > 1 else "").zfill(2)[:2]
    year = (parts[2] if len(parts) > 2 else "")[:4]
    c.drawString(x, y, day)
    c.drawString(x + cell_w + 1, y, month)
    c.drawString(x + (cell_w + 1) * 2, y, year)


def _draw_date_per_cell(c, x_pt: float, y_pt: float, date_str: str, cell_w_pt: float, font_name: str, font_size: int) -> None:
    parts = (date_str or "").replace("-", ".").split(".") if date_str else []
    day = (parts[0] if len(parts) > 0 else "").zfill(2)[:2]
    month = (parts[1] if len(parts) > 1 else "").zfill(2)[:2]
    year = (parts[2] if len(parts) > 2 else "")[:4]
    text = f"{day}.{month}.{year}"
    c.setFont(font_name, font_size)
    for index, ch in enumerate(text[:10]):
        try:
            width = c.stringWidth(ch, font_name, font_size)
            c.drawString(x_pt + index * cell_w_pt + (cell_w_pt - width) / 2.0, y_pt, ch)
        except Exception:
            c.drawString(x_pt + index * cell_w_pt, y_pt, ch)


def _draw_string_per_cell(c, x_pt: float, y_pt: float, value: str, cell_w_pt: float, max_chars: int, font_name: str, font_size: int) -> None:
    text = (value or "").strip()[:max_chars]
    c.setFont(font_name, font_size)
    position = 0.0
    for ch in text:
        if ch != " ":
            try:
                width = c.stringWidth(ch, font_name, font_size)
                c.drawString(x_pt + position + (cell_w_pt - width) / 2.0, y_pt, ch)
            except Exception:
                c.drawString(x_pt + position, y_pt, ch)
        position += cell_w_pt


def _format_amount_for_cells(amount_val) -> str:
    if amount_val is None or amount_val == "":
        return "0.00"
    try:
        number = float(str(amount_val).replace(",", ".").replace(" ", ""))
        return f"{number:.2f}"
    except (ValueError, TypeError):
        return "0.00"


def build_tax_deduction_pdf_from_template(template_path: str, data: Dict) -> bytes:
    _register_cyrillic_font()
    reader = PdfReader(template_path)
    page_w_pt = float(reader.pages[0].mediabox.width)
    page_h_pt = float(reader.pages[0].mediabox.height)

    def x_pt(x_mm: float) -> float:
        return x_mm * (page_w_pt / 210.0)

    def y_pt(y_mm_from_top: float) -> float:
        return page_h_pt - y_mm_from_top * (page_h_pt / 297.0)

    def y_pt_adj(y_mm: float) -> float:
        return y_pt(y_mm + _KND_Y_OFFSET_MM)

    pt_per_mm = page_w_pt / 210.0
    for index, page in enumerate(reader.pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=(width, height))
        c.setFont(_PDF_FONT_NAME, 12)
        for (page_index, x_mm, y_mm, key, size, cell_mm, max_ch) in _KND_OVERLAY_BOXED:
            if page_index != index:
                continue
            if key == "amount":
                value = _format_amount_for_cells(data.get(key))
            else:
                value = data.get(key) or ""
                if isinstance(value, (bool, int)):
                    value = str(value)
            if key not in {"doc_series_number", "student_doc_series_number"}:
                value = (value or "").replace(" ", "")[:max_ch]
            else:
                value = (value or "")[:max_ch]
            cell_pt = cell_mm * pt_per_mm
            _draw_string_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), value, cell_pt, max_ch, _PDF_FONT_NAME, size)
        for (page_index, x_mm, y_mm, key, size, cell_mm, max_ch) in _KND_OVERLAY_TEXT_PER_CELL:
            if page_index != index:
                continue
            value = data.get(key) or ""
            if isinstance(value, (bool, int)):
                value = str(value)
            cell_pt = cell_mm * pt_per_mm
            _draw_string_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), value[:max_ch], cell_pt, max_ch, _PDF_FONT_NAME, size)
        for (page_index, x_mm, y_mm, cell_mm, key, size) in _KND_OVERLAY_DATES_PER_CELL:
            if page_index != index:
                continue
            value = data.get(key) or date.today().isoformat()
            cell_pt = cell_mm * pt_per_mm
            _draw_date_per_cell(c, x_pt(x_mm), y_pt_adj(y_mm), value, cell_pt, _PDF_FONT_NAME, size)
        for checkbox in _KND_OVERLAY_CHECKBOXES:
            if len(checkbox) == 6:
                page_index, x_no, x_yes, y_mm, key, cell_w_mm = checkbox
            else:
                page_index, x_no, x_yes, y_mm, key = checkbox
                cell_w_mm = 5.0
            if page_index != index:
                continue
            value = data.get(key)
            c.setFont(_PDF_FONT_NAME, 12)
            cell_w_pt = cell_w_mm * pt_per_mm
            if value is True or value == "1":
                ch = "1"
                x_center = x_pt(x_yes) + (cell_w_pt - c.stringWidth(ch, _PDF_FONT_NAME, 12)) / 2.0
                c.drawString(x_center, y_pt_adj(y_mm), ch)
            elif value is False or value == "0":
                ch = "0"
                x_center = x_pt(x_no) + (cell_w_pt - c.stringWidth(ch, _PDF_FONT_NAME, 12)) / 2.0
                c.drawString(x_center, y_pt_adj(y_mm), ch)
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf)
        page.merge_page(overlay.pages[0])

    out = BytesIO()
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.write(out)
    out.seek(0)
    return out.read()


def build_tax_deduction_pdf_knd(data: Dict) -> bytes:
    _register_cyrillic_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 20 * mm
    right = width - 20 * mm
    row = 5.5 * mm

    def next_y():
        nonlocal y
        y -= row
        return y + row

    y = height - 15 * mm
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 50 * mm, y, "ИНН")
    c.drawString(right - 50 * mm, y - 4 * mm, (data.get("org_inn") or ""))
    c.drawString(right - 20 * mm, y, "КПП")
    c.drawString(right - 20 * mm, y - 4 * mm, (data.get("org_kpp") or ""))
    c.drawString(right - 5 * mm, y, "Стр. 0:01")
    y -= 12 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawCentredString(width / 2, y, "Форма по КНД 1151158")
    y -= 6 * mm
    c.setFont(_PDF_FONT_BOLD, 10)
    c.drawCentredString(width / 2, y, "Справка об оплате образовательных услуг для представления в налоговый орган")
    y -= 10 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, next_y(), "Номер справки")
    c.drawString(left + 45 * mm, y + row, data.get("cert_number") or "")
    c.drawString(left + 90 * mm, y + row, "Номер корректировки")
    c.drawString(left + 130 * mm, y + row, data.get("correction_number") or "")
    next_y()
    c.drawString(left, next_y(), "Отчетный год")
    c.drawString(left + 35 * mm, y + row, data.get("report_year") or "")
    y -= 3 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, next_y(), "Данные образовательной организации / индивидуального предпринимателя,")
    next_y()
    c.drawString(left, next_y(), "осуществляющего образовательную деятельность:")
    y -= 2 * mm
    org_name = (data.get("org_name") or "")[:120]
    for index in range(0, min(len(org_name), 80), 60):
        c.drawString(left, next_y(), org_name[index : index + 60])
    c.drawString(left, next_y(), "(наименование образовательной организации / фамилия, имя, отчество ИП)")
    y -= 2 * mm

    c.drawString(left, next_y(), "Обучение проводилось по очной форме обучения")
    fulltime = data.get("fulltime_study")
    c.drawString(left + 95 * mm, y + row, "0 - нет")
    if fulltime is False or fulltime == "0":
        c.drawString(left + 105 * mm, y + row, "X")
    c.drawString(left + 115 * mm, y + row, "1 - да")
    if fulltime is True or fulltime == "1":
        c.drawString(left + 125 * mm, y + row, "X")
    next_y()
    y -= 3 * mm

    c.drawString(left, next_y(), "Данные физического лица (его супруга/супруги), оплатившего образовательные услуги (далее – налогоплательщик):")
    y -= 2 * mm
    c.drawString(left, next_y(), "Фамилия")
    c.drawString(left + 28 * mm, y + row, (data.get("taxpayer_lastname") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "Имя")
    c.drawString(left + 105 * mm, y + row, (data.get("taxpayer_firstname") or "")[:25])
    next_y()
    c.drawString(left, next_y(), "Отчество")
    c.drawString(left + 28 * mm, y + row, (data.get("taxpayer_patronymic") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "ИНН")
    c.drawString(left + 105 * mm, y + row, (data.get("taxpayer_inn") or "")[:12])
    next_y()
    c.drawString(left, next_y(), "Дата рождения")
    _draw_date_cells(c, left + 38 * mm, y + row, data.get("taxpayer_dob"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, next_y(), "Сведения о документе, удостоверяющем личность:")
    c.drawString(left, next_y(), "Код вида документа")
    c.drawString(left + 45 * mm, y + row, (data.get("doc_type_code") or "")[:5])
    c.drawString(left + 75 * mm, y + row, "Серия и номер")
    c.drawString(left + 105 * mm, y + row, (data.get("doc_series_number") or "")[:25])
    next_y()
    c.drawString(left, next_y(), "Дата выдачи")
    _draw_date_cells(c, left + 32 * mm, y + row, data.get("doc_issue_date"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, next_y(), "Налогоплательщик и обучаемый являются одним лицом")
    same = data.get("taxpayer_same_as_student")
    c.drawString(left + 95 * mm, y + row, "0 - нет")
    if same is False or same == "0":
        c.drawString(left + 105 * mm, y + row, "X")
    c.drawString(left + 115 * mm, y + row, "1 - да")
    if same is True or same == "1":
        c.drawString(left + 125 * mm, y + row, "X")
    next_y()
    y -= 2 * mm

    c.drawString(left, next_y(), "Сумма расходов на оказанные образовательные услуги")
    c.drawString(left + 95 * mm, y + row, (data.get("amount") or "0"))
    y -= 8 * mm

    c.drawString(left, next_y(), "Достоверность и полноту сведений, указанных в настоящей справке, подтверждаю:")
    next_y()
    c.drawString(left, next_y(), (data.get("confirm_fio") or "")[:70])
    c.drawString(left, next_y(), "(фамилия, имя, отчество)")
    c.drawString(left, next_y(), "Подпись _______________________")
    c.drawString(left, next_y(), "Дата")
    _draw_date_cells(c, left + 15 * mm, y + row, data.get("confirm_date") or date.today().isoformat(), 7 * mm)
    next_y()
    c.drawString(left, next_y(), "Справка составлена на")
    c.drawString(left + 55 * mm, y + row, data.get("pages_count") or "2")
    c.drawString(left + 65 * mm, y + row, "страницах")

    c.rect(right - 25 * mm, height - 75 * mm, 22 * mm, 45 * mm)
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 24 * mm, height - 78 * mm, "Зона QR-кода")

    c.setFont(_PDF_FONT_NAME, 7)
    c.drawString(left, 18 * mm, "1 Отчество указывается при наличии (относится ко всем листам документа).")
    c.drawString(left, 14 * mm, "2 ИНН указывается при наличии.")
    c.drawString(left, 10 * mm, "Подготовлено с использованием системы КонсультантПлюс")

    c.showPage()

    y = height - 15 * mm
    c.setFont(_PDF_FONT_NAME, 8)
    c.drawString(right - 50 * mm, y, "ИНН")
    c.drawString(right - 50 * mm, y - 4 * mm, (data.get("org_inn") or ""))
    c.drawString(right - 20 * mm, y, "КПП")
    c.drawString(right - 20 * mm, y - 4 * mm, (data.get("org_kpp") or ""))
    c.drawString(right - 5 * mm, y, "Стр. 0:02")
    y -= 14 * mm

    c.setFont(_PDF_FONT_NAME, 9)
    c.drawString(left, next_y(), "Данные физического лица, которому оказаны образовательные услуги:")
    c.drawString(left, next_y(), "Фамилия")
    c.drawString(left + 28 * mm, y + row, (data.get("student_lastname") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "Имя")
    c.drawString(left + 105 * mm, y + row, (data.get("student_firstname") or "")[:25])
    next_y()
    c.drawString(left, next_y(), "Отчество")
    c.drawString(left + 28 * mm, y + row, (data.get("student_patronymic") or "")[:35])
    c.drawString(left + 95 * mm, y + row, "ИНН")
    c.drawString(left + 105 * mm, y + row, (data.get("student_inn") or "")[:12])
    next_y()
    c.drawString(left, next_y(), "Дата рождения")
    _draw_date_cells(c, left + 38 * mm, y + row, data.get("student_dob"), 7 * mm)
    y -= 3 * mm

    c.drawString(left, next_y(), "Сведения о документе, удостоверяющем личность:")
    c.drawString(left, next_y(), "Код вида документа")
    c.drawString(left + 45 * mm, y + row, (data.get("student_doc_type_code") or "")[:5])
    c.drawString(left + 75 * mm, y + row, "Серия и номер")
    c.drawString(left + 105 * mm, y + row, (data.get("student_doc_series_number") or "")[:25])
    next_y()
    c.drawString(left, next_y(), "Дата выдачи")
    _draw_date_cells(c, left + 32 * mm, y + row, data.get("student_doc_issue_date"), 7 * mm)
    y -= 12 * mm

    c.drawString(left, next_y(), "Достоверность и полноту сведений, указанных на данной странице, подтверждаю:")
    next_y()
    c.drawString(left, next_y(), "Подпись _______________________  Дата")
    _draw_date_cells(c, left + 95 * mm, y + row, data.get("confirm_date") or date.today().isoformat(), 7 * mm)

    c.setFont(_PDF_FONT_NAME, 7)
    c.drawString(left, 10 * mm, "Подготовлено с использованием системы КонсультантПлюс")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
