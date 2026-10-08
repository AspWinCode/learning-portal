from app.models import AiKnowledgeItem, AiWorkspace
from app.services.ai_studio import prompt_builder


def _workspace(**kwargs):
    w = AiWorkspace()
    w.name = "КодАрена"
    w.system_prompt = None
    w.tone_of_voice = None
    w.audience_description = None
    w.brand_context = None
    for k, v in kwargs.items():
        setattr(w, k, v)
    return w


def test_build_consult_system_prompt_always_has_safety_rules():
    prompt = prompt_builder.build_consult_system_prompt(_workspace(), [])
    assert prompt_builder.GLOBAL_SAFETY_RULES in prompt
    assert "не выдумывай" in prompt


def test_build_consult_system_prompt_includes_brand_context_fields():
    ws = _workspace(brand_context={"official_name": "КодАрена", "forbidden_phrasing": "никаких гарантий призов"})
    prompt = prompt_builder.build_consult_system_prompt(ws, [])
    assert "КодАрена" in prompt
    assert "никаких гарантий призов" in prompt


def test_build_consult_system_prompt_includes_knowledge_but_not_other_workspace_data():
    kodarena_prompt = prompt_builder.build_consult_system_prompt(_workspace(), [])
    assert "Академия факт" not in kodarena_prompt

    kodarena_item = AiKnowledgeItem(title="КодАрена факт", content="Турнир в октябре")
    prompt_with_knowledge = prompt_builder.build_consult_system_prompt(_workspace(), [kodarena_item])
    assert "КодАрена факт" in prompt_with_knowledge
    assert "Академия факт" not in prompt_with_knowledge
