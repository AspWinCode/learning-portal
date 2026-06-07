from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
import json
import os
from uuid import uuid4

from app.database import get_db
from app import auth
from app.models import AppSetting, OwnerWorkspaceNotification, OwnerWorkspaceWebPushSubscription, User, UserRole
from app.schemas.settings import (
    B2BDistrictsResponse,
    B2BDistrictsUpdate,
    LogoResponse,
    LogoUpdate,
    OwnerWorkspaceNotificationConfigResponse,
    OwnerWorkspaceNotificationConfigUpdate,
    OwnerWorkspaceNotificationDeliveryChannelStats,
    OwnerWorkspaceNotificationDeliveryFailureItem,
    OwnerWorkspaceNotificationDeliveryRetryRequest,
    OwnerWorkspaceNotificationDeliveryRetryResponse,
    OwnerWorkspaceNotificationDeliveryStatsResponse,
    OwnerWorkspacePermissionPolicyResponse,
    OwnerWorkspacePermissionPolicyUpdate,
    OwnerWorkspaceProjectConfigResponse,
    OwnerWorkspaceProjectConfigUpdate,
    OwnerWorkspaceSettingsBundleEnvelopeResponse,
    OwnerWorkspaceSettingsBundleMetaResponse,
    OwnerWorkspaceSettingsBundleResponse,
    OwnerWorkspaceSettingsBundleSummaryResponse,
    OwnerWorkspaceSettingsBundleUpdate,
    OwnerWorkspaceSettingsSnapshotCreateRequest,
    OwnerWorkspaceSettingsSnapshotDuplicateRequest,
    OwnerWorkspaceSettingsSnapshotResponse,
    OwnerWorkspaceSettingsSnapshotsResponse,
    OwnerWorkspaceSettingsSnapshotUpdateRequest,
    OwnerWorkspaceTagDictionaryResponse,
    OwnerWorkspaceTagDictionaryUpdate,
    OwnerWorkspaceTaskConfigItem,
    OwnerWorkspaceTaskConfigResponse,
    OwnerWorkspaceTaskConfigUpdate,
    ParentWeeklyDigestSettingsResponse,
    ParentWeeklyDigestSettingsUpdate,
    PwaModuleResponse,
    PwaMySettingsResponse,
    PwaMySettingsUpdate,
    PwaRoleSettingsResponse,
    PwaRoleSettingsUpdate,
    RefusedReasonsResponse,
    RefusedReasonsUpdate,
)
from app.services.parent_weekly_digest import (
    DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS,
    get_parent_weekly_digest_settings,
    set_parent_weekly_digest_settings as save_parent_weekly_digest_settings,
)
from app.services.email_sender import is_email_configured
from app.services.owner_workspace_notifications import (
    EMAIL_STATUS_DISABLED,
    email_delivery_enabled_for_user,
    EMAIL_STATUS_FAILED,
    EMAIL_STATUS_PENDING,
    EMAIL_STATUS_SENT,
    MAX_EMAIL_ATTEMPTS,
    MAX_WEB_PUSH_ATTEMPTS,
    WEB_PUSH_STATUS_DISABLED,
    WEB_PUSH_STATUS_FAILED,
    WEB_PUSH_STATUS_PENDING,
    WEB_PUSH_STATUS_SENT,
    is_web_push_configured,
    web_push_delivery_enabled_for_user,
)


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
OWNER_WS_CONTACT_SOURCES_KEY = "owner_workspace_contact_source_dictionary"
OWNER_WS_COUNTERPARTY_ROLES_KEY = "owner_workspace_counterparty_role_dictionary"
OWNER_WS_COUNTERPARTY_INDUSTRIES_KEY = "owner_workspace_counterparty_industry_dictionary"
PARENT_WEEKLY_DIGEST_SETTINGS_KEY = "parent_weekly_digest_settings"
PWA_SETTINGS_KEY = "pwa_role_module_settings"
OWNER_WS_SETTINGS_BUNDLE_VERSION = 1
OWNER_WS_SETTINGS_SNAPSHOTS_KEY = "owner_workspace_settings_snapshots"

