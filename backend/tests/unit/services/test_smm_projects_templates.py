import pytest

from app.services.smm_projects.templates import DEFAULT_TEMPLATES


def test_default_template_codes_are_unique():
    codes = [t["code"] for t in DEFAULT_TEMPLATES]
    assert len(codes) == len(set(codes))


@pytest.mark.parametrize("spec", DEFAULT_TEMPLATES, ids=lambda spec: spec["code"])
def test_prompt_placeholders_match_input_schema_fields(spec):
    """build_user_prompt() does template.prompt_template.format(**input_data)
    with one key per schema field — a placeholder without a matching field
    (or vice versa) raises ValueError("не хватает поля") at generation time
    instead of at review time."""
    fields = {f["key"] for f in spec["input_schema_json"]["fields"]}
    spec["prompt_template"].format(**{key: "-" for key in fields})
