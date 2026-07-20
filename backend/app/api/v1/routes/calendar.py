from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.google_tokens import ensure_google_access_token
from app.auth.identity import Identity, get_identity
from app.core.config import Settings, get_settings
from app.integrations.google.calendar import list_upcoming_events

router = APIRouter()


def _format_event_label(start_iso: str) -> str:
    if not start_iso:
        return "—"
    try:
        if "T" in start_iso:
            dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            msk = dt.astimezone(timezone(timedelta(hours=3)))
            months = [
                "Января",
                "Февраля",
                "Марта",
                "Апреля",
                "Мая",
                "Июня",
                "Июля",
                "Августа",
                "Сентября",
                "Октября",
                "Ноября",
                "Декабря",
            ]
            return f"{msk.day} {months[msk.month - 1]} {msk.strftime('%H:%M')}"
        return start_iso
    except Exception:  # noqa: BLE001
        return start_iso


def _parse_iso_to_msk(dt_iso: str, msk: timezone) -> datetime | None:
    s = (dt_iso or "").strip()
    if not s:
        return None
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(msk)
        d = date.fromisoformat(s[:10])
        return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=msk)
    except Exception:  # noqa: BLE001
        return None


def _event_starts_at_or_after(ev_start_iso: str, *, floor: datetime, msk: timezone) -> bool:
    t = _parse_iso_to_msk(ev_start_iso, msk)
    if t is None:
        return False
    return t >= floor


@router.get("/events")
async def calendar_events(
    time_min: str | None = Query(default=None),
    time_max: str | None = Query(default=None),
    max_results: int = Query(default=25, ge=1, le=50),
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> dict:
    msk = timezone(timedelta(hours=3))
    now_msk = datetime.now(msk)

    if not time_max:
        time_max_dt = now_msk + timedelta(days=90)
    else:
        time_max_dt = _parse_iso_to_msk(time_max, msk) or now_msk + timedelta(days=90)

    if not time_min:
        time_min_dt = now_msk
    else:
        time_min_dt = _parse_iso_to_msk(time_min, msk) or now_msk

    # Только предстоящие: не раньше «сейчас» в МСК
    floor = max(time_min_dt, now_msk)
    if floor > time_max_dt:
        return {
            "items": [],
            "total": 0,
            "calendarId": "primary",
            "hasGoogleCalendar": bool(identity.google_refresh_token or identity.google_access_token),
        }

    google_time_min = floor.isoformat()
    google_time_max = time_max_dt.isoformat()

    try:
        access = await ensure_google_access_token(identity, settings)
        raw = await list_upcoming_events(
            access_token=access,
            time_min=google_time_min,
            time_max=google_time_max,
            max_results=max_results,
        )
    except Exception as e:  # noqa: BLE001
        msg = str(e)[:400]
        if "Google Calendar" in msg or "access_token" in msg or "refresh" in msg.lower():
            raise HTTPException(status_code=401, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e

    raw = [ev for ev in raw if _event_starts_at_or_after(str(ev.get("start", "")), floor=floor, msk=msk)]

    items = [
        {
            "id": ev["id"],
            "title": ev["title"],
            "dateLabel": _format_event_label(ev["start"]),
            "start": ev["start"],
            "end": ev["end"],
            "htmlLink": ev["htmlLink"],
            "location": ev.get("location") or "",
        }
        for ev in raw
    ]
    return {
        "items": items,
        "total": len(items),
        "calendarId": "primary",
        "hasGoogleCalendar": bool(identity.google_refresh_token or identity.google_access_token),
    }
