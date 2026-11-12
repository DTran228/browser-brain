from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from config.config import settings

_client: QdrantClient | None = None
VECTOR_SIZE = 1536


def get_qdrant_client() -> QdrantClient:
    if _client is None:
        raise RuntimeError("Qdrant has not been initialized.")
    return _client


def initialize_qdrant_client() -> None:
    global _client
    _client = (
        QdrantClient(url=settings.qdrant_url, timeout=5)
        if settings.qdrant_url
        else QdrantClient(path=str(settings.profile_dir / "qdrant"))
    )
    if not _client.collection_exists(settings.collection):
        _client.create_collection(
            collection_name=settings.collection,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
    vectors = _client.get_collection(settings.collection).config.params.vectors
    if not isinstance(vectors, VectorParams) or vectors.size != VECTOR_SIZE or vectors.distance != Distance.COSINE:
        raise RuntimeError("Browser Brain needs a collection with 1536-dimensional cosine vectors.")


def close_qdrant_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
