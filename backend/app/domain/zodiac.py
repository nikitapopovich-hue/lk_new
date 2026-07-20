from __future__ import annotations


def month_day_from_birthday_token(token: str) -> tuple[int, int] | None:
    """Токен в JWT: YYYY-MM-DD или 0000-MM-DD (год неизвестен)."""
    parts = (token or "").strip().split("-")
    if len(parts) != 3:
        return None
    try:
        month = int(parts[1])
        day = int(parts[2])
    except ValueError:
        return None
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return month, day


def western_zodiac_slug(month: int, day: int) -> str:
    """Тропический зодиак (границы как в общепринятой таблице)."""
    md = month * 100 + day
    if md >= 1222 or md <= 119:
        return "capricorn"
    if md <= 218:
        return "aquarius"
    if md <= 320:
        return "pisces"
    if md <= 419:
        return "aries"
    if md <= 520:
        return "taurus"
    if md <= 620:
        return "gemini"
    if md <= 722:
        return "cancer"
    if md <= 822:
        return "leo"
    if md <= 922:
        return "virgo"
    if md <= 1022:
        return "libra"
    if md <= 1121:
        return "scorpio"
    return "sagittarius"


_ZODIAC_RU: dict[str, str] = {
    "aries": "Овен",
    "taurus": "Телец",
    "gemini": "Близнецы",
    "cancer": "Рак",
    "leo": "Лев",
    "virgo": "Дева",
    "libra": "Весы",
    "scorpio": "Скорпион",
    "sagittarius": "Стрелец",
    "capricorn": "Козерог",
    "aquarius": "Водолей",
    "pisces": "Рыбы",
}


def zodiac_label_ru(slug: str) -> str:
    return _ZODIAC_RU.get(slug.lower(), slug)


ALL_WESTERN_ZODIAC_SIGNS: tuple[str, ...] = tuple(_ZODIAC_RU.keys())
