"""Консультационный режим AI Studio: «проанализируй направление / ответь на
вопрос», в контексте бренд-профиля и базы знаний конкретного AiWorkspace.

Это read-only аналитика/диалог — ничего не публикует, ничего не планирует.
Автопостинг и генерация контента для публикаций — отдельный модуль
smm_projects, сюда не относится."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import AiDialog, AiMessage, AiWorkspace
from app.services import ai_gateway
from app.services.ai_studio import knowledge as knowledge_svc
from app.services.ai_studio import prompt_builder


def get_dialog(db: Session, workspace: AiWorkspace, dialog_id: int) -> Optional[AiDialog]:
    return (
        db.query(AiDialog)
        .filter(AiDialog.id == dialog_id, AiDialog.workspace_id == workspace.id)
        .first()
    )


def list_dialogs(db: Session, workspace: AiWorkspace, user_id: Optional[int]) -> List[AiDialog]:
    q = db.query(AiDialog).filter(AiDialog.workspace_id == workspace.id)
    if user_id is not None:
        q = q.filter(AiDialog.user_id == user_id)
    return q.order_by(AiDialog.updated_at.desc().nullslast(), AiDialog.created_at.desc()).all()


async def ask(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    message: str,
    dialog_id: Optional[int] = None,
) -> AiMessage:
    message = (message or "").strip()
    if not message:
        raise ValueError("Сообщение не может быть пустым")

    dialog: Optional[AiDialog] = None
    if dialog_id is not None:
        dialog = get_dialog(db, workspace, dialog_id)
        if dialog is None:
            raise ValueError("Диалог не найден в этом направлении")
    if dialog is None:
        dialog = AiDialog(workspace_id=workspace.id, user_id=getattr(user, "id", None), title=message[:120])
        db.add(dialog)
        db.commit()
        db.refresh(dialog)

    db.add(AiMessage(dialog_id=dialog.id, role="user", content=message))
    db.commit()

    knowledge_hits = await knowledge_svc.search(db, workspace, message, user_id=getattr(user, "id", None))
    system_prompt = prompt_builder.build_consult_system_prompt(workspace, knowledge_hits)

    answer = "AI Tunnel недоступен — консультация временно невозможна."
    if ai_gateway.is_configured("text"):
        history = (
            db.query(AiMessage)
            .filter(AiMessage.dialog_id == dialog.id)
            .order_by(AiMessage.id.desc())
            .limit(10)
            .all()
        )
        history.reverse()
        transcript = "\n".join(f"{'Пользователь' if m.role == 'user' else 'Консультант'}: {m.content}" for m in history)
        result = await ai_gateway.complete_text(
            feature=f"ai_studio:{workspace.code}:consult",
            system=system_prompt,
            prompt=transcript,
            temperature=0.4,
            max_tokens=1200,
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            answer = result.text.strip()

    assistant_message = AiMessage(
        dialog_id=dialog.id,
        role="assistant",
        content=answer,
        used_knowledge=[h.title for h in knowledge_hits] or None,
    )
    db.add(assistant_message)
    dialog.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_message)
    return assistant_message
