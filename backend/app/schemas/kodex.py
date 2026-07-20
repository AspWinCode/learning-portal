from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class KodexCaseCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64, pattern=r'^[a-z0-9\-]+$')
    num: Optional[str] = Field(None, max_length=32)
    title: str = Field(..., min_length=1, max_length=512)
    curator: Optional[str] = Field(None, max_length=128)
    playable: bool = False
    rank: int = Field(1, ge=1)
    difficulty: int = Field(1, ge=1, le=3)
    reward_credits: int = Field(0, ge=0)
    reward_rep: int = Field(0, ge=0)
    goal: Optional[str] = None
    suspects: Optional[str] = None
    task: Optional[str] = None
    anno: Optional[str] = None
    briefing: List[Any] = []
    materials: List[Any] = []
    evidence: List[Any] = []
    hints: Dict[str, Any] = {}
    versions: List[Any] = []
    finale: List[Any] = []
    theory: List[Any] = []


class KodexCaseUpdate(BaseModel):
    slug: Optional[str] = Field(None, min_length=1, max_length=64, pattern=r'^[a-z0-9\-]+$')
    num: Optional[str] = Field(None, max_length=32)
    title: Optional[str] = Field(None, min_length=1, max_length=512)
    curator: Optional[str] = Field(None, max_length=128)
    playable: Optional[bool] = None
    rank: Optional[int] = Field(None, ge=1)
    difficulty: Optional[int] = Field(None, ge=1, le=3)
    reward_credits: Optional[int] = Field(None, ge=0)
    reward_rep: Optional[int] = Field(None, ge=0)
    goal: Optional[str] = None
    suspects: Optional[str] = None
    task: Optional[str] = None
    anno: Optional[str] = None
    briefing: Optional[List[Any]] = None
    materials: Optional[List[Any]] = None
    evidence: Optional[List[Any]] = None
    hints: Optional[Dict[str, Any]] = None
    versions: Optional[List[Any]] = None
    finale: Optional[List[Any]] = None
    theory: Optional[List[Any]] = None
    status: Optional[str] = None


class KodexCaseResponse(BaseModel):
    id: int
    slug: str
    num: Optional[str]
    title: str
    curator: Optional[str]
    playable: bool
    rank: int
    difficulty: int
    reward_credits: int
    reward_rep: int
    goal: Optional[str]
    suspects: Optional[str]
    task: Optional[str]
    anno: Optional[str]
    briefing: List[Any]
    materials: List[Any]
    evidence: List[Any]
    hints: Dict[str, Any]
    versions: List[Any]
    finale: List[Any]
    theory: List[Any]
    status: str
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class KodexCaseSummary(BaseModel):
    id: int
    slug: str
    num: Optional[str]
    title: str
    curator: Optional[str]
    playable: bool
    rank: int
    difficulty: int
    reward_credits: int
    reward_rep: int
    anno: Optional[str]
    status: str
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}
