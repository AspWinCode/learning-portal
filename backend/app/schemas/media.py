from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class MediaFileResponse(BaseModel):
    id: int
    filename: str
    original_name: str
    size: int
    mime_type: str
    url: str
    created_at: datetime
    uploaded_by_name: Optional[str] = None

    model_config = {"from_attributes": True}
