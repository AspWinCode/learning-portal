"""Генерация и быстрые AI-действия над уже сгенерированным контентом.

Всегда через app.services.ai_gateway (никаких прямых вызовов провайдеров) —
feature помечается как "ai_studio:<workspace_code>:<template_code>", чтобы
AiGatewayCallLog позволял считать расход токенов по направлению отдельно.
AI никогда не публикует сама — результат всегда сохраняется как
AiGeneratedContent со статусом draft, дальше человек решает approve/archive.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

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
    knowledge_hits = knowledge_svc.search(db, workspace, query_text)
    system_prompt = prompt_builder.build_system_prompt(workspace, template, knowledge_hits)
    user_prompt = prompt_builder.build_user_prompt(template, input_data)

    output_text = ""
    provider = None
    model = None
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=f"ai_studio:{workspace.code}:{template.code}",
            system=system_prompt,
            prompt=user_prompt,
            json_mode=(template.output_format == "json"),
            temperature=0.6,
            max_tokens=1400,
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            output_text = result.text.strip()
            provider = result.provider
            model = result.model
    if not output_text:
        output_text = f"[AI Tunnel недоступен] Черновик по шаблону «{template.name}»: {query_text}"

    title = str(input_data.get("title") or input_data.get("topic") or template.name)[:256]
    content = AiGeneratedContent(
        workspace_id=workspace.id,
        template_id=template.id,
        created_by_id=getattr(user, "id", None),
        title=title,
        input_json=input_data,
        prompt_text=user_prompt,
        output_text=output_text,
        provider=provider,
        model=model,
        status=AiGeneratedContentStatus.DRAFT.value,
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

    template = None
    if source.template_id:
        template = db.query(AiContentTemplate).filter(AiContentTemplate.id == source.template_id).first()

    knowledge_hits = knowledge_svc.search(db, workspace, source.title or "")
    system_prompt = prompt_builder.build_system_prompt(workspace, template, knowledge_hits)
    user_prompt = (
        f"{TRANSFORM_ACTIONS[action]}\n\nИсходный текст:\n{source.output_text}"
    )

    output_text = ""
    provider = None
    model = None
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=f"ai_studio:{workspace.code}:transform:{action}",
            system=system_prompt,
            prompt=user_prompt,
            json_mode=False,
            temperature=0.5,
            max_tokens=1400,
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            output_text = result.text.strip()
            provider = result.provider
            model = result.model
    if not output_text:
        output_text = source.output_text

    content = AiGeneratedContent(
        workspace_id=workspace.id,
        template_id=source.template_id,
        parent_content_id=source.id,
        created_by_id=getattr(user, "id", None),
        title=source.title,
        input_json={"transform_action": action, "source_content_id": source.id},
        prompt_text=user_prompt,
        output_text=output_text,
        provider=provider,
        model=model,
        status=AiGeneratedContentStatus.DRAFT.value,
        channel=channel or source.channel,
    )
    db.add(content)
    db.commit()
    db.refresh(content)
    return content
