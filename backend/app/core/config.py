from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import urlparse, urlunparse

# Корень репозитория: backend/app/core/config.py → parents[3] == …/lk_oper_ruk
# (parents[2] == …/backend — там .env обычно нет, из‑за этого пустой googleClientId)
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Абсолютный путь: иначе при запуске из другой cwd (PyCharm / другой каталог)
        # подхватывался неверный .env или только переменные окружения ОС.
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_secret_key: str = "change-me"
    app_timezone: str = "Europe/Moscow"

    # Раздача собранного frontend/dist одним процессом uvicorn (production)
    serve_frontend: bool = False
    frontend_dist_dir: str = ""

    # Frontend (OAuth redirect after login, CORS)
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Google OAuth (Workspace / @pari.ru)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://127.0.0.1:1121/auth/google/callback"
    google_oauth_scopes: str = (
        "openid email profile "
        "https://www.googleapis.com/auth/calendar.readonly "
        "https://www.googleapis.com/auth/user.birthday.read"
    )
    google_oauth_hd: str = "pari.ru"

    # Email-ы с правом режима superadmin (через запятую)
    superadmin_emails: str = "nikita.popovich@pari.ru"

    # Стартовая учётка для входа по паролю (создаётся при пустой таблице user_accounts)
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    # Usedesk
    usedesk_api_base_url: AnyUrl = "https://api-usedesk.paricorp.ru"
    usedesk_api_token: str = ""
    usedesk_timeout_seconds: float = 30.0

    # Backoffice (CRM)
    backoffice_base_url: AnyUrl = "https://backoffice.pbsvc.bz"
    backoffice_login: str = ""
    backoffice_fsid: str = ""
    backoffice_user_id: str = ""
    backoffice_user_lang: str = "ru"
    backoffice_timeout_seconds: float = 30.0

    # Postgres
    database_url: str = ""
    # true — SSL для удалённого Postgres (если сервер требует шифрование)
    database_ssl: bool = False

    # Гороскоп: ночное обновление кэша (Europe/Moscow / APP_TIMEZONE)
    horoscope_refresh_hour: int = 0
    horoscope_refresh_minute: int = 10

    # UIS Data API (JSON-RPC)
    uis_data_api_base_url: AnyUrl = "https://dataapi.uiscom.ru/v2.0"
    uis_data_api_access_token: str = ""
    uis_data_api_request_id: str = "req1"
    uis_data_api_timeout_seconds: float = 30.0

    # 3i TouchPoint Analytics (ITECH_* или TP_* в .env)
    itech_resource_base_url: AnyUrl = Field(
        default="https://api.v20.touchpoint-analytics.ru/v1",
        validation_alias=AliasChoices(
            "itech_resource_base_url",
            "tp_api_base_url",
            "TP_API_BASE_URL",
        ),
    )
    itech_oauth_token_url: AnyUrl = Field(
        default="https://oauth.v20.touchpoint-analytics.ru/token/",
        validation_alias=AliasChoices(
            "itech_oauth_token_url",
            "tp_auth_url",
            "TP_AUTH_URL",
        ),
    )
    itech_oauth_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("itech_oauth_client_id", "tp_client_id", "TP_CLIENT_ID"),
    )
    itech_oauth_client_secret: str = Field(
        default="",
        validation_alias=AliasChoices("itech_oauth_client_secret", "tp_client_secret", "TP_CLIENT_SECRET"),
    )
    itech_oauth_username: str = Field(
        default="",
        validation_alias=AliasChoices("itech_oauth_username", "tp_username", "TP_USERNAME"),
    )
    itech_oauth_password: str = Field(
        default="",
        validation_alias=AliasChoices("itech_oauth_password", "tp_password", "TP_PASSWORD"),
    )
    itech_oauth_grant_type: str = "password"
    itech_access_token: str = Field(
        default="",
        validation_alias=AliasChoices("itech_access_token", "tp_access_token", "TP_ACCESS_TOKEN"),
    )
    itech_timeout_seconds: float = 30.0

    # Портал мониторинга (final-monitoring)
    monitoring_api_base_url: AnyUrl = "https://final-monitoring.paricorp.ru:4446/api/v1"
    monitoring_api_token: str = ""
    monitoring_timeout_seconds: float = 30.0

    # Google Geocoding API (Maps Demo Key или платный ключ)
    google_geocoding_api_key: str = ""

    # Яндекс Геокодер (fallback, если Google недоступен)
    yandex_geocoder_api_key: str = ""

    # Справочник Express (таблица с HUID и ФИО, напр. express_user_mentions)
    # Включите и укажите EXPRESS_USERS_DATABASE_URL, если таблица в другой БД.
    express_users_enabled: bool = False
    express_users_table: str = "express_user_mentions"
    express_users_database_url: str = ""
    # true — читать таблицу из DATABASE_URL (если она в той же БД, что ЛК)
    express_users_use_main_database: bool = False
    express_users_cache_seconds: int = 300

    @field_validator("frontend_url", mode="before")
    @classmethod
    def _normalize_frontend_url(cls, v: object) -> str:
        """Локальный URL без порта → :5173 (частая опечатка в .env)."""
        url = str(v or "").strip().rstrip("/")
        if not url:
            return "http://localhost:5173"
        p = urlparse(url)
        host = (p.hostname or "").lower()
        if host in ("127.0.0.1", "localhost") and not p.port:
            netloc = f"{host}:5173"
            return urlunparse((p.scheme or "http", netloc, "", "", "", ""))
        return url


def resolve_frontend_dist(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    if settings.frontend_dist_dir.strip():
        return Path(settings.frontend_dist_dir).expanduser().resolve()
    return _REPO_ROOT / "frontend" / "dist"


_DEV_OAUTH_REDIRECT = "http://127.0.0.1:1121/auth/google/callback"


def resolve_oauth_redirect_uri(settings: Settings | None = None) -> str:
    """
    Redirect URI для Google OAuth.
    В production, если GOOGLE_OAUTH_REDIRECT_URI не задан или dev-дефолт — берём из FRONTEND_URL.
    """
    settings = settings or get_settings()
    configured = settings.google_oauth_redirect_uri.strip()
    frontend = settings.frontend_url.strip().rstrip("/")
    if settings.app_env != "development" and frontend:
        expected = f"{frontend}/auth/google/callback"
        if not configured or configured == _DEV_OAUTH_REDIRECT:
            return expected
        if configured != expected:
            print(
                "[LK] Предупреждение: GOOGLE_OAUTH_REDIRECT_URI не совпадает с FRONTEND_URL.\n"
                f"  env redirect: {configured}\n"
                f"  из FRONTEND_URL: {expected}\n"
                "  Используется значение из GOOGLE_OAUTH_REDIRECT_URI. "
                "Сверьте его с Google Cloud Console."
            )
        return configured
    return configured or _DEV_OAUTH_REDIRECT


@lru_cache
def get_settings() -> Settings:
    return Settings()

