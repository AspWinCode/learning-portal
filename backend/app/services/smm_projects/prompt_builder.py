"""Собирает системный промпт для генерации постов слоями:

1. глобальные правила безопасности (никогда не выдумывать факты)
2. бренд-профиль проекта (system_prompt/tone_of_voice/brand_context)
3. сниппеты базы знаний проекта
4. правила форматирования по каналам
5. инструкция шаблона
6. пользовательский ввод — добавляется отдельно как user-prompt

Ничего не хардкодится в Python-тексте конкретного проекта — весь контент
живёт в SmmProject/SmmContentTemplate и редактируется owner'ом через UI."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models import SmmContentTemplate, SmmKnowledgeItem, SmmProject
from app.services.smm_projects import knowledge as knowledge_svc

GLOBAL_SAFETY_RULES = (
    "=== ПРАВИЛА ПЛАТФОРМЫ (обязательны всегда) ===\n"
    "Никогда не выдумывай операционные факты: даты, время, адреса, цены, "
    "результаты, имена победителей, контакты, ссылки. Если факта нет в "
    "контексте ниже — пиши плейсхолдер вида [уточнить дату] или аналогичный, "
    "а не правдоподобное предположение. Пиши на языке проекта (см. ниже). "
    "Соблюдай обязательные формулировки бренда и не используй то, что в "
    "запрещённых формулировках."
)

CHANNEL_RULES = {
    "vk": "Подробный текст с нормальными абзацами, CTA и ссылкой при наличии.",
    "telegram": "Короткие абзацы, компактная структура, допустимы эмодзи-маркеры.",
    "instagram": "Сильный opening hook, caption для visual, уместные hashtags и CTA.",
    "max": "Компактный readable пост, CTA и ссылка при наличии.",
}


def _brand_block(project: SmmProject) -> str:
    parts: List[str] = []
    if project.system_prompt:
        parts.append(project.system_prompt.strip())
    if project.audience_description:
        parts.append(f"Аудитория: {project.audience_description.strip()}")
    if project.tone_of_voice:
        parts.append(f"Тон голоса: {project.tone_of_voice.strip()}")

    brand = project.brand_context or {}
    if isinstance(brand, dict):
        from app.services.smm_projects.projects import BRAND_CONTEXT_FIELDS

        for field in BRAND_CONTEXT_FIELDS:
            value = brand.get(field["key"])
            if value:
                parts.append(f"{field['label']}: {value}")

    if not parts:
        return ""
    return f"=== БРЕНД-ПРОФИЛЬ ПРОЕКТА «{project.name}» ===\n" + "\n".join(parts)


def build_system_prompt(
    project: SmmProject,
    template: Optional[SmmContentTemplate],
    knowledge_hits: List[SmmKnowledgeItem],
) -> str:
    blocks = [GLOBAL_SAFETY_RULES]
    brand_block = _brand_block(project)
    if brand_block:
        blocks.append(brand_block)
    knowledge_block = knowledge_svc.as_prompt_block(knowledge_hits)
    if knowledge_block:
        blocks.append(knowledge_block)
    if template and template.description:
        blocks.append(f"=== СЦЕНАРИЙ: {template.name} ===\n{template.description.strip()}")
    blocks.append("=== ПРАВИЛА КАНАЛОВ ===\n" + "\n".join(f"{channel}: {rule}" for channel, rule in CHANNEL_RULES.items()))
    blocks.append(
        "Структурированные сценарии (output_format=json) — верни ТОЛЬКО JSON без markdown-обёртки, "
        "строго с ключами, которые требует задание."
    )
    return "\n\n".join(blocks)


def build_user_prompt(template: SmmContentTemplate, input_data: Dict[str, Any]) -> str:
    try:
        return template.prompt_template.format(**{k: (v if v not in (None, "") else "—") for k, v in input_data.items()})
    except KeyError as exc:
        missing = str(exc).strip("'")
        raise ValueError(f"В задании не хватает поля «{missing}», которое требует шаблон") from exc
