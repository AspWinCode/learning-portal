from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class OwnerDashboardMetricPoint(BaseModel):
    label: str
    value: float


class LeadAIInsightResponse(BaseModel):
    score: int
    stage: str
    best_next_action: str
    reasons: List[str] = Field(default_factory=list)


class StudentWeakZoneAIResponse(BaseModel):
    topic_name: str
    module_name: Optional[str] = None
    average_grade: float
    grade_count: int
    recommendation: str


class StudentDropoutRiskAIResponse(BaseModel):
    score: int
    level: str
    reasons: List[str] = Field(default_factory=list)
    recommended_action: str


class StudentLearningAIInsightResponse(BaseModel):
    weak_zone: Optional[StudentWeakZoneAIResponse] = None
    dropout_risk: StudentDropoutRiskAIResponse


class OwnerAIInsightResponse(BaseModel):
    kind: str
    severity: str
    title: str
    summary: str


class OwnerDashboardSummaryResponse(BaseModel):
    generated_at: datetime
    month_label: str
    active_students: int
    active_groups: int
    active_trainers: int
    active_sales_managers: int
    new_leads_today: int
    new_leads_month: int
    won_leads_month: int
    active_pipeline_count: int
    registered_events_month: int
    payments_received_month: float
    payments_transactions_month: int
    overdue_payments_3_count: int
    overdue_payments_10_count: int
    owner_workspace_overdue_tasks: int
    owner_workspace_waiting_tasks: int
    owner_workspace_completed_7_days: int
    owner_workspace_completed_30_days: int
    owner_workspace_avg_days_to_complete_30: Optional[float] = None
    makeups_pending_total: int
    makeups_waiting_parent: int
    makeups_assigned: int
    leads_last_14_days: List[OwnerDashboardMetricPoint]
    payments_last_14_days: List[OwnerDashboardMetricPoint]
    ai_insights: List[OwnerAIInsightResponse] = Field(default_factory=list)


__all__ = [name for name in globals() if not name.startswith("_")]
