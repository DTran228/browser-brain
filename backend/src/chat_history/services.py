from chat_history.models import ChatMessage
from config.config import settings

MAX_CHAT_HISTORY_SIZE = 100


def read_messages() -> list[ChatMessage]:
    path = settings.profile_dir / "chat_history.jsonl"
    if not path.exists():
        return []
    return [ChatMessage.model_validate_json(line) for line in path.read_text(encoding="utf-8").splitlines()]


def save_exchange(user: ChatMessage, assistant: ChatMessage) -> None:
    path = settings.profile_dir / "chat_history.jsonl"
    temporary = path.with_suffix(".tmp")
    messages = (read_messages() + [user, assistant])[-MAX_CHAT_HISTORY_SIZE:]
    temporary.write_text("".join(message.model_dump_json() + "\n" for message in messages), encoding="utf-8")
    temporary.replace(path)


def clear_messages() -> None:
    (settings.profile_dir / "chat_history.jsonl").unlink(missing_ok=True)
