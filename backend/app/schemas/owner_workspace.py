from datetime import date, datetime, time
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OwnerWorkspaceProjectParticipantAdd(BaseModel):
    user_id: int
    role: Literal["member", "manager", "observer"] = "member"


class OwnerWorkspaceProjectParticipantRolePatch(BaseModel):
    role: Literal["member", "manager", "observer"]


class OwnerWorkspaceProjectContactAdd(BaseModel):
    contact_id: int


OwnerWorkspaceProjectStatus = Literal["new", "in_progress", "on_review", "completed", "archived", "active"]


class OwnerWorkspaceProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[OwnerWorkspaceProjectStatus] = "new"
    owner_id: Optional[int] = None
    parent_project_id: Optional[int] = None
    counterparty_id: Optional[int] = None
    start_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None


class OwnerWorkspaceProjectCreate(OwnerWorkspaceProjectBase):
    pass


class OwnerWorkspaceProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[OwnerWorkspaceProjectStatus] = None
    owner_id: Optional[int] = None
    parent_project_id: Optional[int] = None
    counterparty_id: Optional[int] = None
    start_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None


class OwnerWorkspaceProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    status: str
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    parent_project_id: Optional[int] = None
    parent_project_name: Optional[str] = None
    counterparty_id: Optional[int] = None
    counterparty_name: Optional[str] = None
    start_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None
    participants: List[int] = []
    participant_roles: Dict[int, str] = Field(default_factory=dict)
    active_tasks_count: int = 0
    total_tasks_count: int = 0
    completed_tasks_count: int = 0
    overdue_tasks_count: int = 0
    contacts_count: int = 0
    subprojects_count: int = 0
    documents_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceProjectDocumentResponse(BaseModel):
    id: int
    project_id: int
    folder_id: Optional[int] = None
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceProjectDocumentFolderCreate(BaseModel):
    parent_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)


class OwnerWorkspaceProjectDocumentFolderUpdate(BaseModel):
    parent_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)


class OwnerWorkspaceProjectDocumentFolderResponse(BaseModel):
    id: int
    project_id: int
    parent_id: Optional[int] = None
    name: str
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerUsefulLinkFolderBase(BaseModel):
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class OwnerUsefulLinkFolderCreate(OwnerUsefulLinkFolderBase):
    pass


class OwnerUsefulLinkFolderUpdate(BaseModel):
    parent_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class OwnerUsefulLinkFolderResponse(BaseModel):
    id: int
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    sort_order: int = 0
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerUsefulLinkBase(BaseModel):
    folder_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    url: str
    tags: List[str] = Field(default_factory=list)
    sort_order: int = 0

    @field_validator("url")
    @classmethod
    def normalize_url(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("url is required")
        if not cleaned.startswith(("http://", "https://")):
            cleaned = f"https://{cleaned}"
        return cleaned

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: List[str]) -> List[str]:
        seen = set()
        tags: List[str] = []
        for raw in value or []:
            tag = str(raw).strip()
            if not tag:
                continue
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            tags.append(tag)
        return tags


class OwnerUsefulLinkCreate(OwnerUsefulLinkBase):
    pass


class OwnerUsefulLinkUpdate(BaseModel):
    folder_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    tags: Optional[List[str]] = None
    sort_order: Optional[int] = None

    @field_validator("url")
    @classmethod
    def normalize_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("url is required")
        if not cleaned.startswith(("http://", "https://")):
            cleaned = f"https://{cleaned}"
        return cleaned

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return value
        seen = set()
        tags: List[str] = []
        for raw in value:
            tag = str(raw).strip()
            if not tag:
                continue
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            tags.append(tag)
        return tags


class OwnerUsefulLinkResponse(BaseModel):
    id: int
    folder_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    url: str
    tags: List[str] = Field(default_factory=list)
    sort_order: int = 0
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerUsefulLinksPageResponse(BaseModel):
    folders: List[OwnerUsefulLinkFolderResponse] = Field(default_factory=list)
    links: List[OwnerUsefulLinkResponse] = Field(default_factory=list)


OwnerWorkspaceContactType = Literal["company", "ip", "individual"]


class OwnerWorkspaceContactBase(BaseModel):
    full_name: str
    type: OwnerWorkspaceContactType = "individual"
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None


