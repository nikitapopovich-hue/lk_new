from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.kc_display import format_city


@dataclass(frozen=True)
class OfficeLocation:
    city: str
    address: str
    lat: float
    lon: float


# Координаты офисов (геокодированы один раз; адреса — эталон для расчёта расстояния).
KC_OFFICES: dict[str, OfficeLocation] = {
    "Ростов-на-Дону": OfficeLocation(
        city="Ростов-на-Дону",
        address="г. Ростов-на-Дону, Доломановский 70Д",
        lat=47.2271164,
        lon=39.6954978,
    ),
    "Нижний Новгород": OfficeLocation(
        city="Нижний Новгород",
        address="г. Нижний Новгород, ул. Карла Маркса, 44Б",
        lat=56.3390486,
        lon=43.9475408,
    ),
    "Серпухов": OfficeLocation(
        city="Серпухов",
        address="г. Серпухов, 1-я Московская улица, д. 11",
        lat=54.9153065,
        lon=37.4141958,
    ),
}


def resolve_office(city: str) -> OfficeLocation | None:
    normalized = format_city(city)
    if not normalized:
        return None
    return KC_OFFICES.get(normalized)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
