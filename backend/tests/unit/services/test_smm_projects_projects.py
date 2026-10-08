from app.services.smm_projects.projects import _slugify, _transliterate


def test_transliterate_cyrillic_to_latin():
    assert _transliterate("Привет") == "privet"
    assert _slugify("Тестовый проект SMM") == "testovyy_proekt_smm"


def test_slugify_uses_underscore_not_dash():
    # code используется как суффикс env-переменных (SMM_VK_TOKEN_<CODE>) —
    # дефисы там недопустимы.
    slug = _slugify("КодАрена — Турниры")
    assert "-" not in slug
    assert slug == "kodarena_turniry"


def test_slugify_falls_back_when_name_has_no_latin_equivalent():
    assert _slugify("!!!") == "project"


def test_slugify_truncates_long_names():
    long_name = "a" * 100
    assert len(_slugify(long_name)) == 48
