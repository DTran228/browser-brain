from datetime import datetime
import json
from threading import RLock

from ai.services import embed
from chat_history.services import clear_messages
from config.config import settings
from fast_api.models import PageUpload
from qdrant.services import clear_collection, ingest, query_sources

# One local profile and one backend process. Qdrant local mode also uses an
# exclusive lock on its data directory.
index_lock = RLock()


def clear_marker() -> tuple[datetime | None, bool]:
    marker = settings.profile_dir / "clear-history.json"
    if not marker.exists():
        return None, False
    record = json.loads(marker.read_text(encoding="utf-8"))
    return datetime.fromisoformat(record["before"]), record["pending"]


def save_marker(before: datetime, pending: bool) -> None:
    marker = settings.profile_dir / "clear-history.json"
    temporary = marker.with_suffix(".tmp")
    temporary.write_text(json.dumps({"before": before.isoformat(), "pending": pending}), encoding="utf-8")
    temporary.replace(marker)


def finish_pending_clear() -> None:
    with index_lock:
        before, pending = clear_marker()
        if before is not None and pending:
            clear_collection()
            clear_messages()
            save_marker(before, pending=False)


def clear_history(before: datetime) -> None:
    with index_lock:
        previous, _ = clear_marker()
        if previous is None or before > previous:
            save_marker(before, pending=True)
        finish_pending_clear()


def process_uploaded_page(page: PageUpload) -> int:
    with index_lock:
        finish_pending_clear()
        before, _ = clear_marker()
        return ingest(page, before)


def retrieve(query: str):
    with index_lock:
        finish_pending_clear()
        before, _ = clear_marker()
    vector = embed([query])[0]
    with index_lock:
        finish_pending_clear()
        current, _ = clear_marker()
        if current != before:
            return [], before
        return query_sources(vector), before