PWA_MODULES = [
    {
        "key": "dashboard",
        "label": "Главная",
        "description": "Краткий обзор портала.",
        "route": "/dashboard",
        "required_permission": None,
        "default_roles": ["admin", "owner"],
    },
    {
        "key": "parent_dashboard",
        "label": "Кабинет родителя",
        "description": "Прогресс, уведомления и вопросы родителя.",
        "route": "/parent-dashboard",
        "required_permission": "parent_dashboard.access",
        "default_roles": ["parent"],
    },
    {
        "key": "trainer_cockpit",
        "label": "Кокпит тренера",
        "description": "Быстрые действия тренера и ученики.",
        "route": "/trainer-cockpit",
        "required_permission": "trainer_cockpit.access",
        "default_roles": ["trainer"],
    },
    {
        "key": "contacts",
        "label": "Контакты",
        "description": "Контакты и контрагенты owner workspace.",
        "route": "/owner-workspace/contacts",
        "required_permission": "owner_workspace.access",
        "default_roles": ["owner", "admin"],
    },
    {
        "key": "tasks",
        "label": "Задачи",
        "description": "Список задач и быстрый переход к работе.",
        "route": "/tasks",
        "required_permission": "tasks.access",
        "default_roles": ["admin", "owner", "trainer", "sales"],
    },
    {
        "key": "owner_workspace",
        "label": "Таск трекер",
        "description": "Проекты, задачи и коммуникации owner workspace.",
        "route": "/owner-workspace/projects",
        "required_permission": "owner_workspace.access",
        "default_roles": ["admin", "owner", "sales"],
    },
    {
        "key": "students",
        "label": "Ученики",
        "description": "Ученики и карточки обучения.",
        "route": "/students",
        "required_permission": "students.access",
        "default_roles": ["admin", "owner", "sales"],
    },
    {
        "key": "lessons",
        "label": "Уроки",
        "description": "Расписание и уроки.",
        "route": "/lessons",
        "required_permission": "lessons.access",
        "default_roles": ["admin", "owner", "trainer", "sales"],
    },
    {
        "key": "grades",
        "label": "Оценки",
        "description": "Оценки и прогресс.",
        "route": "/grades",
        "required_permission": "grades.access",
        "default_roles": ["parent", "trainer", "admin", "owner"],
    },
    {
        "key": "leads",
        "label": "Лиды",
        "description": "Лиды, звонки и следующие действия.",
        "route": "/sales/leads",
        "required_permission": "sales.access",
        "default_roles": ["sales", "admin", "owner"],
    },
    {
        "key": "sales_events",
        "label": "События",
        "description": "Мероприятия и записи.",
        "route": "/sales/events",
        "required_permission": "sales.access",
        "default_roles": ["sales", "admin", "owner"],
    },
    {
        "key": "payments",
        "label": "Оплаты",
        "description": "Платежи и долги.",
        "route": "/finance/payments",
        "required_permission": "sales.access",
        "default_roles": ["sales", "admin", "owner"],
    },
    {
        "key": "programs",
        "label": "Программы",
        "description": "Программы обучения.",
        "route": "/programs",
        "required_permission": "programs.access",
        "default_roles": ["parent", "guest", "admin", "owner"],
    },
    {
        "key": "reports",
        "label": "Отчеты",
        "description": "Отчеты и аналитика.",
        "route": "/reports",
        "required_permission": "reports.access",
        "default_roles": ["admin"],
    },
]
PWA_MODULE_KEYS = {item["key"] for item in PWA_MODULES}
PWA_ROLE_KEYS = [role.value for role in UserRole]

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
    "manager_can_edit_project_meta": False,
    "manager_can_archive_project": False,
    "limited_can_create_projects": False,
    "limited_can_create_contacts": False,
    "limited_can_create_tasks": False,
    "limited_can_edit_contacts": False,
    "limited_can_edit_tasks": False,
    "limited_can_manage_project_contacts": False,
    "limited_can_complete_tasks": False,
    "limited_can_bulk_update_tasks": False,
    "limited_can_link_messages": False,
    "limited_can_send_messages": False,
    "limited_can_comment_tasks": False,
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


def _default_pwa_role_modules() -> Dict[str, List[str]]:
    role_modules: Dict[str, List[str]] = {role: [] for role in PWA_ROLE_KEYS}
    for module in PWA_MODULES:
        for role in module.get("default_roles", []):
            if role in role_modules:
                role_modules[role].append(module["key"])
    return role_modules


