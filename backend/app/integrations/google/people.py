from __future__ import annotations

from typing import Any

import httpx

PEOPLE_ME_URL = "https://people.googleapis.com/v1/people/me"


def _format_birthday_token(date_obj: dict[str, Any]) -> str | None:
    month = date_obj.get("month")
    day = date_obj.get("day")
    if month is None or day is None:
        return None
    try:
        m, d = int(month), int(day)
    except (TypeError, ValueError):
        return None
    if not (1 <= m <= 12 and 1 <= d <= 31):
        return None
    year_raw = date_obj.get("year")
    try:
        y = int(year_raw) if year_raw is not None else 0
    except (TypeError, ValueError):
        y = 0
    if y > 0:
        return f"{y:04d}-{m:02d}-{d:02d}"
    return f"0000-{m:02d}-{d:02d}"


async def fetch_google_birthday_token(*, access_token: str) -> str | None:
    """
    День рождения из Google People API (нужен scope user.birthday.read).
    Возвращает YYYY-MM-DD или 0000-MM-DD, либо None если нет данных / отказ.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            PEOPLE_ME_URL,
            params={"personFields": "birthdays"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code >= 400:
        return None
    data = resp.json()
    bdays = data.get("birthdays") or []
    chosen: dict[str, Any] | None = None
    for b in bdays:
        if not isinstance(b, dict):
            continue
        meta = b.get("metadata") or {}
        if meta.get("primary") is True:
            chosen = b
            break
        chosen = chosen or b
    if not chosen:
        return None
    date_obj = chosen.get("date")
    if not isinstance(date_obj, dict):
        return None
    return _format_birthday_token(date_obj)
