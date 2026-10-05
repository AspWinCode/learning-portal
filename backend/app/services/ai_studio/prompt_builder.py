"""Собирает системный промпт слоями (п.21 ТЗ):

1. глобальные правила безопасности платформы (никогда не выдумывать факты)
2. бренд-профиль направления (system_prompt/tone_of_voice/brand_context)
3. сниппеты базы знаний направления
4. инструкция шаблона
5. пользовательский ввод — добавляется отдельно вызывающей стороной как user-prompt

Ничего из этого не хардкодится в Python-тексте конкретного направления —
весь контент, специфичный для КодАрены и т.п., живёт в AiWorkspace/
AiContentTemplate и редактируется owner'ом через API/UI.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models import AiContentTemplate, AiKnowledgeItem, AiWorkspace
from app.services.ai_studio import knowledge as knowledge_svc

GLOBAL_SAFETY_RULES = (
    "=== ПРАВИЛА ПЛАТФОРМЫ (обязательны всегда) ===\n"
    "Никогда не выдумывай операционные факты: даты, время, адреса, цены, "
    "результаты, имена победителей, контакты, ссылки. Если факта нет в "
    "контексте ниже — пиши плейсхолдер вида [уточнить дату] или аналогичный, "
    "а не правдоподобное предположение. Пиши на языке направления (см. ниже). "
    "Соблюдай обязательные формулировки бренда и не используй то, что в "
    "запрещённых формулировках."
)


def _brand_block(workspace: AiWorkspace) -> str:
    parts: List[str] = []
    if workspace.system_prompt:
        parts.append(workspace.system_prompt.strip())
    if workspace.audience_description:
        parts.append(f"Аудитория: {workspace.audience_description.strip()}")
    if workspace.tone_of_voice:
        parts.append(f"Тон голоса: {workspace.tone_of_voice.strip()}")

    brand = workspace.brand_context or {}
    if isinstance(brand, dict):
        from app.services.ai_studio.workspaces import BRAND_CONTEXT_FIELDS

        for field in BRAND_CONTEXT_FIELDS:
            value = brand.get(field["key"])
            if value:
                parts.append(f"{field['label']}: {value}")

    if not parts:
        return ""
    return f"=== БРЕНД-ПРОФИЛЬ НАПРАВЛЕНИЯ «{workspace.name}» ===\n" + "\n".join(parts)


def build_system_prompt(
    workspace: AiWorkspace,
    template: Optional[AiContentTemplate],
    knowledge_hits: List[AiKnowledgeItem],
) -> str:
    blocks = [GLOBAL_SAFETY_RULES]
    brand_block = _brand_block(workspace)
    if brand_block:
        blocks.append(brand_block)
    knowledge_block = knowledge_svc.as_prompt_block(knowledge_hits)
    if knowledge_block:
        blocks.append(knowledge_block)
    if template and template.description:
        blocks.append(f"=== СЦЕНАРИЙ: {template.name} ===\n{template.description.strip()}")
    blocks.append(
        "Структурированные сценарии (output_format=json) — верни ТОЛЬКО JSON без markdown-обёртки, "
        "строго с ключами, которые требует задание."
    )
    return "\n\n".join(blocks)


def build_user_prompt(template: AiContentTemplate, input_data: Dict[str, Any]) -> str:
    try:
        return template.prompt_template.format(**{k: (v if v not in (None, "") else "—") for k, v in input_data.items()})
    except KeyError as exc:
        missing = str(exc).strip("'")
        raise ValueError(f"В задании не хватает поля «{missing}», которое требует шаблон") from exc
