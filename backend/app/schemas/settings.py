from datetime import datetime
from typing import List, Optional

from app.schemas.parent_dashboard import (
    ParentWeeklyDigestSettingsResponse,
    ParentWeeklyDigestSettingsUpdate,
)
from pydantic import BaseModel, Field


class LogoResponse(BaseModel):
    data_url: Optional[str] = None


class LogoUpdate(BaseModel):
    data_url: str


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
    manager_can_edit_project_meta: bool = False
    manager_can_archive_project: bool = False
    limited_can_create_projects: bool = False
    limited_can_create_contacts: bool = False
    limited_can_create_tasks: bool = False
    limited_can_edit_contacts: bool = False
    limited_can_edit_tasks: bool = False
    limited_can_manage_project_contacts: bool = False
    limited_can_complete_tasks: bool = False
    limited_can_bulk_update_tasks: bool = False
    limited_can_link_messages: bool = False
    limited_can_send_messages: bool = False
    limited_can_comment_tasks: bool = False


class OwnerWorkspacePermissionPolicyUpdate(BaseModel):
    manager_can_manage_team: bool = True
    manager_can_change_roles: bool = False
    manager_can_assign_manager: bool = False
    manager_can_assign_observer: bool = False
    manager_can_remove_manager: bool = False
    manager_can_edit_project_meta: bool = False
    manager_can_archive_project: bool = False
    limited_can_create_projects: bool = False
    limited_can_create_contacts: bool = False
    limited_can_create_tasks: bool = False
    limited_can_edit_contacts: bool = False
    limited_can_edit_tasks: bool = False
    limited_can_manage_project_contacts: bool = False
    limited_can_complete_tasks: bool = False
    limited_can_bulk_update_tasks: bool = False
    limited_can_link_messages: bool = False
    limited_can_send_messages: bool = False
    limited_can_comment_tasks: bool = False


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


class OwnerWorkspaceSettingsBundleResponse(BaseModel):
    task_config: OwnerWorkspaceTaskConfigResponse
    project_config: OwnerWorkspaceProjectConfigResponse
    permission_policy: OwnerWorkspacePermissionPolicyResponse
    notification_config: OwnerWorkspaceNotificationConfigResponse
    task_tags: OwnerWorkspaceTagDictionaryResponse
    contact_tags: OwnerWorkspaceTagDictionaryResponse
    contact_sources: OwnerWorkspaceTagDictionaryResponse
    counterparty_roles: OwnerWorkspaceTagDictionaryResponse = Field(
        default_factory=lambda: OwnerWorkspaceTagDictionaryResponse(items=[])
    )
    counterparty_industries: OwnerWorkspaceTagDictionaryResponse = Field(
        default_factory=lambda: OwnerWorkspaceTagDictionaryResponse(items=[])
    )


class OwnerWorkspaceSettingsBundleUpdate(BaseModel):
    task_config: OwnerWorkspaceTaskConfigUpdate
    project_config: OwnerWorkspaceProjectConfigUpdate
    permission_policy: OwnerWorkspacePermissionPolicyUpdate
    notification_config: OwnerWorkspaceNotificationConfigUpdate
    task_tags: OwnerWorkspaceTagDictionaryUpdate
    contact_tags: OwnerWorkspaceTagDictionaryUpdate
    contact_sources: OwnerWorkspaceTagDictionaryUpdate
    counterparty_roles: OwnerWorkspaceTagDictionaryUpdate = Field(
        default_factory=lambda: OwnerWorkspaceTagDictionaryUpdate(items=[])
    )
    counterparty_industries: OwnerWorkspaceTagDictionaryUpdate = Field(
        default_factory=lambda: OwnerWorkspaceTagDictionaryUpdate(items=[])
    )


class OwnerWorkspaceSettingsBundleSummaryResponse(BaseModel):
    task_statuses: int
    task_priorities: int
    project_statuses: int
    notification_types: int
    task_tags: int
    contact_tags: int
    contact_sources: int
    counterparty_roles: int = 0
    counterparty_industries: int = 0


class OwnerWorkspaceSettingsBundleMetaResponse(BaseModel):
    version: int
    source: str
    exported_at: datetime
    exported_by_id: Optional[int] = None
    exported_by_name: Optional[str] = None
    summary: OwnerWorkspaceSettingsBundleSummaryResponse


class OwnerWorkspaceSettingsBundleEnvelopeResponse(BaseModel):
    meta: OwnerWorkspaceSettingsBundleMetaResponse
    data: OwnerWorkspaceSettingsBundleResponse


class OwnerWorkspaceSettingsSnapshotResponse(BaseModel):
    id: str
    name: str
    note: Optional[str] = None
    created_at: datetime
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    bundle: OwnerWorkspaceSettingsBundleEnvelopeResponse


class OwnerWorkspaceSettingsSnapshotsResponse(BaseModel):
    items: List[OwnerWorkspaceSettingsSnapshotResponse]


class OwnerWorkspaceSettingsSnapshotCreateRequest(BaseModel):
    name: str
    note: Optional[str] = None


class OwnerWorkspaceSettingsSnapshotUpdateRequest(BaseModel):
    name: str
    note: Optional[str] = None


class OwnerWorkspaceSettingsSnapshotDuplicateRequest(BaseModel):
    name: Optional[str] = None
    note: Optional[str] = None


class OwnerWorkspaceNotificationDeliveryChannelStats(BaseModel):
    pending: int
    failed: int
    terminal_failed: int
    sent_last_24h: int
    disabled: int


class OwnerWorkspaceNotificationDeliveryFailureItem(BaseModel):
    id: int
    user_id: int
    user_name: str
    kind: str
    title: str
    created_at: Optional[datetime] = None
    email_delivery_status: str
    email_attempts: int
    email_last_error: Optional[str] = None
    web_push_delivery_status: str
    web_push_attempts: int
    web_push_last_error: Optional[str] = None


class OwnerWorkspaceNotificationDeliveryStatsResponse(BaseModel):
    email_configured: bool
    missing_email_env: List[str]
    web_push_configured: bool
    missing_web_push_env: List[str]
    web_push_subscriptions_total: int
    email: OwnerWorkspaceNotificationDeliveryChannelStats
    web_push: OwnerWorkspaceNotificationDeliveryChannelStats
    recent_failures: List[OwnerWorkspaceNotificationDeliveryFailureItem]


class OwnerWorkspaceNotificationDeliveryRetryRequest(BaseModel):
    notification_ids: List[int]
    include_email: bool = True
    include_web_push: bool = True


class OwnerWorkspaceNotificationDeliveryRetryResponse(BaseModel):
    retried_email: int
    retried_web_push: int


__all__ = [name for name in globals() if not name.startswith("_")]
