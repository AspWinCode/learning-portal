from pydantic import BaseModel
from typing import Optional


class PublishResponse(BaseModel):
    status: str
    message: str
    built_at: Optional[str] = None
