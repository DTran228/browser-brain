from datetime import datetime
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator

MAX_BATCH_BYTES = 24 * 1024
MAX_TEXT_BYTES = 4096


def validate_url(url: str) -> str:
    parsed = urlsplit(url)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or len(url.encode("utf-8")) > 4096
            or any(ord(char) <= 32 for char in url)):
        raise ValueError("Use a valid HTTP(S) URL without credentials.")
    _ = parsed.port
    return url


SourceUrl = Annotated[str, StringConstraints(min_length=1, max_length=4096), AfterValidator(validate_url)]


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, Field(min_length=1, max_length=MAX_TEXT_BYTES)]
    captured_at: AwareDatetime

    @field_validator("text")
    @classmethod
    def bound_text(cls, text: str) -> str:
        if not text.strip() or len(text.encode("utf-8")) > MAX_TEXT_BYTES:
            raise ValueError("Observation must contain 1–4096 UTF-8 bytes of text.")
        return text


class PageUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: UUID
    document_id: UUID
    url: SourceUrl
    observations: Annotated[list[Observation], Field(min_length=1, max_length=24)]


class Source(BaseModel):
    id: str
    url: SourceUrl
    snippet: str
    captured_at: datetime | None = None
    indexed_at: datetime | None = None


class QueryRequest(BaseModel):
    query: Annotated[str, StringConstraints(min_length=1, max_length=1000, strip_whitespace=True)]


class ClearRequest(BaseModel):
    before: AwareDatetime
