from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.api.v1.deps.db import get_sessionmaker
from app.core.config import Settings, get_settings
from app.core.timezone_utils import app_timezone
from app.domain.horoscope_daily import count_cached_signs, msk_today, refresh_all_signs_for_date
from app.domain.zodiac import ALL_WESTERN_ZODIAC_SIGNS

_scheduler_task: asyncio.Task[None] | None = None


async def run_horoscope_nightly_refresh(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    sm = get_sessionmaker(settings)
    async with sm() as session:
        await refresh_all_signs_for_date(session)


async def _maybe_backfill_on_startup(settings: Settings) -> None:
    """Если крон ещё не отработал — догрузить все знаки в фоне (не блокирует старт)."""
    try:
        sm = get_sessionmaker(settings)
        async with sm() as session:
            today = msk_today(settings)
            n = await count_cached_signs(session, today)
            if n >= len(ALL_WESTERN_ZODIAC_SIGNS):
                return
        print(f"[LK] horoscope cache incomplete ({n}/12), background refresh…")
        await run_horoscope_nightly_refresh(settings)
    except Exception as exc:  # noqa: BLE001
        print(f"[LK] horoscope startup backfill skipped: {exc}")


def _next_run_at(settings: Settings) -> datetime:
    tz = app_timezone(settings.app_timezone)
    now = datetime.now(tz)
    target = now.replace(
        hour=settings.horoscope_refresh_hour,
        minute=settings.horoscope_refresh_minute,
        second=0,
        microsecond=0,
    )
    if now >= target:
        target += timedelta(days=1)
    return target


async def _scheduler_loop(settings: Settings) -> None:
    while True:
        target = _next_run_at(settings)
        wait_s = max(1.0, (target - datetime.now(app_timezone(settings.app_timezone))).total_seconds())
        print(
            f"[LK] horoscope nightly refresh at {target.isoformat()} "
            f"({settings.app_timezone}, in {int(wait_s)}s)"
        )
        await asyncio.sleep(wait_s)
        try:
            await run_horoscope_nightly_refresh(settings)
        except Exception as exc:  # noqa: BLE001
            print(f"[LK] horoscope nightly refresh failed: {exc}")


def start_horoscope_scheduler(settings: Settings | None = None) -> None:
    global _scheduler_task
    settings = settings or get_settings()
    if _scheduler_task is not None and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop(settings), name="horoscope_scheduler")
    asyncio.create_task(_maybe_backfill_on_startup(settings), name="horoscope_backfill")


def stop_horoscope_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is None:
        return
    _scheduler_task.cancel()
    _scheduler_task = None
