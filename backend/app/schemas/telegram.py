from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TelegramLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime
    deep_link_url: Optional[str] = None
