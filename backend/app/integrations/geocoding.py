from __future__ import annotations

import time
from typing import TypedDict
import httpx

_GEO_CACHE: dict[str, tuple[float, float] | None] = {}
_NOMINATIM_LAST_AT = 0.0
_NOMINATIM_MIN_INTERVAL = 1.1


class GeoPoint(TypedDict):
    lat: float
    lon: float


def _normalize_cache_key(address: str) -> str:
    return " ".join((address or "").strip().lower().split())


async def _throttle_nominatim() -> None:
    global _NOMINATIM_LAST_AT
    now = time.monotonic()
    wait = _NOMINATIM_MIN_INTERVAL - (now - _NOMINATIM_LAST_AT)
    if wait > 0:
        import asyncio

        await asyncio.sleep(wait)
    _NOMINATIM_LAST_AT = time.monotonic()


async def _geocode_google(address: str, api_key: str) -> GeoPoint | None:
    params = {
        "address": address,
        "key": api_key,
        "language": "ru",
        "region": "ru",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get("https://maps.googleapis.com/maps/api/geocode/json", params=params)
        resp.raise_for_status()
        data = resp.json()
    status = str(data.get("status") or "")
    if status != "OK":
        return None
    results = data.get("results") or []
    if not results:
        return None
    location = (results[0].get("geometry") or {}).get("location") or {}
    lat = location.get("lat")
    lng = location.get("lng")
    if lat is None or lng is None:
        return None
    return {"lat": float(lat), "lon": float(lng)}


async def _geocode_yandex(address: str, api_key: str) -> GeoPoint | None:
    params = {"apikey": api_key, "geocode": address, "format": "json", "results": 1}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get("https://geocode-maps.yandex.ru/1.x/", params=params)
        resp.raise_for_status()
        data = resp.json()
    members = (
        data.get("response", {})
        .get("GeoObjectCollection", {})
        .get("featureMember", [])
    )
    if not members:
        return None
    pos = members[0].get("GeoObject", {}).get("Point", {}).get("pos", "")
    if not pos or " " not in pos:
        return None
    lon_s, lat_s = pos.split(" ", 1)
    return {"lat": float(lat_s), "lon": float(lon_s)}


async def _geocode_nominatim(address: str) -> GeoPoint | None:
    await _throttle_nominatim()
    headers = {"User-Agent": "lk-oper-ruk/1.0 (contact-center workspace)"}
    params = {"q": address, "format": "json", "limit": 1}
    async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
        resp = await client.get("https://nominatim.openstreetmap.org/search", params=params)
        resp.raise_for_status()
        data = resp.json()
    if not data:
        return None
    return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"])}


async def geocode_address(
    address: str,
    *,
    google_api_key: str = "",
    yandex_api_key: str = "",
) -> GeoPoint | None:
    """
    Геокодирование: Google → Яндекс → Nominatim.
    Результаты кэшируются в памяти процесса.
    """
    query = (address or "").strip()
    if not query:
        return None
    key = _normalize_cache_key(query)
    if key in _GEO_CACHE:
        cached = _GEO_CACHE[key]
        if cached is None:
            return None
        return {"lat": cached[0], "lon": cached[1]}

    point: GeoPoint | None = None
    if google_api_key.strip():
        try:
            point = await _geocode_google(query, google_api_key.strip())
        except Exception:  # noqa: BLE001
            point = None
    if point is None and yandex_api_key.strip():
        try:
            point = await _geocode_yandex(query, yandex_api_key.strip())
        except Exception:  # noqa: BLE001
            point = None
    if point is None:
        try:
            point = await _geocode_nominatim(query)
        except Exception:  # noqa: BLE001
            point = None

    _GEO_CACHE[key] = (point["lat"], point["lon"]) if point else None
    return point
