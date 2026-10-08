"""Генерация и быстрые AI-действия над уже сгенерированным контентом.

Всегда через app.services.ai_gateway (никаких прямых вызовов провайдеров) —
feature помечается как "ai_studio:<workspace_code>:<template_code>", чтобы
AiGatewayCallLog позволял считать расход токенов по направлению отдельно.
AI никогда не публикует сама — результат всегда сохраняется как
AiGeneratedContent со статусом draft, дальше человек решает approve/archive.

group_key объединяет мультиканальные версии одного материала и материалы
одного «пакета по событию» (п.12/26 ТЗ) — проставляется при первой генерации
и наследуется потомками (transform/variant), чтобы их можно было найти одним
запросом (см. app.routers.ai_studio: GET /content/{id}/related).
"""
from __future__ import annotations

import uuid
import json
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AiContentTemplate, AiGeneratedContent, AiGeneratedContentStatus, AiWorkspace
from app.services import ai_gateway
from app.services.ai_studio import knowledge as knowledge_svc
from app.services.ai_studio import prompt_builder

TRANSFORM_ACTIONS: Dict[str, str] = {
    "shorter": "Сократи текст, сохранив смысл и факты. Не придумывай новые детали.",
    "livelier": "Сделай текст живее и эмоциональнее, сохранив все факты без изменений.",
    "more_emotional": "Добавь больше эмоций и вовлечённости, не меняя фактов.",
    "more_official": "Сделай тон более официальным и сдержанным, факты не меняй.",
    "for_parents": "Адаптируй текст для родителей: спокойный, информативный тон, подробности по организации.",
    "for_teens": "Адаптируй текст для подростковой аудитории: живее, без канцелярита.",
    "for_vk": "Адаптируй текст под формат постов VK.",
    "for_telegram": "Адаптируй текст под формат постов Telegram (короче абзацы, можно эмодзи-маркеры).",
    "add_cta": "Добавь ясный призыв к действию (CTA) в конец текста, если его ещё нет.",
    "remove_ad_tone": "Убери рекламный/навязчивый тон, сделай текст более естественным и дружелюбным.",
    "three_variants": "Предложи 3 альтернативные версии этого текста, пронумеруй их.",
}

CHANNEL_ADAPTATION_HINT: Dict[str, str] = {
    "vk": "Адаптируй текст под формат постов VK.",
    "telegram": "Адаптируй текст под формат постов Telegram (короче абзацы, можно эмодзи-маркеры).",
    "site": "Адаптируй текст под новость/страницу сайта (более развёрнуто, нейтральный тон).",
    "email": "Адаптируй текст под письмо для рассылки (приветствие, структура, подпись).",
    "short": "Сократи и адаптируй под очень короткий формат (сторис/Shorts-подпись).",
    "instagram": "Сделай caption для Instagram: сильный opening hook, короткие абзацы, CTA и уместные hashtags без новых фактов.",
    "max": "Сделай компактный и легко читаемый пост для MAX с CTA и ссылкой при наличии.",
}


def _structured_output(raw: str) -> tuple[str, Optional[Dict[str, Any]]]:
    """Keep output_text compatible while exposing structured fields to UI/assets."""
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return raw, None
    if not isinstance(value, dict):
        return raw, None
    parts = [str(value.get(key) or "").strip() for key in ("hook", "body", "cta")]
    hashtags = value.get("hashtags") or []
    if hashtags:
        parts.append(" ".join(str(tag) if str(tag).startswith("#") else f"#{tag}" for tag in hashtags))
    final_text = "\n\n".join(part for part in parts if part)
    return final_text or raw, value

