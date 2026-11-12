from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: SecretStr | None = None
    browser_brain_provider: Literal["openai", "fixture"] = "openai"
    browser_brain_data: Path = Path.home() / ".browser-brain"
    browser_brain_collection: str = "browser_brain_v1"
    qdrant_url: str | None = None

    @property
    def main_dir(self) -> Path:
        return self.browser_brain_data.expanduser().resolve()

    @property
    def profile_dir(self) -> Path:
        return self.main_dir / "fixture" if self.browser_brain_provider == "fixture" else self.main_dir

    @property
    def collection(self) -> str:
        suffix = "_fixture" if self.browser_brain_provider == "fixture" else ""
        return self.browser_brain_collection + suffix

    @property
    def provider_ready(self) -> bool:
        return self.browser_brain_provider == "fixture" or bool(
            self.openai_api_key and self.openai_api_key.get_secret_value().strip()
        )


settings = Settings()