class OwnerWorkspaceContactCreate(OwnerWorkspaceContactBase):
    project_ids: Optional[List[int]] = None
    counterparty_id: Optional[int] = None


class OwnerWorkspaceContactUpdate(BaseModel):
    full_name: Optional[str] = None
    type: Optional[OwnerWorkspaceContactType] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    counterparty_id: Optional[int] = None


class OwnerWorkspaceContactResponse(BaseModel):
    id: int
    type: str = "individual"
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    linked_project_ids: List[int] = []
    active_tasks_count: int = 0
    projects_count: int = 0
    last_interaction_at: Optional[datetime] = Field(None)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_archived: bool = False
    counterparty_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceCounterpartyCustomField(BaseModel):
    id: Optional[str] = None
    label: str
    field_type: Literal["text", "number", "date", "link", "file", "comment"] = "text"
    value: Optional[Any] = None


class OwnerWorkspaceCounterpartyDocumentResponse(BaseModel):
    category: str
    label: str
    uploaded: bool = False
    status: Literal["missing", "uploaded"] = "missing"
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    download_url: Optional[str] = None


class LinkedPersonItem(BaseModel):
    id: int
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None


class OwnerWorkspaceCounterpartyCreate(BaseModel):
    type: OwnerWorkspaceContactType = "company"
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    project_ids: Optional[List[int]] = None
    custom_fields: Optional[List[OwnerWorkspaceCounterpartyCustomField]] = None
    linked_persons: Optional[List[LinkedPersonItem]] = None
    counterparty_role: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    ogrn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    bank_account: Optional[str] = None
    bank_corr_account: Optional[str] = None
    bank_bik: Optional[str] = None
    bank_name: Optional[str] = None
    bank_currency: Optional[str] = None


class OwnerWorkspaceCounterpartyUpdate(BaseModel):
    type: Optional[OwnerWorkspaceContactType] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    project_ids: Optional[List[int]] = None
    custom_fields: Optional[List[OwnerWorkspaceCounterpartyCustomField]] = None
    linked_persons: Optional[List[LinkedPersonItem]] = None
    counterparty_role: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    ogrn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    bank_account: Optional[str] = None
    bank_corr_account: Optional[str] = None
    bank_bik: Optional[str] = None
    bank_name: Optional[str] = None
    bank_currency: Optional[str] = None


class OwnerWorkspaceCounterpartyResponse(BaseModel):
    id: int
    type: str = "company"
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    source: Optional[str] = None
    linked_project_ids: List[int] = []
    active_tasks_count: int = 0
    projects_count: int = 0
    last_interaction_at: Optional[datetime] = None
    custom_fields: List[OwnerWorkspaceCounterpartyCustomField] = Field(default_factory=list)
    linked_persons: List[LinkedPersonItem] = Field(default_factory=list)
    documents: List[OwnerWorkspaceCounterpartyDocumentResponse] = Field(default_factory=list)
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    counterparty_role: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    ogrn: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    bank_account: Optional[str] = None
    bank_corr_account: Optional[str] = None
    bank_bik: Optional[str] = None
    bank_name: Optional[str] = None
    bank_currency: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceTaskRepeatSettings(BaseModel):
    """Настройки периодичности задачи."""
    enabled: bool = False
    frequency: Optional[Literal["daily", "weekly", "monthly", "custom"]] = None
    interval: Optional[int] = None          # каждые N единиц
    days: Optional[List[int]] = None        # [0..6] — дни недели
    end_type: Optional[Literal["never", "after_count", "until_date"]] = "never"
    end_after_count: Optional[int] = None
    end_until: Optional[datetime] = None


class OwnerWorkspaceTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[Literal["new", "in_progress", "waiting", "completed", "cancelled"]] = "new"
    priority: Optional[Literal["low", "medium", "high", "critical"]] = "medium"
    deadline_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    assignee_id: Optional[int] = None
    project_id: Optional[int] = None
    contact_id: Optional[int] = None
    tags: Optional[List[str]] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    linked_message_ids: Optional[List[int]] = None
    previous_task_id: Optional[int] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None
    repeat: Optional[OwnerWorkspaceTaskRepeatSettings] = None
    watcher_ids: Optional[List[int]] = None
    reminder_at: Optional[datetime] = None


