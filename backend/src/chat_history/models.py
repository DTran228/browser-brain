from typing import Literal

from pydantic import BaseModel, Field

from fast_api.models import Source


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    sources: list[Source] = Field(default_factory=list)
    notice: str | None = None
