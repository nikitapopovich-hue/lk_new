from __future__ import annotations

from datetime import date, datetime


def parse_violation_date(text: str) -> date | None:
    raw = (text or "").strip()
    if not raw:
        return None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def format_violation_date(d: date | None) -> str:
    if not d:
        return ""
    return d.strftime("%d.%m.%Y")


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def parse_month_key(key: str) -> tuple[int, int] | None:
    raw = (key or "").strip()
    if len(raw) == 7 and raw[4] == "-":
        try:
            y, m = int(raw[:4]), int(raw[5:7])
            if 1 <= m <= 12:
                return y, m
        except ValueError:
            return None
    return None
