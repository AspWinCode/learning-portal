from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from app.database import get_db
from app import auth
from app.models import AppSetting, User
from app.schemas import LogoResponse, LogoUpdate


router = APIRouter()

LOGO_KEY = "site_logo_data_url"
DISTRICTS_KEY = "b2b_districts"
REFUSED_REASONS_KEY = "sales_refused_reasons"
OWNER_WS_TASK_CONFIG_KEY = "owner_workspace_task_config"
OWNER_WS_PROJECT_CONFIG_KEY = "owner_workspace_project_config"
OWNER_WS_PERMISSION_POLICY_KEY = "owner_workspace_permission_policy"
OWNER_WS_NOTIFICATION_CONFIG_KEY = "owner_workspace_notification_config"
OWNER_WS_TASK_TAGS_KEY = "owner_workspace_task_tag_dictionary"
OWNER_WS_CONTACT_TAGS_KEY = "owner_workspace_contact_tag_dictionary"

DEFAULT_OWNER_WS_TASK_CONFIG = {
    "statuses": [
        {"key": "new", "label": "Новая"},
        {"key": "in_progress", "label": "В работе"},
        {"key": "waiting", "label": "Ожидание"},
        {"key": "completed", "label": "Завершена"},
        {"key": "cancelled", "label": "Отменена"},
    ],
    "priorities": [
        {"key": "low", "label": "Низкий"},
        {"key": "medium", "label": "Средний"},
        {"key": "high", "label": "Высокий"},
        {"key": "critical", "label": "Критический"},
    ],
}
DEFAULT_OWNER_WS_PROJECT_CONFIG = {
    "statuses": [
        {"key": "active", "label": "Активный", "enabled": True},
        {"key": "completed", "label": "Завершён", "enabled": True},
        {"key": "archived", "label": "Архив", "enabled": True},
    ]
}
DEFAULT_OWNER_WS_PERMISSION_POLICY = {
    "manager_can_manage_team": True,
    "manager_can_change_roles": False,
    "manager_can_assign_manager": False,
    "manager_can_assign_observer": False,
    "manager_can_remove_manager": False,
}
DEFAULT_OWNER_WS_NOTIFICATION_CONFIG = {
    "items": [
        {"key": "task_overdue", "label": "Просрочка", "enabled": True},
        {"key": "task_due_soon", "label": "Скоро дедлайн", "enabled": True},
        {"key": "task_assigned", "label": "Назначение", "enabled": True},
        {"key": "task_comment", "label": "Комментарий", "enabled": True},
        {"key": "task_updated", "label": "Обновление задачи", "enabled": True},
        {"key": "contact_incoming_message", "label": "Сообщение по контакту", "enabled": True},
        {"key": "task_mention", "label": "Упоминание", "enabled": True},
    ]
}
OWNER_WS_STATUS_KEYS = [item["key"] for item in DEFAULT_OWNER_WS_TASK_CONFIG["statuses"]]
OWNER_WS_PRIORITY_KEYS = [item["key"] for item in DEFAULT_OWNER_WS_TASK_CONFIG["priorities"]]
OWNER_WS_PROJECT_STATUS_KEYS = [item["key"] for item in DEFAULT_OWNER_WS_PROJECT_CONFIG["statuses"]]
OWNER_WS_NOTIFICATION_KEYS = [item["key"] for item in DEFAULT_OWNER_WS_NOTIFICATION_CONFIG["items"]]


class B2BDistrictsResponse(BaseModel):
    items: List[str]


class B2BDistrictsUpdate(BaseModel):
    items: List[str]


class RefusedReasonsResponse(BaseModel):
    items: List[str]


class RefusedReasonsUpdate(BaseModel):
    items: List[str]


class OwnerWorkspaceTaskConfigItem(BaseModel):
    key: str
    label: str
    enabled: bool = True


class OwnerWorkspaceTaskConfigResponse(BaseModel):
    statuses: List[OwnerWorkspaceTaskConfigItem]
    priorities: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspaceTaskConfigUpdate(BaseModel):
    statuses: List[OwnerWorkspaceTaskConfigItem]
    priorities: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspacePermissionPolicyResponse(BaseModel):
    manager_can_manage_team: bool = True
    manager_can_change_roles: bool = False
    manager_can_assign_manager: bool = False
    manager_can_assign_observer: bool = False
    manager_can_remove_manager: bool = False


class OwnerWorkspacePermissionPolicyUpdate(BaseModel):
    manager_can_manage_team: bool = True
    manager_can_change_roles: bool = False
    manager_can_assign_manager: bool = False
    manager_can_assign_observer: bool = False
    manager_can_remove_manager: bool = False


