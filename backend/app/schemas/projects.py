from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel

from app.schemas.users import UserResponse


class ProjectBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    entity_type: Literal["parent", "student"]


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    archived: Optional[bool] = None


class ProjectStageResponse(BaseModel):
    id: int
    project_id: int
    name: str
    position: int

    class Config:
        from_attributes = True


class ProjectCardResponse(BaseModel):
    id: int
    project_id: int
    stage_id: int
    entity_type: str
    entity_id: int
    position: int
    created_at: datetime
    display_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectStageCreate(BaseModel):
    name: str
    position: Optional[int] = 0


class ProjectCardMove(BaseModel):
    stage_id: int
    position: Optional[int] = 0


class ProjectResponse(ProjectBase):
    id: int
    created_by_id: int
    archived: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[UserResponse] = None
    stages: Optional[List[ProjectStageResponse]] = []
    card_count: Optional[int] = None

    class Config:
        from_attributes = True


__all__ = [name for name in globals() if not name.startswith("_")]