class OwnerWorkspaceTaskCreate(OwnerWorkspaceTaskBase):
    pass


class OwnerWorkspaceTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["new", "in_progress", "waiting", "completed", "cancelled"]] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    deadline_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    assignee_id: Optional[int] = None
    project_id: Optional[int] = None
    contact_id: Optional[int] = None
    tags: Optional[List[str]] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    linked_message_ids: Optional[List[int]] = None
    previous_task_id: Optional[int] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None
    repeat: Optional[OwnerWorkspaceTaskRepeatSettings] = None


class OwnerWorkspaceTaskCompleteRequest(BaseModel):
    action: Literal["close", "close_and_create_next"] = "close"
    next_task: Optional[OwnerWorkspaceTaskCreate] = None


class OwnerWorkspaceTaskBulkUpdate(BaseModel):
    task_ids: List[int] = Field(..., min_length=1, max_length=500)
    status: Optional[Literal["new", "in_progress", "waiting", "completed", "cancelled"]] = None
    assignee_id: Optional[int] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    deadline_at: Optional[datetime] = None


class OwnerWorkspaceTaskCommentCreate(BaseModel):
    text: str


class OwnerWorkspaceTaskCommentResponse(BaseModel):
    id: int
    task_id: int
    author_id: Optional[int] = None
    text: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceTaskMessageLink(BaseModel):
    message_id: int


class OwnerWorkspaceTaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    deadline_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    assignee_id: Optional[int] = None
    creator_id: Optional[int] = None
    project_id: Optional[int] = None
    contact_id: Optional[int] = None
    linked_message_ids: List[int] = []
    tags: Optional[List[str]] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    previous_task_id: Optional[int] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_interval: Optional[int] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[str] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[datetime] = None
    repeat_count: int = 0
    watcher_ids: List[int] = []
    reminder_at: Optional[datetime] = None
    reminder_sent: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceTaskListResponse(BaseModel):
    items: List[OwnerWorkspaceTaskResponse]
    total: int
    limit: int
    offset: int


class OwnerWorkspaceTaskStatusCountsResponse(BaseModel):
    total: int
    by_status: Dict[str, int]


class OwnerWorkspaceTasksAnalyticsOverview(BaseModel):
    completed_last_7_days: int
    completed_last_30_days: int
    avg_days_to_complete_last_30: Optional[float] = None


class OwnerWorkspaceTaskCompleteResponse(BaseModel):
    completed_task: OwnerWorkspaceTaskResponse
    next_task: Optional[OwnerWorkspaceTaskResponse] = None


class OwnerWorkspaceMessageBase(BaseModel):
    contact_id: int
    external_chat_id: Optional[str] = None
    external_message_id: Optional[str] = None
    direction: Literal["incoming", "outgoing"] = "incoming"
    text: str
    attachments: Optional[List[Dict[str, Any]]] = None
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None


class OwnerWorkspaceMessageCreate(OwnerWorkspaceMessageBase):
    pass


class OwnerWorkspaceMessageResponse(BaseModel):
    id: int
    contact_id: int
    external_chat_id: Optional[str] = None
    external_message_id: Optional[str] = None
    direction: str
    text: str
    attachments: Optional[List[Dict[str, Any]]] = None
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    linked_task_ids: List[int] = []
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceMessageCreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = "medium"
    deadline_at: Optional[datetime] = None
    assignee_id: Optional[int] = None
    project_id: Optional[int] = None


class OwnerWorkspaceMessageLinkTaskRequest(BaseModel):
    task_id: int


class OwnerWorkspaceConversationItem(BaseModel):
    contact_id: int
    contact_name: str
    last_message_at: Optional[datetime] = None
    last_message_text: Optional[str] = None
    unread_count: int = Field(0)


class OwnerWorkspaceAuditLogResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action_type: str
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    author_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceHistoryStatsCountItem(BaseModel):
    key: str
    count: int


class OwnerWorkspaceHistoryStatsAuthorItem(BaseModel):
    author_id: int
    count: int


class OwnerWorkspaceHistoryStatsDayItem(BaseModel):
    day: datetime
    count: int


