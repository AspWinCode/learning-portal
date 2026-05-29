from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ProgramSummaryResponse(BaseModel):
    id: int
    name: str
    version: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class TopicBase(BaseModel):
    name: str
    description: Optional[str] = None
    final_result: Optional[str] = None
    order: int = 0


class TopicCreate(TopicBase):
    pass


class TopicResponse(TopicBase):
    id: int
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModuleBase(BaseModel):
    name: str
    order: int = 0


class ModuleCreate(ModuleBase):
    topics: List[TopicCreate] = []


class ModuleResponse(ModuleBase):
    id: int
    status: str
    topics: List[TopicResponse] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProgramBase(BaseModel):
    name: str


class ProgramCreate(ProgramBase):
    modules: List[ModuleCreate] = []
    trainer_ids: Optional[List[int]] = []


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    modules: Optional[List[ModuleCreate]] = None


class ProgramResponse(ProgramBase):
    id: int
    version: int
    parent_program_id: Optional[int] = None
    status: str
    created_at: datetime
    modules: List[ModuleResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ProgramListResponse(BaseModel):
    total: int
    items: List[ProgramResponse]
    skip: int
    limit: int


__all__ = [name for name in globals() if not name.startswith("_")]
