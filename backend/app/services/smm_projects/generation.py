"""Генерация и быстрые AI-действия над уже сгенерированным контентом.

Всегда через app.services.ai_gateway — feature помечается как
"smm_projects:<project_code>:<template_code>", чтобы AiGatewayCallLog
позволял считать расход токенов по проекту отдельно. generate()/transform()/
create_variant()/event_pack() только создают SmmContent со статусом draft —
публикация (ручная или по плану) обрабатывается отдельно в publishing.py.

group_key объединяет мультиканальные версии одного материала и материалы
одного «пакета по событию» — проставляется при первой генерации и
наследуется потомками (transform/variant)."""
from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import SmmContent, SmmContentStatus, SmmContentTemplate, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import prompt_builder

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
    "instagram": "Сделай caption для Instagram: сильный opening hook, короткие абзацы, CTA и уместные hashtags без новых фактов.",
    "max": "Сделай компактный и легко читаемый пост для MAX с CTA и ссылкой при наличии.",
}

EVENT_PACK_ITEMS: List[Dict[str, str]] = [
    {"key": "vk_post", "channel": "vk", "content_type": "event_post", "name": "Пост VK",
     "instruction": "Напиши пост для VK по итогам мероприятия."},
    {"key": "telegram_post", "channel": "telegram", "content_type": "event_post", "name": "Пост Telegram",
     "instruction": "Напиши пост для Telegram по итогам мероприятия."},
    {"key": "short_post", "channel": "instagram", "content_type": "event_post", "name": "Короткий пост",
     "instruction": "Напиши очень короткую версию поста (для Stories/Shorts-подписи)."},
    {"key": "site_news", "channel": "universal", "content_type": "news", "name": "Новость на сайт",
     "instruction": "Напиши новость для сайта по итогам мероприятия: более развёрнуто и нейтрально."},
    {"key": "partner_thanks", "channel": "universal", "content_type": "partner_thanks", "name": "Благодарность партнёрам",
     "instruction": "Напиши благодарность партнёрам мероприятия (если партнёры указаны в фактах; если нет — напиши нейтральный текст без выдуманных партнёров)."},
    {"key": "parent_text", "channel": "universal", "content_type": "parent_material", "name": "Текст для родителей",
     "instruction": "Напиши текст для родителей по итогам мероприятия: спокойный, информативный тон."},
    {"key": "photo_caption", "channel": "universal", "content_type": "caption", "name": "Подпись к фото",
     "instruction": "Напиши короткую подпись к фото с мероприятия."},
    {"key": "cover_image_prompt", "channel": "universal", "content_type": "image_prompt", "name": "Промпт для обложки",
     "instruction": "Составь текстовый промпт для генератора изображений — обложка по мотивам этого мероприятия, в стиле бренда проекта."},
]

_VK_SERVICE_LINE_RE = re.compile(r"^\s*#\s*(?:пост\s+для\s+(?:вконтакте|vk|вк))\s*$", re.IGNORECASE)


def _unicode_bold(value: str) -> str:
    """Use Unicode bold for characters supported by VK's plain-text API.

    VK wall.post accepts plain text rather than rich text/Markdown. Latin
    letters and digits have mathematical-bold Unicode variants; Cyrillic does
    not, so unsupported characters are kept as-is while Markdown markers are
    still removed.
    """
    result: List[str] = []
    for char in value:
        codepoint = ord(char)
        if "A" <= char <= "Z":
            result.append(chr(0x1D400 + codepoint - ord("A")))
        elif "a" <= char <= "z":
            result.append(chr(0x1D41A + codepoint - ord("a")))
        elif "0" <= char <= "9":
            result.append(chr(0x1D7CE + codepoint - ord("0")))
        else:
            result.append(char)
    return "".join(result)


