from datetime import datetime, timedelta, timezone
import json
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from qdrant_client.models import PointStruct

from ai.services import fixture_vector
from config.config import settings
from fast_api.models import MAX_BATCH_BYTES
from main import app
from qdrant.qdrant_manager import get_qdrant_client
from qdrant.services import query_sources

ALPHA = "http://127.0.0.1:8765/alpha.html?edition=lab#shared"
BETA = "http://127.0.0.1:8765/beta.html?edition=field#shared"
TEXT = "The cobalt lantern protocol records nighttime harbor visibility."
FIRST = "2025-01-01T12:00:00Z"
SECOND = "2025-01-01T12:01:00Z"


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "browser_brain_data", tmp_path)
    monkeypatch.setattr(settings, "browser_brain_provider", "fixture")
    monkeypatch.setattr(settings, "qdrant_url", None)
    with TestClient(app) as client:
        yield client


def batch(url=ALPHA, time=FIRST, text=TEXT):
    return {
        "batch_id": str(uuid4()), "document_id": str(uuid4()), "url": url,
        "observations": [{"text": text, "captured_at": time}],
    }


def count():
    return get_qdrant_client().count(settings.collection, exact=True).count


def test_same_text_two_sources_replayed_and_legacy_metadata(api):
    first = batch()
    second = batch(BETA, SECOND)
    for page in (first, second, first, second):
        response = api.post("/pages/upload", json=page)
        assert response.status_code == 200
        assert response.json() == {"batch_id": page["batch_id"], "indexed": 1}
    assert count() == 2
    legacy_url = "https://example.test/legacy?chapter=2#note"
    get_qdrant_client().upsert(settings.collection, wait=True, points=[
        PointStruct(id=str(uuid4()), vector=fixture_vector(TEXT), payload={
            "content": TEXT, "url": legacy_url, "timestamp": FIRST,
        })
    ])
    sources = {source.url: source for source in query_sources(fixture_vector(TEXT))}
    assert sources[ALPHA].captured_at == datetime.fromisoformat(FIRST)
    assert sources[BETA].captured_at == datetime.fromisoformat(SECOND)
    assert sources[legacy_url].captured_at is None
    assert sources[legacy_url].indexed_at == datetime.fromisoformat(FIRST)


def test_partial_write_then_retry_and_response_lost_after_commit(api, monkeypatch):
    page = batch()
    page["observations"].append({"text": "Harbor observers log the wind.", "captured_at": FIRST})
    db = get_qdrant_client()
    write = db.upsert

    def partial(*, collection_name, points, wait):
        write(collection_name=collection_name, points=points[:1], wait=wait)
        raise OSError("synthetic failure after first point")

    monkeypatch.setattr(db, "upsert", partial)
    assert api.post("/pages/upload", json=page).status_code == 503
    assert count() == 1
    monkeypatch.setattr(db, "upsert", write)
    assert api.post("/pages/upload", json=page).status_code == 200
    original, _ = db.scroll(settings.collection, with_payload=True)
    assert api.post("/pages/upload", json=page).status_code == 200
    replay, _ = db.scroll(settings.collection, with_payload=True)
    assert count() == 2
    assert original == replay


def test_same_document_keeps_earliest_capture_after_lru_eviction(api, monkeypatch):
    later = batch(time=SECOND)
    assert api.post("/pages/upload", json=later).status_code == 200
    earlier = {**later, "batch_id": str(uuid4()), "observations": [{"text": TEXT, "captured_at": FIRST}]}
    monkeypatch.setattr("qdrant.services.embed", lambda _: pytest.fail("already indexed"))
    assert api.post("/pages/upload", json=earlier).status_code == 200
    assert count() == 1
    assert query_sources(fixture_vector(TEXT))[0].captured_at == datetime.fromisoformat(FIRST)


def test_clear_retry_cannot_reintroduce_old_upload_or_remove_new_records(api):
    old = batch()
    assert api.post("/pages/upload", json=old).status_code == 200
    now = datetime.now(timezone.utc)
    clear = {"before": now.isoformat()}
    assert api.post("/history/clear", json=clear).status_code == 200
    assert api.post("/pages/upload", json=old).json()["indexed"] == 0
    assert count() == 0
    fresh = batch(time=(now + timedelta(milliseconds=1)).isoformat())
    assert api.post("/pages/upload", json=fresh).status_code == 200
    assert api.post("/history/clear", json=clear).status_code == 200
    assert count() == 1


def test_contract_is_bounded_and_web_origin_cannot_write(api):
    assert api.post("/pages/upload", content=b" " * (MAX_BATCH_BYTES + 1)).status_code == 413
    assert api.post("/pages/upload", json=batch(text="é" * 2049)).status_code == 422
    assert api.post("/pages/upload", json=batch(url="javascript:alert(1)")).status_code == 422
    assert api.post("/pages/upload", json=batch(), headers={"Origin": "https://example.test"}).status_code == 403
    assert count() == 0



def test_search_stream_retains_source_cards_on_generation_failure(api, monkeypatch):
    assert api.post("/pages/upload", json=batch()).status_code == 200
    assert api.post("/pages/upload", json=batch(BETA, SECOND)).status_code == 200

    def broken_generator(*_):
        yield "One fragment."
        raise OSError("private provider detail")

    monkeypatch.setattr("fast_api.routes.stream_answer", broken_generator)
    response = api.post("/chat/query/stream", json={"query": TEXT})
    assert response.headers["content-type"] == "application/x-ndjson"
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [item["type"] for item in events] == ["sources", "answer", "notice", "done"]
    assert {item["url"] for item in events[0]["sources"]} == {ALPHA, BETA}
    assert "private provider detail" not in response.text
    saved = api.get("/chat/messages").json()["messages"]
    assert saved[-1]["sources"] == events[0]["sources"]
    assert api.post("/history/clear", json={"before": datetime.now(timezone.utc).isoformat()}).status_code == 200
    assert api.get("/chat/messages").json()["messages"] == []


def test_empty_search_and_unconfigured_provider(api, monkeypatch):
    empty = api.post("/chat/query/stream", json={"query": "unrelated archaeology"})
    assert '"sources": []' in empty.text
    assert "No relevant indexed sources" in empty.text
    assert api.post("/chat/query/stream", json={"query": "   "}).status_code == 422
    monkeypatch.setattr(settings, "browser_brain_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    assert api.get("/health").json()["provider_ready"] is False
    assert api.post("/chat/query/stream", json={"query": TEXT}).status_code == 503