# Пакет материалов «из события» (п.12 ТЗ): одна генерация → несколько готовых
# материалов, связанных одним group_key. Сами факты не выдумываются — это
# ответственность промпта (GLOBAL_SAFETY_RULES), а не кода.
EVENT_PACK_ITEMS: List[Dict[str, str]] = [
    {"key": "vk_post", "channel": "vk", "content_type": "event_post", "name": "Пост VK",
     "instruction": "Напиши пост для VK по итогам мероприятия."},
    {"key": "telegram_post", "channel": "telegram", "content_type": "event_post", "name": "Пост Telegram",
     "instruction": "Напиши пост для Telegram по итогам мероприятия."},
    {"key": "short_post", "channel": "short", "content_type": "event_post", "name": "Короткий пост",
     "instruction": "Напиши очень короткую версию поста (для Stories/Shorts-подписи)."},
    {"key": "site_news", "channel": "site", "content_type": "news", "name": "Новость на сайт",
     "instruction": "Напиши новость для сайта по итогам мероприятия: более развёрнуто и нейтрально."},
    {"key": "partner_thanks", "channel": "universal", "content_type": "partner_thanks", "name": "Благодарность партнёрам",
     "instruction": "Напиши благодарность партнёрам мероприятия (если партнёры указаны в фактах; если нет — напиши нейтральный текст без выдуманных партнёров)."},
    {"key": "parent_text", "channel": "universal", "content_type": "parent_material", "name": "Текст для родителей",
     "instruction": "Напиши текст для родителей по итогам мероприятия: спокойный, информативный тон."},
    {"key": "photo_caption", "channel": "universal", "content_type": "caption", "name": "Подпись к фото",
     "instruction": "Напиши короткую подпись к фото с мероприятия."},
    {"key": "cover_image_prompt", "channel": "universal", "content_type": "image_prompt", "name": "Промпт для обложки",
     "instruction": "Составь текстовый промпт для генератора изображений — обложка по мотивам этого мероприятия, в стиле бренда направления."},
]


async def _complete(
    *,
    feature: str,
    system_prompt: str,
    user_prompt: str,
    user,
    json_mode: bool = False,
    fallback: str,
) -> tuple[str, Optional[str], Optional[str]]:
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=feature,
            system=system_prompt,
            prompt=user_prompt,
            json_mode=json_mode,
            temperature=0.6,
            max_tokens=1400,
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            return result.text.strip(), result.provider, result.model
    return fallback, None, None


async def generate(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    template: AiContentTemplate,
    input_data: Dict[str, Any],
) -> AiGeneratedContent:
    required = [
        f["key"]
        for f in (template.input_schema_json or {}).get("fields", [])
        if f.get("required")
    ]
    missing = [key for key in required if not str(input_data.get(key) or "").strip()]
    if missing:
        raise ValueError(f"Не заполнены обязательные поля: {', '.join(missing)}")

    query_text = " ".join(str(v) for v in input_data.values() if v)
    knowledge_hits = await knowledge_svc.search(db, workspace, query_text)
    system_prompt = prompt_builder.build_system_prompt(workspace, template, knowledge_hits)
    user_prompt = prompt_builder.build_user_prompt(template, input_data)

    raw_output, provider, model = await _complete(
        feature=f"ai_studio:{workspace.code}:{template.code}",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        user=user,
        json_mode=(template.output_format == "json"),
        fallback=f"[AI Tunnel недоступен] Черновик по шаблону «{template.name}»: {query_text}",
    )
    output_text, output_json = _structured_output(raw_output)

    title = str(input_data.get("title") or input_data.get("topic") or template.name)[:256]
    content = AiGeneratedContent(
        workspace_id=workspace.id,
        template_id=template.id,
        created_by_id=getattr(user, "id", None),
        title=title,
        input_json=input_data,
        prompt_text=user_prompt,
        output_text=output_text,
        output_json=output_json,
        provider=provider,
        model=model,
        status=AiGeneratedContentStatus.DRAFT.value,
        group_key=uuid.uuid4().hex,
    )
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


async def transform(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    source: AiGeneratedContent,
    action: str,
    channel: Optional[str] = None,
) -> AiGeneratedContent:
    if action not in TRANSFORM_ACTIONS:
        raise ValueError(f"Неизвестное действие «{action}». Доступны: {', '.join(TRANSFORM_ACTIONS)}")
    return await _rewrite(
        db, user, workspace=workspace, source=source,
        instruction=TRANSFORM_ACTIONS[action],
        feature=f"ai_studio:{workspace.code}:transform:{action}",
        input_meta={"transform_action": action, "source_content_id": source.id},
        channel=channel,
    )


