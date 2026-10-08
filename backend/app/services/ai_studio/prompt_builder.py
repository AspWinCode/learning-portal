"""Собирает системный промпт для консультационного режима AI Studio слоями:

1. глобальные правила безопасности (никогда не выдумывать факты)
2. бренд/контекстный профиль направления (system_prompt/tone_of_voice/brand_context)
3. сниппеты базы знаний направления

Генерация постов для публикации (шаблоны, каналы, контент-план) сюда не
входит — это отдельный модуль smm_projects со своим prompt_builder."""
from __future__ import annotations

from typing import List

from app.models import AiKnowledgeItem, AiWorkspace
from app.services.ai_studio import knowledge as knowledge_svc

GLOBAL_SAFETY_RULES = (
    "=== ПРАВИЛА ПЛАТФОРМЫ (обязательны всегда) ===\n"
    "Никогда не выдумывай факты: даты, числа, имена, контакты, ссылки, "
    "результаты. Если факта нет в контексте ниже — прямо скажи, что данных "
    "недостаточно, а не делай правдоподобное предположение. Отвечай на языке "
    "направления (см. ниже), по делу, как аналитик/консультант."
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
    return f"=== КОНТЕКСТ НАПРАВЛЕНИЯ «{workspace.name}» ===\n" + "\n".join(parts)


def build_consult_system_prompt(workspace: AiWorkspace, knowledge_hits: List[AiKnowledgeItem]) -> str:
    blocks = [GLOBAL_SAFETY_RULES]
    brand_block = _brand_block(workspace)
    if brand_block:
        blocks.append(brand_block)
    knowledge_block = knowledge_svc.as_prompt_block(knowledge_hits)
    if knowledge_block:
        blocks.append(knowledge_block)
    return "\n\n".join(blocks)