def _normalize_pwa_module_keys(keys: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in keys or []:
        key = str(raw or "").strip()
        if key in PWA_MODULE_KEYS and key not in seen:
            out.append(key)
            seen.add(key)
    return out


def _normalize_pwa_settings(raw: Optional[dict]) -> dict:
    defaults = _default_pwa_role_modules()
    if not isinstance(raw, dict):
        raw = {}
    role_modules = defaults
    raw_role_modules = raw.get("role_modules")
    if isinstance(raw_role_modules, dict):
        for role in PWA_ROLE_KEYS:
            if role in raw_role_modules:
                role_modules[role] = _normalize_pwa_module_keys(raw_role_modules.get(role) or [])
    owner_user_modules: Dict[str, List[str]] = {}
    raw_owner_user_modules = raw.get("owner_user_modules")
    if isinstance(raw_owner_user_modules, dict):
        for raw_user_id, raw_keys in raw_owner_user_modules.items():
            user_id = str(raw_user_id or "").strip()
            if user_id:
                owner_user_modules[user_id] = _normalize_pwa_module_keys(raw_keys or [])
    return {"role_modules": role_modules, "owner_user_modules": owner_user_modules}


def _get_pwa_settings(db: Session) -> dict:
    return _normalize_pwa_settings(_get_json_setting(db, PWA_SETTINGS_KEY))


def _pwa_module_response(module: dict) -> PwaModuleResponse:
    return PwaModuleResponse(
        key=module["key"],
        label=module["label"],
        description=module["description"],
        route=module["route"],
        required_permission=module.get("required_permission"),
    )


def _module_available_for_user(user: User, module: dict) -> bool:
    permission = module.get("required_permission")
    return not permission or auth.has_permission(user, permission)


def _effective_pwa_module_keys(db: Session, user: User) -> List[str]:
    settings = _get_pwa_settings(db)
    effective_role = auth.resolve_effective_role(user).value
    role_keys = settings["role_modules"].get(effective_role, [])
    if effective_role == UserRole.OWNER.value:
        owner_keys = settings["owner_user_modules"].get(str(user.id))
        if owner_keys is not None:
            role_keys = owner_keys
    modules_by_key = {module["key"]: module for module in PWA_MODULES}
    return [
        key
        for key in _normalize_pwa_module_keys(role_keys)
        if key in modules_by_key and _module_available_for_user(user, modules_by_key[key])
    ]


def _missing_email_env() -> List[str]:
    required = ["SMTP_HOST", "SMTP_PORT", "FROM_EMAIL"]
    return [key for key in required if not (os.getenv(key) or "").strip()]


def _missing_web_push_env() -> List[str]:
    required = [
        "WEB_PUSH_VAPID_PUBLIC_KEY",
        "WEB_PUSH_VAPID_PRIVATE_KEY",
        "WEB_PUSH_VAPID_SUBJECT",
    ]
    return [key for key in required if not (os.getenv(key) or "").strip()]


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
        "manager_can_edit_project_meta": bool(raw.get("manager_can_edit_project_meta", False)),
        "manager_can_archive_project": bool(raw.get("manager_can_archive_project", False)),
        "limited_can_create_projects": bool(raw.get("limited_can_create_projects", False)),
        "limited_can_create_contacts": bool(raw.get("limited_can_create_contacts", False)),
        "limited_can_create_tasks": bool(raw.get("limited_can_create_tasks", False)),
        "limited_can_edit_contacts": bool(raw.get("limited_can_edit_contacts", False)),
        "limited_can_edit_tasks": bool(raw.get("limited_can_edit_tasks", False)),
        "limited_can_manage_project_contacts": bool(raw.get("limited_can_manage_project_contacts", False)),
        "limited_can_complete_tasks": bool(raw.get("limited_can_complete_tasks", False)),
        "limited_can_bulk_update_tasks": bool(raw.get("limited_can_bulk_update_tasks", False)),
        "limited_can_link_messages": bool(raw.get("limited_can_link_messages", False)),
        "limited_can_send_messages": bool(raw.get("limited_can_send_messages", False)),
        "limited_can_comment_tasks": bool(raw.get("limited_can_comment_tasks", False)),
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


def _build_owner_ws_settings_bundle(db: Session) -> dict:
    return {
        "task_config": _get_owner_ws_task_config(db),
        "project_config": _get_owner_ws_project_config(db),
        "permission_policy": _get_owner_ws_permission_policy(db),
        "notification_config": _get_owner_ws_notification_config(db),
        "task_tags": {"items": _get_owner_ws_tag_dictionary(db, OWNER_WS_TASK_TAGS_KEY)},
        "contact_tags": {"items": _get_owner_ws_tag_dictionary(db, OWNER_WS_CONTACT_TAGS_KEY)},
        "contact_sources": {"items": _get_owner_ws_tag_dictionary(db, OWNER_WS_CONTACT_SOURCES_KEY)},
        "counterparty_roles": {"items": _get_owner_ws_tag_dictionary(db, OWNER_WS_COUNTERPARTY_ROLES_KEY)},
        "counterparty_industries": {"items": _get_owner_ws_tag_dictionary(db, OWNER_WS_COUNTERPARTY_INDUSTRIES_KEY)},
    }


def _build_owner_ws_settings_bundle_summary(bundle: dict) -> dict:
    return {
        "task_statuses": len(bundle["task_config"]["statuses"]),
        "task_priorities": len(bundle["task_config"]["priorities"]),
        "project_statuses": len(bundle["project_config"]["statuses"]),
        "notification_types": len(bundle["notification_config"]["items"]),
        "task_tags": len(bundle["task_tags"]["items"]),
        "contact_tags": len(bundle["contact_tags"]["items"]),
        "contact_sources": len(bundle["contact_sources"]["items"]),
        "counterparty_roles": len(bundle["counterparty_roles"]["items"]),
        "counterparty_industries": len(bundle["counterparty_industries"]["items"]),
    }


def _build_owner_ws_settings_bundle_envelope(bundle: dict, current_user: Optional[User]) -> dict:
    return {
        "meta": {
            "version": OWNER_WS_SETTINGS_BUNDLE_VERSION,
            "source": "owner_workspace_settings_bundle",
            "exported_at": datetime.now(timezone.utc),
            "exported_by_id": int(current_user.id) if current_user else None,
            "exported_by_name": ((current_user.full_name or current_user.email)[:160] if current_user else None),
            "summary": _build_owner_ws_settings_bundle_summary(bundle),
        },
        "data": bundle,
    }


def _normalize_owner_ws_settings_bundle(body: OwnerWorkspaceSettingsBundleUpdate) -> dict:
    return {
        "task_config": {
            "statuses": _normalize_owner_ws_task_items(
                body.task_config.statuses,
                allowed_keys=OWNER_WS_STATUS_KEYS,
                defaults=DEFAULT_OWNER_WS_TASK_CONFIG["statuses"],
            ),
            "priorities": _normalize_owner_ws_task_items(
                body.task_config.priorities,
                allowed_keys=OWNER_WS_PRIORITY_KEYS,
                defaults=DEFAULT_OWNER_WS_TASK_CONFIG["priorities"],
            ),
        },
        "project_config": {
            "statuses": _normalize_owner_ws_task_items(
                body.project_config.statuses,
                allowed_keys=OWNER_WS_PROJECT_STATUS_KEYS,
                defaults=DEFAULT_OWNER_WS_PROJECT_CONFIG["statuses"],
            )
        },
        "permission_policy": {
            "manager_can_manage_team": bool(body.permission_policy.manager_can_manage_team),
            "manager_can_change_roles": bool(body.permission_policy.manager_can_change_roles),
            "manager_can_assign_manager": bool(body.permission_policy.manager_can_assign_manager),
            "manager_can_assign_observer": bool(body.permission_policy.manager_can_assign_observer),
            "manager_can_remove_manager": bool(body.permission_policy.manager_can_remove_manager),
            "manager_can_edit_project_meta": bool(body.permission_policy.manager_can_edit_project_meta),
            "manager_can_archive_project": bool(body.permission_policy.manager_can_archive_project),
            "limited_can_create_projects": bool(body.permission_policy.limited_can_create_projects),
            "limited_can_create_contacts": bool(body.permission_policy.limited_can_create_contacts),
            "limited_can_create_tasks": bool(body.permission_policy.limited_can_create_tasks),
            "limited_can_edit_contacts": bool(body.permission_policy.limited_can_edit_contacts),
            "limited_can_edit_tasks": bool(body.permission_policy.limited_can_edit_tasks),
            "limited_can_manage_project_contacts": bool(body.permission_policy.limited_can_manage_project_contacts),
            "limited_can_complete_tasks": bool(body.permission_policy.limited_can_complete_tasks),
            "limited_can_bulk_update_tasks": bool(body.permission_policy.limited_can_bulk_update_tasks),
            "limited_can_link_messages": bool(body.permission_policy.limited_can_link_messages),
            "limited_can_send_messages": bool(body.permission_policy.limited_can_send_messages),
            "limited_can_comment_tasks": bool(body.permission_policy.limited_can_comment_tasks),
        },
        "notification_config": {
            "items": _normalize_owner_ws_task_items(
                body.notification_config.items,
                allowed_keys=OWNER_WS_NOTIFICATION_KEYS,
                defaults=DEFAULT_OWNER_WS_NOTIFICATION_CONFIG["items"],
            )
        },
        "task_tags": {"items": _normalize_owner_ws_tag_items(body.task_tags.items)},
        "contact_tags": {"items": _normalize_owner_ws_tag_items(body.contact_tags.items)},
        "contact_sources": {"items": _normalize_owner_ws_tag_items(body.contact_sources.items)},
        "counterparty_roles": {"items": _normalize_owner_ws_tag_items(getattr(body, "counterparty_roles", None) and body.counterparty_roles.items or [])},
        "counterparty_industries": {"items": _normalize_owner_ws_tag_items(getattr(body, "counterparty_industries", None) and body.counterparty_industries.items or [])},
    }


def _apply_owner_ws_settings_bundle(db: Session, bundle: dict) -> None:
    _set_json_setting(db, OWNER_WS_TASK_CONFIG_KEY, bundle["task_config"])
    _set_json_setting(db, OWNER_WS_PROJECT_CONFIG_KEY, bundle["project_config"])
    _set_json_setting(db, OWNER_WS_PERMISSION_POLICY_KEY, bundle["permission_policy"])
    _set_json_setting(db, OWNER_WS_NOTIFICATION_CONFIG_KEY, bundle["notification_config"])
    _set_json_setting(db, OWNER_WS_TASK_TAGS_KEY, bundle["task_tags"]["items"])
    _set_json_setting(db, OWNER_WS_CONTACT_TAGS_KEY, bundle["contact_tags"]["items"])
    _set_json_setting(db, OWNER_WS_CONTACT_SOURCES_KEY, bundle["contact_sources"]["items"])
    _set_json_setting(db, OWNER_WS_COUNTERPARTY_ROLES_KEY, bundle.get("counterparty_roles", {}).get("items", []))
    _set_json_setting(db, OWNER_WS_COUNTERPARTY_INDUSTRIES_KEY, bundle.get("counterparty_industries", {}).get("items", []))


def _extract_owner_ws_settings_bundle_update(raw_body: Any) -> OwnerWorkspaceSettingsBundleUpdate:
    payload = raw_body
    if isinstance(raw_body, dict) and isinstance(raw_body.get("data"), dict):
        payload = raw_body["data"]
    return OwnerWorkspaceSettingsBundleUpdate.model_validate(payload)


def _get_owner_ws_settings_snapshots(db: Session) -> List[dict]:
    raw = _get_json_setting(db, OWNER_WS_SETTINGS_SNAPSHOTS_KEY)
    if not isinstance(raw, list):
        return []
    out: List[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        snapshot_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        created_at = str(item.get("created_at") or "").strip()
        bundle = item.get("bundle")
        if not snapshot_id or not name or not created_at or not isinstance(bundle, dict):
            continue
        try:
            normalized_bundle_data = _normalize_owner_ws_settings_bundle(_extract_owner_ws_settings_bundle_update(bundle))
            meta = bundle.get("meta") if isinstance(bundle, dict) else None
            normalized_bundle = {
                "meta": {
                    "version": int(meta.get("version") or OWNER_WS_SETTINGS_BUNDLE_VERSION) if isinstance(meta, dict) else OWNER_WS_SETTINGS_BUNDLE_VERSION,
                    "source": str(meta.get("source") or "owner_workspace_settings_bundle_snapshot")[:120]
                    if isinstance(meta, dict)
                    else "owner_workspace_settings_bundle_snapshot",
                    "exported_at": meta.get("exported_at") if isinstance(meta, dict) and meta.get("exported_at") else created_at,
                    "exported_by_id": int(meta["exported_by_id"]) if isinstance(meta, dict) and meta.get("exported_by_id") else None,
                    "exported_by_name": (str(meta.get("exported_by_name") or "").strip()[:160] or None) if isinstance(meta, dict) else None,
                    "summary": _build_owner_ws_settings_bundle_summary(normalized_bundle_data),
                },
                "data": normalized_bundle_data,
            }
        except Exception:
            continue
        out.append(
            {
                "id": snapshot_id[:64],
                "name": name[:120],
                "note": (str(item.get("note") or "").strip() or None),
                "created_at": created_at,
                "created_by_id": int(item["created_by_id"]) if item.get("created_by_id") else None,
                "created_by_name": (str(item.get("created_by_name") or "").strip()[:160] or None),
                "bundle": normalized_bundle,
            }
        )
    out.sort(key=lambda row: (row["created_at"], row["id"]), reverse=True)
    return out


def _set_owner_ws_settings_snapshots(db: Session, snapshots: List[dict]) -> None:
    _set_json_setting(db, OWNER_WS_SETTINGS_SNAPSHOTS_KEY, snapshots)


def _build_delivery_channel_stats(
    db: Session,
    *,
    sent_field,
    status_field,
    attempts_field,
    pending_value: str,
    failed_value: str,
    sent_value: str,
    disabled_value: str,
    max_attempts: int,
) -> OwnerWorkspaceNotificationDeliveryChannelStats:
    sent_since = datetime.now(timezone.utc) - timedelta(hours=24)
    pending = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(status_field == pending_value)
        .scalar()
        or 0
    )
    failed = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(status_field == failed_value)
        .scalar()
        or 0
    )
    terminal_failed = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(status_field == failed_value, attempts_field >= max_attempts)
        .scalar()
        or 0
    )
    sent_last_24h = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(status_field == sent_value, sent_field.isnot(None), sent_field >= sent_since)
        .scalar()
        or 0
    )
    disabled = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(status_field == disabled_value)
        .scalar()
        or 0
    )
    return OwnerWorkspaceNotificationDeliveryChannelStats(
        pending=int(pending),
        failed=int(failed),
        terminal_failed=int(terminal_failed),
        sent_last_24h=int(sent_last_24h),
        disabled=int(disabled),
    )


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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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


