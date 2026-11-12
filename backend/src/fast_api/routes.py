from datetime import datetime, timedelta, timezone
from typing import Iterator
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIStatusError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from ai.services import stream_answer
from chat_history.models import ChatMessage
from chat_history.services import read_messages, save_exchange
from config.config import settings
from fast_api.models import ClearRequest, MAX_BATCH_BYTES, PageUpload, QueryRequest, Source
from fast_api.services import clear_history, finish_pending_clear, index_lock, process_uploaded_page, retrieve, clear_marker
from qdrant.qdrant_manager import get_qdrant_client

router = APIRouter()


@router.get("/")
def root():
    return {"message": "Browser Brain"}


@router.get("/health")
def health():
    try:
        ready = get_qdrant_client().collection_exists(settings.collection)
    except Exception:
        ready = False
    return {"qdrant": ready, "provider_ready": settings.provider_ready, "provider": settings.browser_brain_provider}


def require_provider() -> None:
    if not settings.provider_ready:
        raise HTTPException(503, "Set OPENAI_API_KEY in backend/.env and restart the backend.")


def provider_error(error: APIConnectionError | APIStatusError) -> HTTPException:
    if isinstance(error, APIStatusError):
        if error.status_code == 429:
            retry = error.response.headers.get("Retry-After")
            return HTTPException(429, "Embedding or answer provider is rate-limited.", headers={"Retry-After": retry} if retry else None)
        if error.status_code in (401, 403):
            return HTTPException(401, "Check the backend's OpenAI API key and permissions.")
        if 400 <= error.status_code < 500:
            return HTTPException(422, "The embedding or answer provider rejected the request.")
    return HTTPException(503, "Could not reach the configured OpenAI provider.")


@router.post("/pages/upload")
async def upload_page(request: Request):
    body = bytearray()
    async for part in request.stream():
        if len(body) + len(part) > MAX_BATCH_BYTES:
            raise HTTPException(413, "Upload exceeds 24 KiB.")
        body.extend(part)
    try:
        page = PageUpload.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422, "Invalid capture batch.") from None
    if any(observation.captured_at > datetime.now(timezone.utc) + timedelta(minutes=5) for observation in page.observations):
        raise HTTPException(422, "Capture time is ahead of the backend clock.")
    require_provider()
    try:
        count = await run_in_threadpool(process_uploaded_page, page)
    except (APIConnectionError, APIStatusError) as error:
        raise provider_error(error) from None
    except Exception:
        raise HTTPException(503, "Index write incomplete. The batch can be retried.") from None
    return {"batch_id": page.batch_id, "indexed": count}


@router.post("/history/clear")
def clear_local_history(request: ClearRequest):
    if request.before > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(422, "Clear time is ahead of the backend clock.")
    try:
        clear_history(request.before)
    except Exception:
        raise HTTPException(503, "Could not clear history. Retry after reconnecting.") from None
    return {"cleared": True}


@router.get("/chat/messages")
def get_chat_messages():
    with index_lock:
        finish_pending_clear()
        return {"messages": read_messages()[-50:]}



def event(kind: str, **fields) -> str:
    return json.dumps({"type": kind, **fields}, ensure_ascii=False) + "\n"


def search_stream(query: str, sources: list[Source], revision: datetime | None) -> Iterator[str]:
    yield event("sources", sources=[source.model_dump(mode="json") for source in sources])
    answer = []
    notice = None
    if sources:
        try:
            for text in stream_answer(query, sources):
                answer.append(text)
                yield event("answer", text=text)
        except Exception:
            notice = "Answer generation failed. You can still open the retrieved sources."
    else:
        notice = "No relevant indexed sources found."
    with index_lock:
        current, _ = clear_marker()
        if current == revision:
            try:
                save_exchange(
                    ChatMessage(role="user", content=query),
                    ChatMessage(role="assistant", content="".join(answer), sources=sources, notice=notice),
                )
            except OSError:
                notice = (notice + " " if notice else "") + "Could not save this exchange to chat history."
    if notice:
        yield event("notice", message=notice)
    yield event("done")


@router.post("/chat/query/stream")
def search(request: QueryRequest):
    require_provider()
    try:
        sources, revision = retrieve(request.query)
    except (APIConnectionError, APIStatusError) as error:
        raise provider_error(error) from None
    except Exception:
        raise HTTPException(503, "Could not search the local index. Check Qdrant storage.") from None
    return StreamingResponse(
        search_stream(request.query, sources, revision),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )
