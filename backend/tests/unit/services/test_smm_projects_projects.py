from types import SimpleNamespace

from app.services.smm_projects.projects import (
    _slugify, _transliterate, can_use_cross_project_content, content_source_projects,
)


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


def test_only_personal_social_project_can_read_cross_project_content():
    assert can_use_cross_project_content(SimpleNamespace(code="lichny_brand", content_scope="all_projects"))
    assert not can_use_cross_project_content(SimpleNamespace(code="kodarena", content_scope="project_only"))
    assert not can_use_cross_project_content(SimpleNamespace(code="academy", content_scope="project_only"))


def test_personal_social_sources_all_active_projects_but_brands_stay_local():
    local = SimpleNamespace(id=1, code="kodarena", name="КодАрена")
    academy = SimpleNamespace(id=2, code="academy", name="TirSkix Academy")
    personal = SimpleNamespace(id=3, code="lichny_brand", name="Личный бренд", content_scope="all_projects")

    class Query:
        def filter(self, *_):
            return self

        def order_by(self, *_):
            return self

        def all(self):
            return [local, academy, personal]

    class DB:
        def query(self, *_):
            return Query()

    assert content_source_projects(DB(), local) == [local]
    assert content_source_projects(DB(), academy) == [academy]
    assert content_source_projects(DB(), personal) == [local, academy, personal]
