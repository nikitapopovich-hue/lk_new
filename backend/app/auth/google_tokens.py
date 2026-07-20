from __future__ import annotations

import time

from app.auth.identity import Identity
from app.core.config import Settings
from app.integrations.google.calendar import refresh_access_token


async def ensure_google_access_token(identity: Identity, settings: Settings) -> str:
    token = identity.google_access_token.strip()
    refresh = identity.google_refresh_token.strip()
    now = int(time.time())
    if token and identity.google_access_exp > now + 30:
        return token
    if not refresh:
        raise RuntimeError(
            "Нет доступа к Google Calendar. Выйдите и войдите снова — при входе запросится доступ к календарю."
        )
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise RuntimeError("Google OAuth не настроен на сервере.")
    data = await refresh_access_token(
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        refresh_token=refresh,
    )
    new_token = str(data.get("access_token") or "")
    if not new_token:
        raise RuntimeError("Google не вернул access_token при обновлении.")
    return new_token