def prepare_publication_text(text: str, channel: Optional[str] = None) -> str:
    """Prepare generated/editor text for a social network's plain-text API."""
    if not text:
        return ""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    lines = [line for line in lines if not _VK_SERVICE_LINE_RE.match(line)]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"^\s*---\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\*\*\*(.+?)\*\*\*", lambda match: _unicode_bold(match.group(1)), cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"\*\*(.+?)\*\*", lambda match: _unicode_bold(match.group(1)), cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"__(.+?)__", r"\1", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", cleaned)
    cleaned = re.sub(r"(?<!_)_([^_\n]+)_(?!_)", r"\1", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def humanize_structured_output(value: Any, fallback: str = "") -> str:
    """Convert the model's JSON envelope into text suitable for a social post.

    Models often return the actual post under ``content.text``/``content.body``
    while keeping planning metadata next to it.  That metadata must never be
    sent to a social network or shown as the publication body.
    """
    if not isinstance(value, dict):
        return fallback

    content = value.get("content")
    source = content if isinstance(content, dict) else value
    parts: List[str] = []
    title = source.get("title") or value.get("title")
    if title:
        parts.append(str(title).strip())

    for key in ("hook", "text", "body", "caption", "description", "content"):
        candidate = source.get(key)
        if isinstance(candidate, str) and candidate.strip() and candidate.strip() not in parts:
            parts.append(candidate.strip())

    cta = value.get("cta")
    if isinstance(cta, str) and cta.strip() and cta.strip() not in parts:
        parts.append(cta.strip())
    hashtags = source.get("hashtags") or value.get("hashtags") or []
    if isinstance(hashtags, str):
        hashtags = hashtags.split()
    if isinstance(hashtags, list):
        tags = " ".join(str(tag) if str(tag).startswith("#") else f"#{tag}" for tag in hashtags if str(tag).strip())
        if tags:
            parts.append(tags)
    return "\n\n".join(parts) or fallback


_CODE_FENCE_RE = re.compile(r"^\s*```(?:\w+)?\s*\n?(.*?)\n?\s*```\s*$", re.DOTALL)


def _strip_code_fence(raw: str) -> str:
    """Some models wrap json_mode output in a ```json ... ``` fence anyway —
    strip it so json.loads sees the actual payload instead of falling back to
    the fenced text (which would otherwise get published verbatim, braces and
    all)."""
    match = _CODE_FENCE_RE.match(raw)
    return match.group(1) if match else raw


def _structured_output(raw: str) -> tuple[str, Optional[Dict[str, Any]]]:
    try:
        value = json.loads(_strip_code_fence(raw))
    except (TypeError, ValueError):
        return raw, None
    if not isinstance(value, dict):
        return raw, None
    final_text = humanize_structured_output(value, fallback=raw)
    return final_text or raw, value


async def _complete(
    *, feature: str, system_prompt: str, user_prompt: str, user, json_mode: bool = False, fallback: str,
) -> tuple[str, Optional[str], Optional[str]]:
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=feature, system=system_prompt, prompt=user_prompt, json_mode=json_mode,
            temperature=0.6, max_tokens=1400, user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            return result.text.strip(), result.provider, result.model
    return fallback, None, None


async def generate(
    db: Session, user, *, project: SmmProject, template: SmmContentTemplate, input_data: Dict[str, Any],
    auto_generated: bool = False,
) -> SmmContent:
    required = [f["key"] for f in (template.input_schema_json or {}).get("fields", []) if f.get("required")]
    missing = [key for key in required if not str(input_data.get(key) or "").strip()]
    if missing:
        raise ValueError(f"Не заполнены обязательные поля: {', '.join(missing)}")

    query_text = " ".join(str(v) for v in input_data.values() if v)
    knowledge_hits = await knowledge_svc.search(db, project, query_text)
    system_prompt = prompt_builder.build_system_prompt(project, template, knowledge_hits)
    user_prompt = prompt_builder.build_user_prompt(template, input_data)

    raw_output, provider, model = await _complete(
        feature=f"smm_projects:{project.code}:{template.code}",
        system_prompt=system_prompt, user_prompt=user_prompt, user=user,
        json_mode=(template.output_format == "json"),
        fallback=f"[AI Tunnel недоступен] Черновик по шаблону «{template.name}»: {query_text}",
    )
    output_text, output_json = _structured_output(raw_output)

    title = str(input_data.get("title") or input_data.get("topic") or template.name)[:256]
    content = SmmContent(
        project_id=project.id, template_id=template.id, created_by_id=getattr(user, "id", None),
        title=title, input_json=input_data, prompt_text=user_prompt, output_text=output_text,
        output_json=output_json, provider=provider, model=model, status=SmmContentStatus.DRAFT.value,
        group_key=uuid.uuid4().hex, auto_generated=auto_generated,
    )
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


async def transform(
    db: Session, user, *, project: SmmProject, source: SmmContent, action: str, channel: Optional[str] = None,
) -> SmmContent:
    if action not in TRANSFORM_ACTIONS:
        raise ValueError(f"Неизвестное действие «{action}». Доступны: {', '.join(TRANSFORM_ACTIONS)}")
    return await _rewrite(
        db, user, project=project, source=source, instruction=TRANSFORM_ACTIONS[action],
        feature=f"smm_projects:{project.code}:transform:{action}",
        input_meta={"transform_action": action, "source_content_id": source.id}, channel=channel,
    )


async def create_variant(db: Session, user, *, project: SmmProject, source: SmmContent, channel: str) -> SmmContent:
    instruction = CHANNEL_ADAPTATION_HINT.get(
        channel, f"Адаптируй текст под канал «{channel}», сохранив все факты без изменений."
    )
    return await _rewrite(
        db, user, project=project, source=source, instruction=instruction,
        feature=f"smm_projects:{project.code}:variant:{channel}",
        input_meta={"variant_channel": channel, "source_content_id": source.id}, channel=channel,
    )


async def _rewrite(
    db: Session, user, *, project: SmmProject, source: SmmContent, instruction: str, feature: str,
    input_meta: Dict[str, Any], channel: Optional[str] = None,
) -> SmmContent:
    template = None
    if source.template_id:
        template = db.query(SmmContentTemplate).filter(SmmContentTemplate.id == source.template_id).first()

    knowledge_hits = await knowledge_svc.search(db, project, source.title or "")
    system_prompt = prompt_builder.build_system_prompt(project, template, knowledge_hits)
    user_prompt = f"{instruction}\n\nИсходный текст:\n{source.output_text}"

    raw_output, provider, model = await _complete(
        feature=feature, system_prompt=system_prompt, user_prompt=user_prompt, user=user,
        fallback=source.output_text or "",
    )
    output_text, output_json = _structured_output(raw_output)

    content = SmmContent(
        project_id=project.id, template_id=source.template_id, parent_content_id=source.id,
        created_by_id=getattr(user, "id", None), title=source.title, input_json=input_meta,
        prompt_text=user_prompt, output_text=output_text, output_json=output_json, provider=provider, model=model,
        status=SmmContentStatus.DRAFT.value, channel=channel or source.channel,
        group_key=source.group_key or uuid.uuid4().hex,
    )
    if not source.group_key:
        source.group_key = content.group_key
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


async def event_pack(db: Session, user, *, project: SmmProject, event_data: Dict[str, Any]) -> List[SmmContent]:
    """«Создать материалы по событию»: один вызов → пакет из 8 связанных
    материалов (group_key общий). event_data передаётся в промпт как есть,
    без домысливания фактов."""
    event_name = str(event_data.get("event_name") or event_data.get("title") or "Мероприятие")
    facts_lines = [f"{key}: {value}" for key, value in event_data.items() if str(value or "").strip()]
    facts_block = "Факты о мероприятии:\n" + "\n".join(facts_lines) if facts_lines else "Факты о мероприятии не предоставлены."

    knowledge_hits = await knowledge_svc.search(db, project, event_name)
    system_prompt = prompt_builder.build_system_prompt(project, None, knowledge_hits)

    group_key = uuid.uuid4().hex
    created: List[SmmContent] = []
    for item in EVENT_PACK_ITEMS:
        user_prompt = f"{item['instruction']}\n\n{facts_block}"
        output_text, provider, model = await _complete(
            feature=f"smm_projects:{project.code}:event_pack:{item['key']}",
            system_prompt=system_prompt, user_prompt=user_prompt, user=user,
            fallback=f"[AI Tunnel недоступен] {item['name']}: {event_name}",
        )
        content = SmmContent(
            project_id=project.id, created_by_id=getattr(user, "id", None),
            title=f"{item['name']}: {event_name}"[:256], input_json={**event_data, "event_pack_item": item["key"]},
            prompt_text=user_prompt, output_text=output_text, provider=provider, model=model,
            status=SmmContentStatus.DRAFT.value, channel=item["channel"], group_key=group_key,
        )
        db.add(content)
        created.append(content)
    db.commit()
    for content in created:
        db.refresh(content)
    return created
