from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.common import AbonementStatus, DiscountType


AbonementFormat = Literal["individual", "package", "group"]


class AbonementBase(BaseModel):
    name: str
    price: float = 0.0
    discount_type: DiscountType = DiscountType.NONE
    discount_value: float = 0.0
    abonement_format: Optional[AbonementFormat] = None


class AbonementCreate(AbonementBase):
    pass


class AbonementUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    abonement_format: Optional[AbonementFormat] = None
    status: Optional[AbonementStatus] = None


class AbonementResponse(AbonementBase):
    id: int
    status: AbonementStatus
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AbonementListResponse(BaseModel):
    total: int
    items: List[AbonementResponse]
    skip: int
    limit: int


__all__ = [name for name in globals() if not name.startswith("_")]
