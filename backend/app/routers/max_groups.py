from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import Group, GroupMessengerLink, GroupStatus, MaxBroadcast, MaxBroadcastTarget, User, UserRole
from app.routers.action_log import log_action
from app.schemas.communications import (
    MaxBroadcastCreateRequest,
    MaxBroadcastResponse,
    MaxBroadcastTargetResponse,
    MaxGroupConnectRequest,
    MaxGroupLinkResponse,
    MaxGroupSendRequest,
)
from app.services.max_client import MaxApiError, get_max_client

router = APIRouter()


def _group(db: Session, group_id: int) -> Group:
    item = db.query(Group).filter(Group.id == group_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    return item


def _own_group_or_permission(group: Group, user: User, permission: str) -> None:
    if auth.has_permission(user, permission):
        return
    if auth.resolve_effective_role(user) == UserRole.TRAINER and group.trainer_id == user.id:
        return
    raise HTTPException(status_code=403, detail="Нет доступа к этой группе")


def _link_response(link: GroupMessengerLink | None, group_id: int):
    if not link:
        return MaxGroupLinkResponse(group_id=group_id, chat_id="", connected=False, is_active=False)
    return MaxGroupLinkResponse(
        group_id=group_id,
        chat_id=link.external_chat_id,
        chat_title=link.external_chat_title,
        connected=bool(link.is_active),
        is_active=bool(link.is_active),
        last_verified_at=link.last_verified_at,
        verification_status=link.last_verification_status,
    )


@router.get("/groups/{group_id}/messengers/max", response_model=MaxGroupLinkResponse)
def get_group_max(group_id: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    _own_group_or_permission(group, user, "groups.access")
    link = db.query(GroupMessengerLink).filter_by(group_id=group_id, provider="max", is_active=True).first()
    return _link_response(link, group_id)


@router.post("/groups/{group_id}/messengers/max/verify", response_model=MaxGroupLinkResponse)
def verify_group_max(group_id: int, payload: MaxGroupConnectRequest, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    _own_group_or_permission(group, user, "groups.messenger_link")
    try:
        chat = get_max_client().verify_chat(payload.chat_id.strip())
    except MaxApiError as exc:
        raise HTTPException(status_code=502 if exc.status_code not in (401, 403, 404) else exc.status_code, detail=str(exc)) from exc
    return {"group_id": group_id, "chat_id": chat.chat_id, "chat_title": chat.title, "connected": False, "is_active": False}


@router.post("/groups/{group_id}/messengers/max/connect", response_model=MaxGroupLinkResponse)
def connect_group_max(group_id: int, payload: MaxGroupConnectRequest, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    if not auth.has_permission(user, "groups.messenger_link"):
        raise HTTPException(status_code=403, detail="Нет права подключать MAX-чаты")
    try:
        chat = get_max_client().verify_chat(payload.chat_id.strip())
    except MaxApiError as exc:
        raise HTTPException(status_code=502 if exc.status_code not in (401, 403, 404) else exc.status_code, detail=str(exc)) from exc
    link = db.query(GroupMessengerLink).filter_by(group_id=group_id, provider="max").first()
    if not link:
        link = GroupMessengerLink(group_id=group_id, provider="max", connected_by_user_id=user.id)
        db.add(link)
    link.external_chat_id = chat.chat_id
    link.external_chat_title = chat.title
    link.is_active = True
    link.last_verified_at = datetime.now(timezone.utc)
    link.last_verification_status = "ok"
    db.commit()
    log_action(db, user.id, "max_chat_connected", "group", group_id, {"provider": "max", "chat_id": chat.chat_id})
    return _link_response(link, group_id)


@router.delete("/groups/{group_id}/messengers/max")
def disconnect_group_max(group_id: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    if not auth.has_permission(user, "groups.messenger_link"):
        raise HTTPException(status_code=403, detail="Нет права отключать MAX-чаты")
    link = db.query(GroupMessengerLink).filter_by(group_id=group_id, provider="max", is_active=True).first()
    if link:
        link.is_active = False
        db.commit()
        log_action(db, user.id, "max_chat_disconnected", "group", group_id, {"provider": "max"})
    return {"connected": False}


@router.get("/groups/{group_id}/messengers/max/members")
def group_max_members(group_id: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    _own_group_or_permission(group, user, "communications.max_send")
    link = db.query(GroupMessengerLink).filter_by(group_id=group_id, provider="max", is_active=True).first()
    if not link:
        raise HTTPException(status_code=409, detail="MAX-чат не подключён")
    try:
        return get_max_client().get_chat_members(link.external_chat_id)
    except MaxApiError as exc:
        raise HTTPException(status_code=502 if exc.status_code not in (401, 403, 404) else exc.status_code, detail=str(exc)) from exc


@router.post("/groups/{group_id}/messengers/max/send")
def send_group_max(group_id: int, payload: MaxGroupSendRequest, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    group = _group(db, group_id)
    _own_group_or_permission(group, user, "communications.max_send")
    link = db.query(GroupMessengerLink).filter_by(group_id=group_id, provider="max", is_active=True).first()
    if not link:
        raise HTTPException(status_code=409, detail="MAX-чат не подключён")
    try:
        message_id = get_max_client().send_message(link.external_chat_id, payload.text.strip())
    except MaxApiError as exc:
        raise HTTPException(status_code=502 if exc.status_code not in (401, 403, 404) else exc.status_code, detail=str(exc)) from exc
    log_action(db, user.id, "max_message_sent", "group", group_id, {"provider": "max", "message_id": message_id})
    return {"success": True, "message_id": message_id}


@router.post("/communications/broadcasts/max", response_model=MaxBroadcastResponse, status_code=status.HTTP_201_CREATED)
def create_max_broadcast(payload: MaxBroadcastCreateRequest, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    auth.ensure_permission(user, "communications.broadcast")
    query = db.query(GroupMessengerLink).join(Group).filter(GroupMessengerLink.provider == "max", GroupMessengerLink.is_active.is_(True))
    if payload.scope == "active_groups":
        query = query.filter(Group.status == GroupStatus.ACTIVE)
    elif not payload.group_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одну группу")
    else:
        query = query.filter(Group.id.in_(payload.group_ids), Group.status == GroupStatus.ACTIVE)
    links = query.options(joinedload(GroupMessengerLink.group)).all()
    if payload.scope == "selected_groups" and len(links) != len(set(payload.group_ids or [])):
        raise HTTPException(status_code=403, detail="Некоторые выбранные группы недоступны или не подключены к MAX")
    if not links:
        raise HTTPException(status_code=400, detail="Нет активных групп с подключённым MAX-чатом")
    broadcast = MaxBroadcast(provider="max", message=payload.text.strip(), created_by=user.id, total_targets=len(links))
    db.add(broadcast)
    db.flush()
    for link in links:
        db.add(MaxBroadcastTarget(broadcast_id=broadcast.id, group_id=link.group_id, external_chat_id=link.external_chat_id, chat_title=link.external_chat_title))
    db.commit()
    db.refresh(broadcast)
    from app.background_tasks import task_max_broadcast_target
    for target in broadcast.targets:
        task_max_broadcast_target.send(target.id)
    log_action(db, user.id, "max_broadcast_created", "max_broadcast", broadcast.id, {"total_targets": len(links)})
    return _serialize_broadcast(broadcast)


@router.get("/communications/broadcasts/max", response_model=list[MaxBroadcastResponse])
def list_max_broadcasts(db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    auth.ensure_permission(user, "communications.access")
    return [_serialize_broadcast(item) for item in db.query(MaxBroadcast).order_by(MaxBroadcast.created_at.desc()).limit(100).all()]


@router.get("/communications/broadcasts/max/{broadcast_id}", response_model=MaxBroadcastResponse)
def get_max_broadcast(broadcast_id: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    auth.ensure_permission(user, "communications.access")
    item = db.query(MaxBroadcast).filter(MaxBroadcast.id == broadcast_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    return _serialize_broadcast(item)


@router.post("/communications/broadcasts/max/{broadcast_id}/retry-failed", response_model=MaxBroadcastResponse)
def retry_failed_max_broadcast(broadcast_id: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_active_user)):
    auth.ensure_permission(user, "communications.broadcast")
    item = db.query(MaxBroadcast).filter(MaxBroadcast.id == broadcast_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    failed = [target for target in item.targets if target.status == "failed"]
    if not failed:
        return _serialize_broadcast(item)
    for target in failed:
        target.status = "pending"
        target.last_error = None
    item.status = "pending"
    item.finished_at = None
    db.commit()
    from app.background_tasks import task_max_broadcast_target
    for target in failed:
        task_max_broadcast_target.send(target.id)
    log_action(db, user.id, "max_broadcast_retried", "max_broadcast", item.id, {"targets": len(failed)})
    return _serialize_broadcast(item)


def _serialize_broadcast(item: MaxBroadcast):
    return MaxBroadcastResponse(
        id=item.id, status=item.status, text=item.message, total_targets=item.total_targets,
        success_count=item.success_count, failed_count=item.failed_count, created_at=item.created_at,
        targets=[MaxBroadcastTargetResponse(id=t.id, group_id=t.group_id, chat_title=t.chat_title, status=t.status, attempts=t.attempts, last_error=t.last_error, sent_at=t.sent_at) for t in item.targets],
    )
