from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5
import json

from pydantic import ValidationError
from qdrant_client import models

from ai.services import EMBEDDING_MODEL, embed
from config.config import settings
from fast_api.models import PageUpload, Source
from qdrant.qdrant_manager import get_qdrant_client

SCORE_THRESHOLD = 0.22


def ingest(page: PageUpload, clear_before: datetime | None) -> int:
    client = get_qdrant_client()
    # Version 1 embeds each bounded, normalized observation as a single vector.
    version = "observation-v1/fixture-v1" if settings.browser_brain_provider == "fixture" else f"observation-v1/{EMBEDDING_MODEL}"
    payloads = {}
    for observation in page.observations:
        if clear_before is not None and observation.captured_at <= clear_before:
            continue
        key = json.dumps([version, str(page.document_id), page.url, observation.text], ensure_ascii=False)
        point_id = str(uuid5(NAMESPACE_URL, key))
        previous = payloads.get(point_id)
        if previous is None or observation.captured_at < previous["captured_at"]:
            payloads[point_id] = {
                "content": observation.text, "url": page.url, "captured_at": observation.captured_at,
                "document_id": str(page.document_id), "batch_id": str(page.batch_id), "version": version,
            }

    if not payloads:
        return 0
    existing = {
        str(point.id): point.payload or {}
        for point in client.retrieve(settings.collection, ids=list(payloads), with_payload=True)
    }
    fresh = [(point_id, payload) for point_id, payload in payloads.items() if point_id not in existing]
    if fresh:
        vectors = embed([payload["content"] for _, payload in fresh])
        indexed_at = datetime.now(timezone.utc).isoformat()
        result = client.upsert(
            collection_name=settings.collection,
            points=[
                models.PointStruct(
                    id=point_id, vector=vector,
                    payload={**payload, "captured_at": payload["captured_at"].isoformat(), "indexed_at": indexed_at},
                )
                for (point_id, payload), vector in zip(fresh, vectors, strict=True)
            ],
            wait=True,
        )
        if result.status != models.UpdateStatus.COMPLETED:
            raise RuntimeError("Qdrant did not confirm the write.")

    for point_id, stored in existing.items():
        first_observation = payloads[point_id]["captured_at"]
        if first_observation < datetime.fromisoformat(stored["captured_at"]):
            result = client.set_payload(
                settings.collection, payload={"captured_at": first_observation.isoformat()}, points=[point_id], wait=True,
            )
            if result.status != models.UpdateStatus.COMPLETED:
                raise RuntimeError("Qdrant did not confirm the metadata update.")
    return len(payloads)


def query_sources(embedding: list[float], limit: int = 8) -> list[Source]:
    points = get_qdrant_client().query_points(
        collection_name=settings.collection, query=embedding, limit=48, score_threshold=SCORE_THRESHOLD,
        with_payload=True,
    ).points
    sources: dict[str, Source] = {}
    for point in points:
        payload = point.payload or {}
        url = payload.get("url")
        content = payload.get("content")
        if not isinstance(url, str) or not isinstance(content, str) or url in sources:
            continue
        try:
            sources[url] = Source(
                id=f"S{len(sources) + 1}", url=url, snippet=content[:1200],
                captured_at=payload.get("captured_at"), indexed_at=payload.get("indexed_at") or payload.get("timestamp"),
            )
        except ValidationError:
            continue
        if len(sources) == limit:
            break
    return list(sources.values())


def clear_collection() -> None:
    result = get_qdrant_client().delete(
        settings.collection, points_selector=models.FilterSelector(filter=models.Filter()), wait=True,
    )
    if result.status != models.UpdateStatus.COMPLETED:
        raise RuntimeError("Qdrant did not confirm the deletion.")
