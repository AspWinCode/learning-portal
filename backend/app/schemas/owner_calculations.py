from typing import Optional

from pydantic import BaseModel


class TrainerCalculationRow(BaseModel):
    trainer_id: int
    full_name: str
    is_individual_format: bool
    rate_per_lesson: Optional[float] = None
    rate_per_hour: Optional[float] = None
    lessons_count: int = 0
    hours_count: float = 0.0
    base_payment: float = 0.0
    bonus: float = 0.0
    total_payment: float = 0.0
    already_paid: bool = False


class TrainerRateUpdate(BaseModel):
    rate_per_lesson: Optional[float] = None
    rate_per_hour: Optional[float] = None


class TrainerBonusPayload(BaseModel):
    period: str
    bonus: float


class TrainerPayPayload(BaseModel):
    period: str