class OwnerWorkspaceHistoryStatsResponse(BaseModel):
    total_rows: int
    unique_authors: int
    unique_actions: int
    first_created_at: Optional[datetime] = None
    last_created_at: Optional[datetime] = None
    entity_type_counts: List[OwnerWorkspaceHistoryStatsCountItem]
    action_counts: List[OwnerWorkspaceHistoryStatsCountItem]
    author_counts: List[OwnerWorkspaceHistoryStatsAuthorItem]
    day_counts: List[OwnerWorkspaceHistoryStatsDayItem]


class OwnerWorkspaceSearchProjectHit(BaseModel):
    id: int
    name: str
    status: str


class OwnerWorkspaceSearchContactHit(BaseModel):
    id: int
    full_name: str
    phone: str


class OwnerWorkspaceSearchTaskHit(BaseModel):
    id: int
    title: str
    status: str
    deadline_at: Optional[datetime] = None
    project_id: Optional[int] = None
    contact_id: Optional[int] = None


class OwnerWorkspaceSearchMessageHit(BaseModel):
    id: int
    contact_id: int
    contact_name: Optional[str] = None
    direction: str
    text_preview: str
    created_at: Optional[datetime] = None


class OwnerWorkspaceSearchResponse(BaseModel):
    projects: List[OwnerWorkspaceSearchProjectHit]
    contacts: List[OwnerWorkspaceSearchContactHit]
    tasks: List[OwnerWorkspaceSearchTaskHit]
    messages: List[OwnerWorkspaceSearchMessageHit] = Field(default_factory=list)


class OwnerWorkspaceDigestResponse(BaseModel):
    overdue_count: int
    overdue_tasks: List[OwnerWorkspaceTaskResponse]
    due_soon_tasks: List[OwnerWorkspaceTaskResponse]


class OwnerWorkspaceNotificationResponse(BaseModel):
    id: int
    user_id: int
    kind: str
    title: str
    body: Optional[str] = None
    task_id: Optional[int] = None
    contact_id: Optional[int] = None
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OwnerWorkspaceNotificationsEnvelope(BaseModel):
    items: List[OwnerWorkspaceNotificationResponse]
    unread_count: int


class OwnerWorkspaceUserPreferencesResponse(BaseModel):
    default_task_view: Literal["list", "kanban", "calendar", "gantt"] = "list"
    task_list_rows_per_page: int = 25
    digest_due_within_hours: int = 48
    digest_scope: Literal["all", "mine"] = "all"
    notify_email_enabled: bool = False
    notify_web_push_enabled: bool = False
    notify_task_overdue: bool = True
    notify_task_due_soon: bool = True
    notify_task_assigned: bool = True
    notify_task_comment: bool = True
    notify_task_updated: bool = True
    notify_contact_incoming_message: bool = True
    notify_task_mention: bool = True


class OwnerWorkspaceUserPreferencesPatch(BaseModel):
    default_task_view: Optional[Literal["list", "kanban", "calendar", "gantt"]] = None
    task_list_rows_per_page: Optional[int] = Field(None, ge=5, le=100)
    digest_due_within_hours: Optional[int] = Field(None, ge=8, le=336)
    digest_scope: Optional[Literal["all", "mine"]] = None
    notify_email_enabled: Optional[bool] = None
    notify_web_push_enabled: Optional[bool] = None
    notify_task_overdue: Optional[bool] = None
    notify_task_due_soon: Optional[bool] = None
    notify_task_assigned: Optional[bool] = None
    notify_task_comment: Optional[bool] = None
    notify_task_updated: Optional[bool] = None
    notify_contact_incoming_message: Optional[bool] = None
    notify_task_mention: Optional[bool] = None


class OwnerWorkspaceWebPushSubscriptionUpsert(BaseModel):
    endpoint: str = Field(..., min_length=1, max_length=4000)
    p256dh: str = Field(..., min_length=1, max_length=512)
    auth: str = Field(..., min_length=1, max_length=512)
    user_agent: Optional[str] = Field(None, max_length=255)


class OwnerWorkspaceWebPushSubscriptionDelete(BaseModel):
    endpoint: str = Field(..., min_length=1, max_length=4000)