class OwnerWorkspaceProjectConfigResponse(BaseModel):
    statuses: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspaceProjectConfigUpdate(BaseModel):
    statuses: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspaceNotificationConfigResponse(BaseModel):
    items: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspaceNotificationConfigUpdate(BaseModel):
    items: List[OwnerWorkspaceTaskConfigItem]


class OwnerWorkspaceTagDictionaryResponse(BaseModel):
    items: List[str]


class OwnerWorkspaceTagDictionaryUpdate(BaseModel):
    items: List[str]


def _get_json_setting(db: Session, key: str):
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not setting or not (setting.value or "").strip():
        return None
    try:
        return json.loads(setting.value)
    except Exception:
        return None


def _set_json_setting(db: Session, key: str, value) -> None:
    raw = json.dumps(value, ensure_ascii=False)
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not setting:
        setting = AppSetting(key=key, value=raw)
        db.add(setting)
    else:
        setting.value = raw
        db.add(setting)


def _normalize_owner_ws_task_items(items: List[OwnerWorkspaceTaskConfigItem], *, allowed_keys: List[str], defaults: List[dict]) -> List[dict]:
    by_key: Dict[str, dict] = {}
    for item in items:
        key = (item.key or "").strip()
        if key not in allowed_keys:
            continue
        label = (item.label or "").strip()
        if not label:
            continue
        by_key[key] = {
            "label": label[:120],
            "enabled": bool(item.enabled),
        }
    out: List[dict] = []
    seen = set()
    default_map = {item["key"]: item for item in defaults}
    ordered_keys = [item.key for item in items if item.key in allowed_keys]
    for key in allowed_keys:
        if key not in ordered_keys:
            ordered_keys.append(key)
    for key in ordered_keys:
        if key in seen:
            continue
        seen.add(key)
        default = default_map[key]
        value = by_key.get(key, {})
        out.append(
            {
                "key": key,
                "label": value.get("label", default["label"]),
                "enabled": value.get("enabled", default.get("enabled", True)),
            }
        )
    return out


def _get_owner_ws_task_config(db: Session) -> dict:
    raw = _get_json_setting(db, OWNER_WS_TASK_CONFIG_KEY)
    if not isinstance(raw, dict):
        return DEFAULT_OWNER_WS_TASK_CONFIG
    statuses = raw.get("statuses")
    priorities = raw.get("priorities")
    try:
        status_items = [OwnerWorkspaceTaskConfigItem.model_validate(x) for x in statuses] if isinstance(statuses, list) else []
        priority_items = [OwnerWorkspaceTaskConfigItem.model_validate(x) for x in priorities] if isinstance(priorities, list) else []
    except Exception:
        return DEFAULT_OWNER_WS_TASK_CONFIG
    return {
        "statuses": _normalize_owner_ws_task_items(
            status_items,
            allowed_keys=OWNER_WS_STATUS_KEYS,
            defaults=DEFAULT_OWNER_WS_TASK_CONFIG["statuses"],
        ),
        "priorities": _normalize_owner_ws_task_items(
            priority_items,
            allowed_keys=OWNER_WS_PRIORITY_KEYS,
            defaults=DEFAULT_OWNER_WS_TASK_CONFIG["priorities"],
        ),
    }


def _get_owner_ws_permission_policy(db: Session) -> dict:
    raw = _get_json_setting(db, OWNER_WS_PERMISSION_POLICY_KEY)
    if not isinstance(raw, dict):
        return DEFAULT_OWNER_WS_PERMISSION_POLICY
    return {
        "manager_can_manage_team": bool(raw.get("manager_can_manage_team", True)),
        "manager_can_change_roles": bool(raw.get("manager_can_change_roles", False)),
        "manager_can_assign_manager": bool(raw.get("manager_can_assign_manager", False)),
        "manager_can_assign_observer": bool(raw.get("manager_can_assign_observer", False)),
        "manager_can_remove_manager": bool(raw.get("manager_can_remove_manager", False)),
    }


def _get_owner_ws_project_config(db: Session) -> dict:
    raw = _get_json_setting(db, OWNER_WS_PROJECT_CONFIG_KEY)
    if not isinstance(raw, dict):
        return DEFAULT_OWNER_WS_PROJECT_CONFIG
    statuses = raw.get("statuses")
    try:
        status_items = [OwnerWorkspaceTaskConfigItem.model_validate(x) for x in statuses] if isinstance(statuses, list) else []
    except Exception:
        return DEFAULT_OWNER_WS_PROJECT_CONFIG
    return {
        "statuses": _normalize_owner_ws_task_items(
            status_items,
            allowed_keys=OWNER_WS_PROJECT_STATUS_KEYS,
            defaults=DEFAULT_OWNER_WS_PROJECT_CONFIG["statuses"],
        )
    }


