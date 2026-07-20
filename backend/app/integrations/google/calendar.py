from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


async def refresh_access_token(
    *,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code >= 400:
        raise RuntimeError(
            "Сессия Google устарела. Нажмите «Подключить Google Calendar» или войдите через Google снова."
        )
    return resp.json()


async def list_upcoming_events(
    *,
    access_token: str,
    time_min: str,
    time_max: str,
    max_results: int = 25,
) -> list[dict[str, Any]]:
    params = {
        "timeMin": time_min,
        "timeMax": time_max,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": str(max_results),
    }
    url = f"{CALENDAR_EVENTS_URL}?{urlencode(params)}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code >= 400:
        raise RuntimeError(f"Calendar API HTTP {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    items = data.get("items") or []
    out: list[dict[str, Any]] = []
    for ev in items:
        if not isinstance(ev, dict):
            continue
        start = ev.get("start") or {}
        end = ev.get("end") or {}
        start_raw = start.get("dateTime") or start.get("date") or ""
        end_raw = end.get("dateTime") or end.get("date") or ""
        out.append(
            {
                "id": str(ev.get("id") or ""),
                "title": str(ev.get("summary") or "Без названия"),
                "start": str(start_raw),
                "end": str(end_raw),
                "htmlLink": str(ev.get("htmlLink") or ""),
                "location": str(ev.get("location") or ""),
            }
        )
    return out
