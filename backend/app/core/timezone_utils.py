from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Фиксированное смещение MSK (DST отменён с 2014) — fallback без tzdata на Windows.
_MSK_FALLBACK = timezone(timedelta(hours=3))


@lru_cache
def app_timezone(name: str) -> timezone | ZoneInfo:
    key = (name or "Europe/Moscow").strip() or "Europe/Moscow"
    try:
        return ZoneInfo(key)
    except ZoneInfoNotFoundError:
        if key in ("Europe/Moscow", "W-SU"):
            return _MSK_FALLBACK
        return timezone.utc


def app_today(name: str) -> date:
    return datetime.now(app_timezone(name)).date()
