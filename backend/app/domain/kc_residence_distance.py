from __future__ import annotations

from app.domain.kc_office_locations import haversine_km, resolve_office
from app.integrations.yandex.geocoder import geocode_address


def _full_residence_query(city: str, address: str) -> str:
    addr = (address or "").strip()
    if not addr:
        return ""
    city_norm = (city or "").strip()
    if city_norm and city_norm.lower() not in addr.lower():
        return f"{city_norm}, {addr}"
    return addr


async def residence_geo_info(
    *,
    city: str,
    address: str,
    google_api_key: str = "",
    yandex_api_key: str = "",
) -> dict[str, float] | None:
    office = resolve_office(city)
    if not office:
        return None
    query = _full_residence_query(city, address)
    if not query:
        return None
    point = await geocode_address(
        query,
        google_api_key=google_api_key,
        yandex_api_key=yandex_api_key,
    )
    if not point:
        return None
    km = round(haversine_km(point["lat"], point["lon"], office.lat, office.lon), 1)
    return {"lat": point["lat"], "lon": point["lon"], "distanceKm": km}


async def residence_distance_km(
    *,
    city: str,
    address: str,
    google_api_key: str = "",
    yandex_api_key: str = "",
) -> float | None:
    info = await residence_geo_info(
        city=city,
        address=address,
        google_api_key=google_api_key,
        yandex_api_key=yandex_api_key,
    )
    if not info:
        return None
    return info["distanceKm"]
