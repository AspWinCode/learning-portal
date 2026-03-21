"""Импорт исходящих MAX (max_messages) в owner_workspace_messages по телефону контакта."""

from typing import Dict, Tuple

from sqlalchemy.orm import Session

from app.models import MaxMessage, OwnerWorkspaceContact, OwnerWorkspaceMessage
from app.utils.phone import normalize_phone


def sync_max_messages_into_owner_workspace(db: Session, *, limit: int = 500) -> Tuple[int, int]:
    """
    Возвращает (imported, skipped).
    Дубликаты: external_message_id = max:<uuid записи max_messages>.
    """
    contacts = db.query(OwnerWorkspaceContact).all()
    phone_to_contact: Dict[str, OwnerWorkspaceContact] = {}
    for c in contacts:
        n = normalize_phone(c.phone or "")
        if n and n not in phone_to_contact:
            phone_to_contact[n] = c
    max_rows = db.query(MaxMessage).order_by(MaxMessage.created_at.desc()).limit(limit).all()
    imported = 0
    skipped = 0
    for m in max_rows:
        if not m.phone:
            skipped += 1
            continue
        n = normalize_phone(m.phone)
        contact = phone_to_contact.get(n)
        if not contact:
            skipped += 1
            continue
        ext_id = f"max:{m.id}"
        exists = (
            db.query(OwnerWorkspaceMessage)
            .filter(OwnerWorkspaceMessage.external_message_id == ext_id)
            .first()
        )
        if exists:
            skipped += 1
            continue
        sent_at = m.sent_at or m.created_at
        body = (m.message or "").strip() or " "
        db.add(
            OwnerWorkspaceMessage(
                contact_id=contact.id,
                external_chat_id=m.chat_id,
                external_message_id=ext_id,
                direction="outgoing",
                text=body,
                attachments=None,
                sent_at=sent_at,
                received_at=None,
            )
        )
        imported += 1
    db.commit()
    return imported, skipped
