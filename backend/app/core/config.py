import json
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://alpr:alpr@localhost:5432/alpr"
    redis_url: str = "redis://localhost:6379/0"
    storage_dir: str = "./storage"
    cors_origins: str = (
        "http://localhost:5173",
        "http://10.32.70.136",
        "http://10.32.70.136:5173"
    )

    # ── Telegram alerts ───────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_timeout_sec: float = 10.0

    # ── JWT authentication ────────────────────────────────────────────────────
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours

    # ── Data lifecycle ────────────────────────────────────────────────────────
    retention_days: int = 90  # delete captures older than this many days

    # ── Logging ───────────────────────────────────────────────────────────────
    log_json: bool = True  # set LOG_JSON=false for plain-text in development

    @property
    def cors_origins_list(self):
        if not self.cors_origins:
            return []
        if isinstance(self.cors_origins, (list, tuple)):
            return [str(item).strip() for item in self.cors_origins if str(item).strip()]
        origins = self.cors_origins.strip()
        if not origins:
            return []
        if origins.startswith("["):
            try:
                parsed = json.loads(origins)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return [x.strip() for x in origins.split(",") if x.strip()]

    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()