def _get_owner_ws_notification_config(db: Session) -> dict:
    raw = _get_json_setting(db, OWNER_WS_NOTIFICATION_CONFIG_KEY)
    if not isinstance(raw, dict):
        return DEFAULT_OWNER_WS_NOTIFICATION_CONFIG
    items = raw.get("items")
    try:
        parsed_items = [OwnerWorkspaceTaskConfigItem.model_validate(x) for x in items] if isinstance(items, list) else []
    except Exception:
        return DEFAULT_OWNER_WS_NOTIFICATION_CONFIG
    return {
        "items": _normalize_owner_ws_task_items(
            parsed_items,
            allowed_keys=OWNER_WS_NOTIFICATION_KEYS,
            defaults=DEFAULT_OWNER_WS_NOTIFICATION_CONFIG["items"],
        )
    }


def _normalize_owner_ws_tag_items(items: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for item in items:
        value = str(item or "").strip()
        if not value:
            continue
        normalized = value[:64]
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        out.append(normalized)
    return out


def _get_owner_ws_tag_dictionary(db: Session, key: str) -> List[str]:
    raw = _get_json_setting(db, key)
    if not isinstance(raw, list):
        return []
    return _normalize_owner_ws_tag_items([str(item) for item in raw])


@router.get("/logo", response_model=LogoResponse)
async def get_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    setting = db.query(AppSetting).filter(AppSetting.key == LOGO_KEY).first()
    return {"data_url": setting.value if setting else None}


@router.post("/logo", response_model=LogoResponse)
async def set_logo(
    body: LogoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"])),
):
    data_url = (body.data_url or "").strip()
    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Logo must be a data:image/* data URL")

    # Ограничение размера (~200KB base64), чтобы не раздувать БД
    if len(data_url) > 250_000:
        raise HTTPException(status_code=400, detail="Logo is too large (max ~200KB)")

    setting = db.query(AppSetting).filter(AppSetting.key == LOGO_KEY).first()
    if not setting:
        setting = AppSetting(key=LOGO_KEY, value=data_url)
        db.add(setting)
    else:
        setting.value = data_url
        db.add(setting)

    db.commit()
    db.refresh(setting)
    return {"data_url": setting.value}


@router.get("/b2b-districts", response_model=B2BDistrictsResponse)
async def get_b2b_districts(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    setting = db.query(AppSetting).filter(AppSetting.key == DISTRICTS_KEY).first()
    if not setting or not (setting.value or "").strip():
        return B2BDistrictsResponse(items=[])
    try:
        data = json.loads(setting.value)
        if isinstance(data, list):
            items = [str(x) for x in data]
        else:
            items = []
    except Exception:
        items = []
    return B2BDistrictsResponse(items=items)


@router.post("/b2b-districts", response_model=B2BDistrictsResponse)
async def set_b2b_districts(
    body: B2BDistrictsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    items = [s.strip() for s in body.items if s and s.strip()]
    raw = json.dumps(items, ensure_ascii=False)
    setting = db.query(AppSetting).filter(AppSetting.key == DISTRICTS_KEY).first()
    if not setting:
        setting = AppSetting(key=DISTRICTS_KEY, value=raw)
        db.add(setting)
    else:
        setting.value = raw
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return B2BDistrictsResponse(items=items)


@router.get("/refused-reasons", response_model=RefusedReasonsResponse)
async def get_refused_reasons(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    setting = db.query(AppSetting).filter(AppSetting.key == REFUSED_REASONS_KEY).first()
    if not setting or not (setting.value or "").strip():
        return RefusedReasonsResponse(items=[])
    try:
        data = json.loads(setting.value)
        if isinstance(data, list):
            items = [str(x) for x in data]
        else:
            items = []
    except Exception:
        items = []
    return RefusedReasonsResponse(items=items)


@router.post("/refused-reasons", response_model=RefusedReasonsResponse)
async def set_refused_reasons(
    body: RefusedReasonsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    items = [s.strip() for s in body.items if s and s.strip()]
    raw = json.dumps(items, ensure_ascii=False)
    setting = db.query(AppSetting).filter(AppSetting.key == REFUSED_REASONS_KEY).first()
    if not setting:
        setting = AppSetting(key=REFUSED_REASONS_KEY, value=raw)
        db.add(setting)
    else:
        setting.value = raw
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return RefusedReasonsResponse(items=items)


@router.get("/owner-workspace-task-config", response_model=OwnerWorkspaceTaskConfigResponse)
async def get_owner_workspace_task_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    data = _get_owner_ws_task_config(db)
    return OwnerWorkspaceTaskConfigResponse.model_validate(data)


@router.post("/owner-workspace-task-config", response_model=OwnerWorkspaceTaskConfigResponse)
async def set_owner_workspace_task_config(
    body: OwnerWorkspaceTaskConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    data = {
        "statuses": _normalize_owner_ws_task_items(
            body.statuses,
            allowed_keys=OWNER_WS_STATUS_KEYS,
            defaults=DEFAULT_OWNER_WS_TASK_CONFIG["statuses"],
        ),
        "priorities": _normalize_owner_ws_task_items(
            body.priorities,
            allowed_keys=OWNER_WS_PRIORITY_KEYS,
            defaults=DEFAULT_OWNER_WS_TASK_CONFIG["priorities"],
        ),
    }
    _set_json_setting(db, OWNER_WS_TASK_CONFIG_KEY, data)
    db.commit()
    return OwnerWorkspaceTaskConfigResponse.model_validate(data)


@router.get("/owner-workspace-project-config", response_model=OwnerWorkspaceProjectConfigResponse)
async def get_owner_workspace_project_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    data = _get_owner_ws_project_config(db)
    return OwnerWorkspaceProjectConfigResponse.model_validate(data)


@router.post("/owner-workspace-project-config", response_model=OwnerWorkspaceProjectConfigResponse)
async def set_owner_workspace_project_config(
    body: OwnerWorkspaceProjectConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    data = {
        "statuses": _normalize_owner_ws_task_items(
            body.statuses,
            allowed_keys=OWNER_WS_PROJECT_STATUS_KEYS,
            defaults=DEFAULT_OWNER_WS_PROJECT_CONFIG["statuses"],
        )
    }
    _set_json_setting(db, OWNER_WS_PROJECT_CONFIG_KEY, data)
    db.commit()
    return OwnerWorkspaceProjectConfigResponse.model_validate(data)


@router.get("/owner-workspace-permission-policy", response_model=OwnerWorkspacePermissionPolicyResponse)
async def get_owner_workspace_permission_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    data = _get_owner_ws_permission_policy(db)
    return OwnerWorkspacePermissionPolicyResponse.model_validate(data)


@router.post("/owner-workspace-permission-policy", response_model=OwnerWorkspacePermissionPolicyResponse)
async def set_owner_workspace_permission_policy(
    body: OwnerWorkspacePermissionPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    data = {
        "manager_can_manage_team": bool(body.manager_can_manage_team),
        "manager_can_change_roles": bool(body.manager_can_change_roles),
        "manager_can_assign_manager": bool(body.manager_can_assign_manager),
        "manager_can_assign_observer": bool(body.manager_can_assign_observer),
        "manager_can_remove_manager": bool(body.manager_can_remove_manager),
    }
    _set_json_setting(db, OWNER_WS_PERMISSION_POLICY_KEY, data)
    db.commit()
    return OwnerWorkspacePermissionPolicyResponse.model_validate(data)


@router.get("/owner-workspace-notification-config", response_model=OwnerWorkspaceNotificationConfigResponse)
async def get_owner_workspace_notification_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    data = _get_owner_ws_notification_config(db)
    return OwnerWorkspaceNotificationConfigResponse.model_validate(data)


@router.post("/owner-workspace-notification-config", response_model=OwnerWorkspaceNotificationConfigResponse)
async def set_owner_workspace_notification_config(
    body: OwnerWorkspaceNotificationConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    data = {
        "items": _normalize_owner_ws_task_items(
            body.items,
            allowed_keys=OWNER_WS_NOTIFICATION_KEYS,
            defaults=DEFAULT_OWNER_WS_NOTIFICATION_CONFIG["items"],
        )
    }
    _set_json_setting(db, OWNER_WS_NOTIFICATION_CONFIG_KEY, data)
    db.commit()
    return OwnerWorkspaceNotificationConfigResponse.model_validate(data)


@router.get("/owner-workspace-task-tags", response_model=OwnerWorkspaceTagDictionaryResponse)
async def get_owner_workspace_task_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    return OwnerWorkspaceTagDictionaryResponse(items=_get_owner_ws_tag_dictionary(db, OWNER_WS_TASK_TAGS_KEY))


@router.post("/owner-workspace-task-tags", response_model=OwnerWorkspaceTagDictionaryResponse)
async def set_owner_workspace_task_tags(
    body: OwnerWorkspaceTagDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_TASK_TAGS_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


@router.get("/owner-workspace-contact-tags", response_model=OwnerWorkspaceTagDictionaryResponse)
async def get_owner_workspace_contact_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    return OwnerWorkspaceTagDictionaryResponse(items=_get_owner_ws_tag_dictionary(db, OWNER_WS_CONTACT_TAGS_KEY))


@router.post("/owner-workspace-contact-tags", response_model=OwnerWorkspaceTagDictionaryResponse)
async def set_owner_workspace_contact_tags(
    body: OwnerWorkspaceTagDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner", "admin"])),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_CONTACT_TAGS_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


