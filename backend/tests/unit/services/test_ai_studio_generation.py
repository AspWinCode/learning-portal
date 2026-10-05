import pytest

from app.models import AiContentTemplate, AiWorkspace
from app.services.ai_studio import generation


def _template():
    tpl = AiContentTemplate()
    tpl.id = 1
    tpl.code = "event_announcement"
    tpl.name = "Анонс мероприятия"
    tpl.prompt_template = "Название: {title}"
    tpl.output_format = "json"
    tpl.input_schema_json = {"fields": [{"key": "title", "label": "Название", "type": "text", "required": True}]}
    return tpl


def _workspace():
    w = AiWorkspace()
    w.id = 2
    w.code = "kodarena"
    return w


@pytest.mark.asyncio
async def test_generate_rejects_missing_required_fields():
    with pytest.raises(ValueError, match="title"):
        await generation.generate(
            db=None,
            user=object(),
            workspace=_workspace(),
            template=_template(),
            input_data={},
        )


@pytest.mark.asyncio
async def test_transform_rejects_unknown_action():
    from app.models import AiGeneratedContent

    source = AiGeneratedContent()
    source.id = 5
    source.template_id = None
    source.output_text = "текст"
    source.title = "т"
    source.channel = None

    with pytest.raises(ValueError, match="Неизвестное действие"):
        await generation.transform(
            db=None,
            user=object(),
            workspace=_workspace(),
            source=source,
            action="not_a_real_action",
        )
