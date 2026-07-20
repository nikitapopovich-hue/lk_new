from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.timezone_utils import app_today
from app.domain.zodiac import ALL_WESTERN_ZODIAC_SIGNS
from app.infra.models import HoroscopeDailyCache
from app.integrations.horoscope_translate import horoscope_text_to_russian

FREE_HOROSCOPE_URL = "https://freehoroscopeapi.com/api/v1/get-horoscope/daily"

_sign_locks: dict[str, asyncio.Lock] = {}


def msk_today(settings: Settings | None = None) -> date:
    settings = settings or get_settings()
    return app_today(settings.app_timezone)


def _lock_key(cache_date: date, sign: str) -> str:
    return f"{cache_date.isoformat()}:{sign.lower()}"


def _lock_for(cache_date: date, sign: str) -> asyncio.Lock:
    key = _lock_key(cache_date, sign)
    if key not in _sign_locks:
        _sign_locks[key] = asyncio.Lock()
    return _sign_locks[key]


async def fetch_horoscope_raw(sign: str) -> tuple[str, str, str]:
    """(текст EN, date label, period) из внешнего API."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(FREE_HOROSCOPE_URL, params={"sign": sign.lower()})
    if resp.status_code >= 400:
        raise RuntimeError(f"Гороскоп HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        payload = resp.json()
    except Exception as e:  # noqa: BLE001
        raise RuntimeError("Гороскоп: неверный JSON") from e
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise RuntimeError("Гороскоп: нет поля data")
    horoscope = str(data.get("horoscope") or "").strip()
    if not horoscope:
        raise RuntimeError("Гороскоп: пустой текст")
    date_s = str(data.get("date") or "")
    period = str(data.get("period") or "daily")
    return horoscope, date_s, period


async def translate_horoscope(horoscope_en: str) -> str:
    try:
        return await asyncio.wait_for(horoscope_text_to_russian(horoscope_en), timeout=50.0)
    except TimeoutError:
        return "Перевод гороскопа занял слишком много времени. Обновите страницу позже."


async def fetch_and_translate_sign(sign: str) -> dict[str, str]:
    horoscope_en, date_label, period = await fetch_horoscope_raw(sign)
    horoscope_ru = await translate_horoscope(horoscope_en)
    return {
        "horoscope_ru": horoscope_ru,
        "date_label": date_label,
        "period": period,
    }


async def get_cached_horoscope(
    session: AsyncSession,
    cache_date: date,
    sign: str,
) -> HoroscopeDailyCache | None:
    result = await session.execute(
        select(HoroscopeDailyCache).where(
            HoroscopeDailyCache.cache_date == cache_date,
            HoroscopeDailyCache.sign == sign.lower(),
        )
    )
    return result.scalar_one_or_none()


async def upsert_horoscope_cache(
    session: AsyncSession,
    *,
    cache_date: date,
    sign: str,
    horoscope_ru: str,
    date_label: str,
    period: str,
) -> HoroscopeDailyCache:
    sign = sign.lower()
    row = await get_cached_horoscope(session, cache_date, sign)
    if row is None:
        row = HoroscopeDailyCache(
            cache_date=cache_date,
            sign=sign,
            horoscope_ru=horoscope_ru,
            date_label=date_label,
            period=period,
        )
        session.add(row)
    else:
        row.horoscope_ru = horoscope_ru
        row.date_label = date_label
        row.period = period
        row.fetched_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return row


async def purge_old_horoscope_cache(session: AsyncSession, keep_date: date) -> None:
    await session.execute(delete(HoroscopeDailyCache).where(HoroscopeDailyCache.cache_date < keep_date))
    await session.commit()


async def count_cached_signs(session: AsyncSession, cache_date: date) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(HoroscopeDailyCache)
        .where(HoroscopeDailyCache.cache_date == cache_date)
    )
    return int(result.scalar_one() or 0)


async def ensure_sign_cached(
    session: AsyncSession,
    cache_date: date,
    sign: str,
) -> HoroscopeDailyCache:
    """Кэш из БД; при отсутствии — один live-запрос для знака."""
    sign = sign.lower()
    cached = await get_cached_horoscope(session, cache_date, sign)
    if cached is not None:
        return cached

    async with _lock_for(cache_date, sign):
        cached = await get_cached_horoscope(session, cache_date, sign)
        if cached is not None:
            return cached
        data = await fetch_and_translate_sign(sign)
        return await upsert_horoscope_cache(session, cache_date=cache_date, sign=sign, **data)


async def refresh_all_signs_for_date(session: AsyncSession, cache_date: date | None = None) -> int:
    """Ночное обновление: 12 знаков + удаление архива."""
    settings = get_settings()
    cache_date = cache_date or msk_today(settings)
    ok = 0
    for sign in ALL_WESTERN_ZODIAC_SIGNS:
        try:
            data = await fetch_and_translate_sign(sign)
            await upsert_horoscope_cache(session, cache_date=cache_date, sign=sign, **data)
            ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[LK] horoscope refresh {sign} @ {cache_date}: {exc}")
    await purge_old_horoscope_cache(session, cache_date)
    print(f"[LK] horoscope cache {cache_date}: {ok}/{len(ALL_WESTERN_ZODIAC_SIGNS)} signs")
    return ok
