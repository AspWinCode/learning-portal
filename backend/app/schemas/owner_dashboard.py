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


class AcademyMetricsFormatBreakdown(BaseModel):
    abonement_format: str
    format_label: str
    students_count: int
    total_amount: float
    average_check: float


class AcademyMetricsGroupBreakdown(BaseModel):
    group_id: int
    group_name: str
    trainer_name: Optional[str] = None
    students_count: int
    total_amount: float
    average_check: float


class AcademyMetricsNpsResponse(BaseModel):
    responses_count: int
    promoters_count: int
    passives_count: int
    detractors_count: int
    nps_score: Optional[float] = None


class AcademyMetricsRatingRow(BaseModel):
    label: str
    students_count: int


class AcademyMetricsResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    students_count: int
    total_amount: float
    average_check: float
    breakdown_by_format: List[AcademyMetricsFormatBreakdown]
    breakdown_by_group: List[AcademyMetricsGroupBreakdown]
    cac: float
    ltv: float
    ltv_cac_ratio: float
    retention_3_pct: float
    retention_6_pct: float
    retention_12_pct: float
    nps: AcademyMetricsNpsResponse
    rating_by_grade: List[AcademyMetricsRatingRow]
    rating_by_school: List[AcademyMetricsRatingRow]


class AcademyMetricsRatingStudent(BaseModel):
    id: int
    full_name: str
    grade: Optional[str] = None
    school: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None


__all__ = [name for name in globals() if not name.startswith("_")]