async def create_variant(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    source: AiGeneratedContent,
    channel: str,
) -> AiGeneratedContent:
    """«Сделать версию для <канала>» (п.26 ТЗ) — явная мультиканальная версия,
    в отличие от transform(for_vk/...) всегда проставляет channel и считается
    отдельной версией материала (не правкой тона)."""
    instruction = CHANNEL_ADAPTATION_HINT.get(
        channel, f"Адаптируй текст под канал «{channel}», сохранив все факты без изменений."
    )
    return await _rewrite(
        db, user, workspace=workspace, source=source,
        instruction=instruction,
        feature=f"ai_studio:{workspace.code}:variant:{channel}",
        input_meta={"variant_channel": channel, "source_content_id": source.id},
        channel=channel,
    )


async def _rewrite(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    source: AiGeneratedContent,
    instruction: str,
    feature: str,
    input_meta: Dict[str, Any],
    channel: Optional[str] = None,
) -> AiGeneratedContent:
    template = None
    if source.template_id:
        template = db.query(AiContentTemplate).filter(AiContentTemplate.id == source.template_id).first()

    knowledge_hits = await knowledge_svc.search(db, workspace, source.title or "")
    system_prompt = prompt_builder.build_system_prompt(workspace, template, knowledge_hits)
    user_prompt = f"{instruction}\n\nИсходный текст:\n{source.output_text}"

    raw_output, provider, model = await _complete(
        feature=feature,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        user=user,
        fallback=source.output_text or "",
    )
    output_text, output_json = _structured_output(raw_output)

    content = AiGeneratedContent(
        workspace_id=workspace.id,
        template_id=source.template_id,
        parent_content_id=source.id,
        created_by_id=getattr(user, "id", None),
        title=source.title,
        input_json=input_meta,
        prompt_text=user_prompt,
        output_text=output_text,
        output_json=output_json,
        provider=provider,
        model=model,
        status=AiGeneratedContentStatus.DRAFT.value,
        channel=channel or source.channel,
        group_key=source.group_key or uuid.uuid4().hex,
    )
    if not source.group_key:
        source.group_key = content.group_key
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


async def event_pack(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    event_data: Dict[str, Any],
) -> List[AiGeneratedContent]:
    """«Создать материалы по событию» (п.12 ТЗ): один вызов → пакет из 8
    связанных материалов (group_key общий). event_data — произвольные факты
    события (название, дата, место, участники, результаты, победители,
    партнёры, ссылки/фото) — передаются в промпт как есть, без домысливания."""
    event_name = str(event_data.get("event_name") or event_data.get("title") or "Мероприятие")
    facts_lines = [f"{key}: {value}" for key, value in event_data.items() if str(value or "").strip()]
    facts_block = "Факты о мероприятии:\n" + "\n".join(facts_lines) if facts_lines else "Факты о мероприятии не предоставлены."

    knowledge_hits = await knowledge_svc.search(db, workspace, event_name)
    system_prompt = prompt_builder.build_system_prompt(workspace, None, knowledge_hits)

    group_key = uuid.uuid4().hex
    created: List[AiGeneratedContent] = []
    for item in EVENT_PACK_ITEMS:
        user_prompt = f"{item['instruction']}\n\n{facts_block}"
        output_text, provider, model = await _complete(
            feature=f"ai_studio:{workspace.code}:event_pack:{item['key']}",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            user=user,
            fallback=f"[AI Tunnel недоступен] {item['name']}: {event_name}",
        )
        content = AiGeneratedContent(
            workspace_id=workspace.id,
            created_by_id=getattr(user, "id", None),
            title=f"{item['name']}: {event_name}"[:256],
            input_json={**event_data, "event_pack_item": item["key"]},
            prompt_text=user_prompt,
            output_text=output_text,
            provider=provider,
            model=model,
            status=AiGeneratedContentStatus.DRAFT.value,
            channel=item["channel"],
            group_key=group_key,
        )
        db.add(content)
        created.append(content)
    db.commit()
    for content in created:
        db.refresh(content)
    return created
