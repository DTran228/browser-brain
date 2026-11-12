"""Explicitly copy the old chunks collection to the configured OpenAI profile."""

import argparse
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models

from config.config import settings
from qdrant.qdrant_manager import close_qdrant_client, get_qdrant_client, initialize_qdrant_client, VECTOR_SIZE


def migrate(source_url: str) -> int:
    if settings.browser_brain_provider != "openai" or settings.collection == "chunks":
        raise SystemExit("Choose the OpenAI profile and a destination collection distinct from 'chunks'.")
    settings.profile_dir.mkdir(parents=True, exist_ok=True)
    source = QdrantClient(url=source_url, timeout=10)
    count = 0
    try:
        vectors = source.get_collection("chunks").config.params.vectors
        if not isinstance(vectors, models.VectorParams) or vectors.size != VECTOR_SIZE or vectors.distance != models.Distance.COSINE:
            raise SystemExit("The old collection must have 1536-dimensional cosine vectors.")
        initialize_qdrant_client()
        target = get_qdrant_client()
        offset = None
        while True:
            records, offset = source.scroll("chunks", offset=offset, limit=100, with_payload=True, with_vectors=True)
            points = [
                models.PointStruct(
                    id=str(uuid5(NAMESPACE_URL, f"browser-brain:legacy:chunks:{record.id}")),
                    vector=record.vector,
                    payload=record.payload,
                )
                for record in records
            ]
            if points:
                result = target.upsert(settings.collection, points, wait=True)
                if result.status != models.UpdateStatus.COMPLETED:
                    raise RuntimeError("Qdrant did not acknowledge the copy.")
                count += len(points)
            if offset is None:
                return count
    finally:
        source.close()
        close_qdrant_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-url", required=True, help="Qdrant server hosting the original chunks collection.")
    arguments = parser.parse_args()
    print(f"Copied {migrate(arguments.source_url)} legacy records.")
