"""LEGO: регрессионные проверки изоляции от Академии (отсутствие смешивания моделей и таблиц)."""
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"

LEGO_MODELS = {
    "LegoStudent",
    "LegoGroup",
    "LegoGroupStudent",
    "LegoLesson",
    "LegoAttendance",
    "LegoPayment",
}
LEGO_FILES = [
    APP / "routers" / "lego.py",
    APP / "services" / "lego_service.py",
    APP / "services" / "lego_payment_status.py",
]
ACADEMY_ROUTERS = [
    "trainer_lessons.py",
    "students.py",
    "groups.py",
    "grades.py",
    "characteristics.py",
    "student_accounts.py",
    "student_portal.py",
    "parent_dashboard.py",
    "programs.py",
    "reports.py",
    "sales_student_cards.py",
    "abonements.py",
]
ACADEMY_SERVICES = ["payment_status.py", "absence_makeup.py", "absence_link_tasks.py"]
ACADEMY_TABLES = {"lesson_attendance", "student_accounts", "student_cards", "lessons", "students", "groups"}
ACADEMY_MODEL_NAMES = {"Student", "StudentCard", "LessonAttendance", "StudentAccount", "Abonement", "AbsenceFollowUp", "Group"}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _imported_names(source: str) -> set:
    names: set = set()
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("from app.models import") or stripped.startswith("from app.services"):
            names.update(part.strip(" ()") for part in stripped.split("import", 1)[1].split(","))
    return names


def test_lego_module_does_not_import_academy_models() -> None:
    for path in LEGO_FILES:
        imported = _imported_names(_read(path))
        leaked = imported & ACADEMY_MODEL_NAMES
        assert not leaked, f"{path.name} imports academy models: {leaked}"


def test_lego_module_does_not_reference_academy_tables_by_foreign_key() -> None:
    for path in LEGO_FILES:
        source = _read(path)
        for table in ACADEMY_TABLES:
            assert f'ForeignKey("{table}.' not in source, f"{path.name} has FK to academy table {table}"
            assert f'__tablename__ = "{table}"' not in source, f"{path.name} redefines academy table {table}"


def test_academy_routers_do_not_reference_lego() -> None:
    for name in ACADEMY_ROUTERS:
        path = APP / "routers" / name
        if not path.exists():
            continue
        source = _read(path)
        assert "lego" not in source.lower(), f"{name} must not reference LEGO"
        for model in LEGO_MODELS:
            assert model not in source, f"{name} references {model}"


def test_academy_payment_services_do_not_reference_lego() -> None:
    for name in ACADEMY_SERVICES:
        path = APP / "services" / name
        if path.exists():
            assert "lego" not in _read(path).lower(), f"{name} must not reference LEGO"


def test_lego_router_has_own_namespace() -> None:
    main_source = _read(APP / "main.py")
    assert 'app.include_router(lego.router, prefix="/api/v1/lego"' in main_source


def test_lego_entities_are_separate_tables() -> None:
    from app.models import LegoAttendance, LegoLesson, LessonAttendance

    assert LegoLesson.__tablename__ != "lessons"
    assert LegoAttendance.__tablename__ != LessonAttendance.__tablename__
    assert LegoAttendance.__tablename__ == "lego_attendance"


def test_lego_student_has_no_foreign_key_to_academy_tables() -> None:
    from app.models import LegoStudent

    targets = {fk.target_fullname for col in LegoStudent.__table__.columns for fk in col.foreign_keys}
    assert not any(t.startswith(("students.", "student_accounts.", "student_cards.")) for t in targets)


def test_lego_payment_books_to_leninets_target_only() -> None:
    source = _read(APP / "services" / "lego_service.py")
    assert "LEGO_TARGET_CODE" in source
    assert "StudentAccount" not in source
    # Финансовая проводка не привязывается к ученику Академии (student_id — колонка FinanceTransaction).
    transaction_block = source.split("tx = FinanceTransaction(", 1)[1].split(")\n", 1)[0]
    assert "student_id" not in transaction_block
    assert "group_id" not in transaction_block
