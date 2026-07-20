from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

_DATE_KEYS = frozenset(
    {
        "birthDate",
        "firstWorkDay",
        "accessDate",
        "birth_date",
        "first_work_day",
        "access_date",
    }
)
_INTEGER_LIKE_KEYS = frozenset({
    "accountNumber",
    "accountNumberExtra",
    "telegramId",
    "account_number",
    "account_number_extra",
    "telegram_id",
})
_GRADE_KEYS = frozenset({"gradeNew", "grade_new"})
_LINE_KEYS = frozenset({"line"})
_COMPANY_KEYS = frozenset({"company"})
_CITY_KEYS = frozenset({"city"})

_KC_LINE_VALUES = frozenset({"", "1 линия", "2.1 линия", "2 линия", "3 линия"})
_LINE_LEGACY: dict[str, str] = {
    "": "",
    "1": "1 линия",
    "2": "2 линия",
    "2.1": "2.1 линия",
    "3": "3 линия",
}
_COMPANY_LEGACY: dict[str, str] = {
    "p": "Пари",
    "пари": "Пари",
    "с": "Сквилла",
    "сквилла": "Сквилла",
    "в": "Воксис",
    "воксис": "Воксис",
}
_CITY_LEGACY: dict[str, str] = {
    "с": "Серпухов",
    "серпухов": "Серпухов",
    "р": "Ростов-на-Дону",
    "ростов": "Ростов-на-Дону",
    "ростов-на-дону": "Ростов-на-Дону",
    "н": "Нижний Новгород",
    "нижний новгород": "Нижний Новгород",
    "о": "Орёл",
    "орел": "Орёл",
    "орёл": "Орёл",
}
_ISO_DATETIME_GRADE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}(\s|T)")

_ISO_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})")
_DMY_DATE = re.compile(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})")
_TRAILING_ZERO = re.compile(r"^\d+\.0+$")


def format_kc_date_string(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    if " " in text:
        text = text.split(" ", 1)[0]
    if "T" in text:
        text = text.split("T", 1)[0]

    m = _ISO_DATE.match(text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{d:02d}.{mo:02d}.{y}"

    m = _DMY_DATE.match(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{d:02d}.{mo:02d}.{y}"

    return text


def format_kc_date_cell(value: date | datetime) -> str:
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d.%m.%Y")


def format_grade_number(value: float) -> str:
    rounded = round(value, 2)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:g}".replace(",", ".")


def format_grade_string(raw: str) -> str:
    text = (raw or "").strip().replace(",", ".")
    if not text:
        return ""
    if _ISO_DATETIME_GRADE.match(text):
        return ""
    return text


def format_grade_cell(value: Any) -> str:
    if isinstance(value, (int, float)):
        return format_grade_number(float(value))
    if isinstance(value, datetime):
        return ""
    return format_grade_string(str(value))


def strip_integer_decimal_noise(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    if _TRAILING_ZERO.match(text):
        return text.split(".", 1)[0]
    return text


def normalize_kc_line_value(raw: str) -> str:
    v = (raw or "").strip().replace(",", ".")
    if not v or v.lower() == "отсутствует":
        return ""
    if _ISO_DATETIME_GRADE.match(v) or _ISO_DATE.match(v) or _DMY_DATE.match(v):
        return ""
    if v in _KC_LINE_VALUES:
        return v
    return _LINE_LEGACY.get(v, v)


def normalize_kc_company_value(raw: str) -> str:
    v = (raw or "").strip()
    if not v:
        return ""
    if v in {"Пари", "Сквилла", "Воксис"}:
        return v
    return _COMPANY_LEGACY.get(v.lower(), v)


def normalize_kc_city_value(raw: str) -> str:
    v = (raw or "").strip()
    if not v:
        return ""
    known = {"Ростов-на-Дону", "Серпухов", "Нижний Новгород", "Орёл"}
    if v in known:
        return v
    return _CITY_LEGACY.get(v.lower(), v)


def normalize_kc_field_value(field_key: str, value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if field_key in _DATE_KEYS:
        return format_kc_date_string(text)
    if field_key in _INTEGER_LIKE_KEYS:
        return strip_integer_decimal_noise(text)
    if field_key in _GRADE_KEYS:
        return format_grade_string(text)
    if field_key in _LINE_KEYS:
        return normalize_kc_line_value(text)
    if field_key in _COMPANY_KEYS:
        return normalize_kc_company_value(text)
    if field_key in _CITY_KEYS:
        return normalize_kc_city_value(text)
    return text


def cell_value_to_str(value: Any, field: str | None = None) -> str:
    if value is None:
        return ""

    if field in _LINE_KEYS and isinstance(value, (datetime, date)):
        return ""

    if field in _GRADE_KEYS:
        return format_grade_cell(value)

    if field in _DATE_KEYS:
        if isinstance(value, (datetime, date)):
            return format_kc_date_cell(value)
        return format_kc_date_string(str(value))

    if isinstance(value, float):
        if value == int(value):
            text = str(int(value))
        else:
            text = str(value).strip()
        if field in _INTEGER_LIKE_KEYS:
            return strip_integer_decimal_noise(text)
        return text

    if isinstance(value, int):
        return str(value)

    text = str(value).strip()
    if field in _DATE_KEYS:
        return format_kc_date_string(text)
    if field in _INTEGER_LIKE_KEYS:
        return strip_integer_decimal_noise(text)
    if field in _GRADE_KEYS:
        return format_grade_string(text)
    if field in _LINE_KEYS:
        return normalize_kc_line_value(text)
    if field in _COMPANY_KEYS:
        return normalize_kc_company_value(text)
    if field in _CITY_KEYS:
        return normalize_kc_city_value(text)
    return text
