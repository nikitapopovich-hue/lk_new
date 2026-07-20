from __future__ import annotations

LINE_VALUES = frozenset({"1", "2", "2.1", "3"})

CITY_MAP = {
    "с": "Серпухов",
    "серпухов": "Серпухов",
    "р": "Ростов-на-Дону",
    "ростов": "Ростов-на-Дону",
    "ростов-на-дону": "Ростов-на-Дону",
    "н": "Нижний Новгород",
    "нижний новгород": "Нижний Новгород",
}

COMPANY_MAP = {
    "p": "Пари",
    "пари": "Пари",
    "с": "Сквилла",
    "сквилла": "Сквилла",
    "в": "Воксис",
    "воксис": "Воксис",
}


def format_line(line: str) -> str:
    v = (line or "").strip().replace(",", ".")
    if not v:
        return ""
    if v in LINE_VALUES:
        return f"Линия {v}"
    if v.lower().startswith("линия"):
        return v
    return f"Линия {v}"


def format_city(city: str) -> str:
    raw = (city or "").strip()
    if not raw:
        return ""
    return CITY_MAP.get(raw.lower(), raw)


def format_company(company: str) -> str:
    raw = (company or "").strip()
    if not raw:
        return ""
    return COMPANY_MAP.get(raw.lower(), raw)