class OwnerWorkspaceWebPushStatusResponse(BaseModel):
    configured: bool
    public_key: Optional[str] = None
    subscription_count: int = 0


# ── Task Templates ────────────────────────────────────────────────────────────

class OwnerWorkspaceTaskTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    checklist: Optional[List[dict]] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None


class OwnerWorkspaceTaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    checklist: Optional[List[dict]] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None


class OwnerWorkspaceTaskTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    checklist: Optional[List[dict]] = None
    effort_hours: Optional[int] = None
    effort_minutes: Optional[int] = None
    owner_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


OwnerWorkspaceMeetingStatus = Literal["planned", "completed", "cancelled"]
OwnerWorkspaceMeetingType = Literal["online", "offline"]
OwnerWorkspaceMeetingRecurrence = Literal["none", "daily", "weekly", "monthly"]
OwnerWorkspaceMeetingReminder = Literal["15m", "30m", "1h", "1d"]


class OwnerWorkspaceMeetingBase(BaseModel):
    title: str
    meeting_date: date
    meeting_time: time
    responsible_user_id: Optional[int] = None
    project_id: Optional[int] = None
    contact_ids: List[int] = Field(default_factory=list)
    participant_user_ids: List[int] = Field(default_factory=list)
    meeting_type: OwnerWorkspaceMeetingType = "online"
    address: Optional[str] = None
    online_url: Optional[str] = None
    recurrence_type: OwnerWorkspaceMeetingRecurrence = "none"
    reminder_type: Optional[OwnerWorkspaceMeetingReminder] = None
    agenda: Optional[str] = None
    meeting_result: Optional[str] = None
    next_steps: Optional[str] = None
    previous_meeting_id: Optional[int] = None
    next_meeting_id: Optional[int] = None
    attachments: Optional[List[Dict[str, Any]]] = None


class OwnerWorkspaceMeetingCreate(OwnerWorkspaceMeetingBase):
    pass


class OwnerWorkspaceMeetingUpdate(BaseModel):
    title: Optional[str] = None
    meeting_date: Optional[date] = None
    meeting_time: Optional[time] = None
    status: Optional[OwnerWorkspaceMeetingStatus] = None
    responsible_user_id: Optional[int] = None
    project_id: Optional[int] = None
    contact_ids: Optional[List[int]] = None
    participant_user_ids: Optional[List[int]] = None
    meeting_type: Optional[OwnerWorkspaceMeetingType] = None
    address: Optional[str] = None
    online_url: Optional[str] = None
    recurrence_type: Optional[OwnerWorkspaceMeetingRecurrence] = None
    reminder_type: Optional[OwnerWorkspaceMeetingReminder] = None
    agenda: Optional[str] = None
    meeting_result: Optional[str] = None
    next_steps: Optional[str] = None
    previous_meeting_id: Optional[int] = None
    next_meeting_id: Optional[int] = None
    attachments: Optional[List[Dict[str, Any]]] = None


class OwnerWorkspaceMeetingRescheduleRequest(BaseModel):
    meeting_date: date
    meeting_time: time
    reason: Optional[str] = None


class OwnerWorkspaceMeetingCloseRequest(BaseModel):
    meeting_result: str
    next_steps: Optional[str] = None


class OwnerWorkspaceMeetingTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    deadline_at: Optional[datetime] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = "medium"


class OwnerWorkspaceMeetingResponse(BaseModel):
    id: int
    title: str
    agenda: Optional[str] = None
    meeting_result: Optional[str] = None
    next_steps: Optional[str] = None
    meeting_date: date
    meeting_time: time
    status: str
    responsible_user_id: Optional[int] = None
    responsible_user_name: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    contact_ids: List[int] = Field(default_factory=list)
    contact_names: List[str] = Field(default_factory=list)
    participant_user_ids: List[int] = Field(default_factory=list)
    participant_user_names: List[str] = Field(default_factory=list)
    task_ids: List[int] = Field(default_factory=list)
    tasks_count: int = 0
    meeting_type: str
    address: Optional[str] = None
    online_url: Optional[str] = None
    recurrence_type: str
    reminder_type: Optional[str] = None
    previous_meeting_id: Optional[int] = None
    next_meeting_id: Optional[int] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [name for name in globals() if not name.startswith("_")]