@router.get("/pwa/modules", response_model=PwaRoleSettingsResponse)
async def get_pwa_role_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
):
    settings = _get_pwa_settings(db)
    return PwaRoleSettingsResponse(
        modules=[_pwa_module_response(module) for module in PWA_MODULES],
        role_modules=settings["role_modules"],
        owner_user_modules=settings["owner_user_modules"],
    )


@router.post("/pwa/modules", response_model=PwaRoleSettingsResponse)
async def set_pwa_role_settings(
    body: PwaRoleSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    current = _get_pwa_settings(db)
    next_settings = {
        "role_modules": _normalize_pwa_settings({"role_modules": body.role_modules})["role_modules"],
        "owner_user_modules": current["owner_user_modules"],
    }
    _set_json_setting(db, PWA_SETTINGS_KEY, next_settings)
    db.commit()
    return PwaRoleSettingsResponse(
        modules=[_pwa_module_response(module) for module in PWA_MODULES],
        role_modules=next_settings["role_modules"],
        owner_user_modules=next_settings["owner_user_modules"],
    )


@router.get("/pwa/my", response_model=PwaMySettingsResponse)
async def get_my_pwa_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    available_modules = [
        module for module in PWA_MODULES if _module_available_for_user(current_user, module)
    ]
    return PwaMySettingsResponse(
        modules=[_pwa_module_response(module) for module in available_modules],
        enabled_modules=_effective_pwa_module_keys(db, current_user),
        available_module_keys=[module["key"] for module in available_modules],
    )


@router.post("/pwa/my", response_model=PwaMySettingsResponse)
async def set_my_pwa_settings(
    body: PwaMySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can customize own PWA modules")
    available_keys = {
        module["key"] for module in PWA_MODULES if _module_available_for_user(current_user, module)
    }
    enabled_modules = [key for key in _normalize_pwa_module_keys(body.enabled_modules) if key in available_keys]
    settings = _get_pwa_settings(db)
    settings["owner_user_modules"][str(current_user.id)] = enabled_modules
    _set_json_setting(db, PWA_SETTINGS_KEY, settings)
    db.commit()
    available_modules = [
        module for module in PWA_MODULES if _module_available_for_user(current_user, module)
    ]
    return PwaMySettingsResponse(
        modules=[_pwa_module_response(module) for module in available_modules],
        enabled_modules=enabled_modules,
        available_module_keys=[module["key"] for module in available_modules],
    )


@router.get("/b2b-districts", response_model=B2BDistrictsResponse)
async def get_b2b_districts(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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


@router.get("/parent-weekly-digest", response_model=ParentWeeklyDigestSettingsResponse)
async def get_parent_weekly_digest(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
):
    data = get_parent_weekly_digest_settings(db)
    return ParentWeeklyDigestSettingsResponse(
        enabled=bool(data.get("enabled", DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS["enabled"])),
        weekday=int(data.get("weekday", DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS["weekday"])),
        send_time=str(data.get("send_time", DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS["send_time"])),
    )


@router.post("/parent-weekly-digest", response_model=ParentWeeklyDigestSettingsResponse)
async def set_parent_weekly_digest_settings_route(
    body: ParentWeeklyDigestSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    current = get_parent_weekly_digest_settings(db)
    saved = save_parent_weekly_digest_settings(
        db,
        {
            **current,
            "enabled": bool(body.enabled),
            "weekday": int(body.weekday),
            "send_time": body.send_time,
        },
    )
    return ParentWeeklyDigestSettingsResponse(
        enabled=bool(saved.get("enabled", True)),
        weekday=int(saved.get("weekday", 4)),
        send_time=str(saved.get("send_time", "09:00")),
    )


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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    data = {
        "manager_can_manage_team": bool(body.manager_can_manage_team),
        "manager_can_change_roles": bool(body.manager_can_change_roles),
        "manager_can_assign_manager": bool(body.manager_can_assign_manager),
        "manager_can_assign_observer": bool(body.manager_can_assign_observer),
        "manager_can_remove_manager": bool(body.manager_can_remove_manager),
        "manager_can_edit_project_meta": bool(body.manager_can_edit_project_meta),
        "manager_can_archive_project": bool(body.manager_can_archive_project),
        "limited_can_create_projects": bool(body.limited_can_create_projects),
        "limited_can_create_contacts": bool(body.limited_can_create_contacts),
        "limited_can_create_tasks": bool(body.limited_can_create_tasks),
        "limited_can_edit_contacts": bool(body.limited_can_edit_contacts),
        "limited_can_edit_tasks": bool(body.limited_can_edit_tasks),
        "limited_can_manage_project_contacts": bool(body.limited_can_manage_project_contacts),
        "limited_can_complete_tasks": bool(body.limited_can_complete_tasks),
        "limited_can_bulk_update_tasks": bool(body.limited_can_bulk_update_tasks),
        "limited_can_link_messages": bool(body.limited_can_link_messages),
        "limited_can_send_messages": bool(body.limited_can_send_messages),
        "limited_can_comment_tasks": bool(body.limited_can_comment_tasks),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
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
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_CONTACT_TAGS_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


@router.get("/owner-workspace-contact-sources", response_model=OwnerWorkspaceTagDictionaryResponse)
async def get_owner_workspace_contact_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    return OwnerWorkspaceTagDictionaryResponse(items=_get_owner_ws_tag_dictionary(db, OWNER_WS_CONTACT_SOURCES_KEY))


@router.post("/owner-workspace-contact-sources", response_model=OwnerWorkspaceTagDictionaryResponse)
async def set_owner_workspace_contact_sources(
    body: OwnerWorkspaceTagDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_CONTACT_SOURCES_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


@router.get("/owner-workspace-counterparty-roles", response_model=OwnerWorkspaceTagDictionaryResponse)
async def get_owner_workspace_counterparty_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    return OwnerWorkspaceTagDictionaryResponse(items=_get_owner_ws_tag_dictionary(db, OWNER_WS_COUNTERPARTY_ROLES_KEY))


@router.post("/owner-workspace-counterparty-roles", response_model=OwnerWorkspaceTagDictionaryResponse)
async def set_owner_workspace_counterparty_roles(
    body: OwnerWorkspaceTagDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_COUNTERPARTY_ROLES_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


@router.get("/owner-workspace-counterparty-industries", response_model=OwnerWorkspaceTagDictionaryResponse)
async def get_owner_workspace_counterparty_industries(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    return OwnerWorkspaceTagDictionaryResponse(items=_get_owner_ws_tag_dictionary(db, OWNER_WS_COUNTERPARTY_INDUSTRIES_KEY))


@router.post("/owner-workspace-counterparty-industries", response_model=OwnerWorkspaceTagDictionaryResponse)
async def set_owner_workspace_counterparty_industries(
    body: OwnerWorkspaceTagDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    items = _normalize_owner_ws_tag_items(body.items)
    _set_json_setting(db, OWNER_WS_COUNTERPARTY_INDUSTRIES_KEY, items)
    db.commit()
    return OwnerWorkspaceTagDictionaryResponse(items=items)


@router.get("/owner-workspace-settings-bundle", response_model=OwnerWorkspaceSettingsBundleEnvelopeResponse)
async def get_owner_workspace_settings_bundle(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
):
    bundle = _build_owner_ws_settings_bundle(db)
    return OwnerWorkspaceSettingsBundleEnvelopeResponse.model_validate(
        _build_owner_ws_settings_bundle_envelope(bundle, current_user)
    )


@router.post("/owner-workspace-settings-bundle", response_model=OwnerWorkspaceSettingsBundleEnvelopeResponse)
async def set_owner_workspace_settings_bundle(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    bundle = _normalize_owner_ws_settings_bundle(_extract_owner_ws_settings_bundle_update(body))
    _apply_owner_ws_settings_bundle(db, bundle)
    db.commit()
    return OwnerWorkspaceSettingsBundleEnvelopeResponse.model_validate(
        _build_owner_ws_settings_bundle_envelope(bundle, current_user)
    )


@router.get("/owner-workspace-settings-snapshots", response_model=OwnerWorkspaceSettingsSnapshotsResponse)
async def get_owner_workspace_settings_snapshots(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
):
    return OwnerWorkspaceSettingsSnapshotsResponse(items=_get_owner_ws_settings_snapshots(db))


@router.post("/owner-workspace-settings-snapshots", response_model=OwnerWorkspaceSettingsSnapshotResponse)
async def create_owner_workspace_settings_snapshot(
    body: OwnerWorkspaceSettingsSnapshotCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    snapshots = _get_owner_ws_settings_snapshots(db)
    bundle = _build_owner_ws_settings_bundle_envelope(_build_owner_ws_settings_bundle(db), current_user)
    snapshot = {
        "id": uuid4().hex,
        "name": name[:120],
        "note": ((body.note or "").strip()[:500] or None),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_id": int(current_user.id),
        "created_by_name": (current_user.full_name or current_user.email or f"#{current_user.id}")[:160],
        "bundle": bundle,
    }
    snapshots.insert(0, snapshot)
    _set_owner_ws_settings_snapshots(db, snapshots[:25])
    db.commit()
    return OwnerWorkspaceSettingsSnapshotResponse.model_validate(snapshot)


@router.patch("/owner-workspace-settings-snapshots/{snapshot_id}", response_model=OwnerWorkspaceSettingsSnapshotResponse)
async def update_owner_workspace_settings_snapshot(
    snapshot_id: str,
    body: OwnerWorkspaceSettingsSnapshotUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    snapshots = _get_owner_ws_settings_snapshots(db)
    snapshot = next((item for item in snapshots if item["id"] == snapshot_id), None)
    if not snapshot:
        raise HTTPException(status_code=404, detail="snapshot not found")
    snapshot["name"] = name[:120]
    snapshot["note"] = ((body.note or "").strip()[:500] or None)
    _set_owner_ws_settings_snapshots(db, snapshots)
    db.commit()
    return OwnerWorkspaceSettingsSnapshotResponse.model_validate(snapshot)


@router.post("/owner-workspace-settings-snapshots/{snapshot_id}/duplicate", response_model=OwnerWorkspaceSettingsSnapshotResponse)
async def duplicate_owner_workspace_settings_snapshot(
    snapshot_id: str,
    body: OwnerWorkspaceSettingsSnapshotDuplicateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    snapshots = _get_owner_ws_settings_snapshots(db)
    snapshot = next((item for item in snapshots if item["id"] == snapshot_id), None)
    if not snapshot:
        raise HTTPException(status_code=404, detail="snapshot not found")
    duplicate_name = (body.name or f"Copy: {snapshot['name']}" or "").strip()
    if not duplicate_name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    duplicate = {
        "id": uuid4().hex,
        "name": duplicate_name[:120],
        "note": ((body.note if body.note is not None else snapshot.get("note") or "").strip()[:500] or None),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_id": int(current_user.id),
        "created_by_name": (current_user.full_name or current_user.email or f"#{current_user.id}")[:160],
        "bundle": snapshot["bundle"],
    }
    snapshots.insert(0, duplicate)
    _set_owner_ws_settings_snapshots(db, snapshots[:25])
    db.commit()
    return OwnerWorkspaceSettingsSnapshotResponse.model_validate(duplicate)


@router.post("/owner-workspace-settings-snapshots/{snapshot_id}/apply", response_model=OwnerWorkspaceSettingsBundleEnvelopeResponse)
async def apply_owner_workspace_settings_snapshot(
    snapshot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    snapshots = _get_owner_ws_settings_snapshots(db)
    snapshot = next((item for item in snapshots if item["id"] == snapshot_id), None)
    if not snapshot:
        raise HTTPException(status_code=404, detail="snapshot not found")
    bundle = _normalize_owner_ws_settings_bundle(_extract_owner_ws_settings_bundle_update(snapshot["bundle"]))
    _apply_owner_ws_settings_bundle(db, bundle)
    db.commit()
    return OwnerWorkspaceSettingsBundleEnvelopeResponse.model_validate(
        _build_owner_ws_settings_bundle_envelope(bundle, current_user)
    )


@router.delete("/owner-workspace-settings-snapshots/{snapshot_id}", response_model=OwnerWorkspaceSettingsSnapshotsResponse)
async def delete_owner_workspace_settings_snapshot(
    snapshot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    snapshots = _get_owner_ws_settings_snapshots(db)
    filtered = [item for item in snapshots if item["id"] != snapshot_id]
    if len(filtered) == len(snapshots):
        raise HTTPException(status_code=404, detail="snapshot not found")
    _set_owner_ws_settings_snapshots(db, filtered)
    db.commit()
    return OwnerWorkspaceSettingsSnapshotsResponse(items=filtered)


@router.get(
    "/owner-workspace-notification-delivery-stats",
    response_model=OwnerWorkspaceNotificationDeliveryStatsResponse,
)
async def get_owner_workspace_notification_delivery_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.access")),
):
    missing_email_env = _missing_email_env()
    missing_web_push_env = _missing_web_push_env()
    email_stats = _build_delivery_channel_stats(
        db,
        sent_field=OwnerWorkspaceNotification.email_sent_at,
        status_field=OwnerWorkspaceNotification.email_delivery_status,
        attempts_field=OwnerWorkspaceNotification.email_attempts,
        pending_value=EMAIL_STATUS_PENDING,
        failed_value=EMAIL_STATUS_FAILED,
        sent_value=EMAIL_STATUS_SENT,
        disabled_value=EMAIL_STATUS_DISABLED,
        max_attempts=MAX_EMAIL_ATTEMPTS,
    )
    web_push_stats = _build_delivery_channel_stats(
        db,
        sent_field=OwnerWorkspaceNotification.web_push_sent_at,
        status_field=OwnerWorkspaceNotification.web_push_delivery_status,
        attempts_field=OwnerWorkspaceNotification.web_push_attempts,
        pending_value=WEB_PUSH_STATUS_PENDING,
        failed_value=WEB_PUSH_STATUS_FAILED,
        sent_value=WEB_PUSH_STATUS_SENT,
        disabled_value=WEB_PUSH_STATUS_DISABLED,
        max_attempts=MAX_WEB_PUSH_ATTEMPTS,
    )
    web_push_subscriptions_total = (
        db.query(func.count(OwnerWorkspaceWebPushSubscription.id)).scalar() or 0
    )
    recent_rows = (
        db.query(OwnerWorkspaceNotification, User)
        .join(User, User.id == OwnerWorkspaceNotification.user_id)
        .filter(
            (OwnerWorkspaceNotification.email_delivery_status == EMAIL_STATUS_FAILED)
            | (OwnerWorkspaceNotification.web_push_delivery_status == WEB_PUSH_STATUS_FAILED)
        )
        .order_by(OwnerWorkspaceNotification.created_at.desc(), OwnerWorkspaceNotification.id.desc())
        .limit(10)
        .all()
    )
    return OwnerWorkspaceNotificationDeliveryStatsResponse(
        email_configured=is_email_configured(),
        missing_email_env=missing_email_env,
        web_push_configured=is_web_push_configured(),
        missing_web_push_env=missing_web_push_env,
        web_push_subscriptions_total=int(web_push_subscriptions_total),
        email=email_stats,
        web_push=web_push_stats,
        recent_failures=[
            OwnerWorkspaceNotificationDeliveryFailureItem(
                id=int(notification.id),
                user_id=int(notification.user_id),
                user_name=(user.full_name or user.email or f"#{user.id}")[:160],
                kind=str(notification.kind),
                title=str(notification.title),
                created_at=notification.created_at,
                email_delivery_status=str(notification.email_delivery_status or EMAIL_STATUS_DISABLED),
                email_attempts=int(notification.email_attempts or 0),
                email_last_error=notification.email_last_error or None,
                web_push_delivery_status=str(notification.web_push_delivery_status or WEB_PUSH_STATUS_DISABLED),
                web_push_attempts=int(notification.web_push_attempts or 0),
                web_push_last_error=notification.web_push_last_error or None,
            )
            for notification, user in recent_rows
        ],
    )


@router.post(
    "/owner-workspace-notification-delivery-retry",
    response_model=OwnerWorkspaceNotificationDeliveryRetryResponse,
)
async def retry_owner_workspace_notification_delivery(
    body: OwnerWorkspaceNotificationDeliveryRetryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("settings.manage")),
):
    notification_ids = sorted({int(item) for item in body.notification_ids if int(item) > 0})
    if not notification_ids:
        raise HTTPException(status_code=400, detail="notification_ids must not be empty")

    rows = (
        db.query(OwnerWorkspaceNotification)
        .filter(OwnerWorkspaceNotification.id.in_(notification_ids))
        .all()
    )
    retried_email = 0
    retried_web_push = 0

    for notification in rows:
      if body.include_email and notification.email_delivery_status == EMAIL_STATUS_FAILED:
          if email_delivery_enabled_for_user(db, notification.user_id, notification.kind):
              notification.email_delivery_status = EMAIL_STATUS_PENDING
              notification.email_attempts = 0
              notification.email_last_error = None
              notification.email_last_attempt_at = None
              notification.email_sent_at = None
              retried_email += 1
      if body.include_web_push and notification.web_push_delivery_status == WEB_PUSH_STATUS_FAILED:
          if web_push_delivery_enabled_for_user(db, notification.user_id, notification.kind):
              notification.web_push_delivery_status = WEB_PUSH_STATUS_PENDING
              notification.web_push_attempts = 0
              notification.web_push_last_error = None
              notification.web_push_last_attempt_at = None
              notification.web_push_sent_at = None
              retried_web_push += 1

    db.commit()
    return OwnerWorkspaceNotificationDeliveryRetryResponse(
        retried_email=retried_email,
        retried_web_push=retried_web_push,
    )
