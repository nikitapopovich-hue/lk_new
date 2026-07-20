from __future__ import annotations

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import KcEmployee


def photo_public_url_from_base(base_url: str, relative: str) -> str:
    if not relative:
        return ""
    if relative.startswith("http://") or relative.startswith("https://"):
        return relative
    # Относительный путь: фото грузится same-origin со страницей и не зависит от
    # того, какой Host/схему backend увидит за nginx (base_url сюда не нужен).
    return relative if relative.startswith("/") else f"/{relative}"


async def lookup_kc_employee_by_email(session: AsyncSession, email: str) -> KcEmployee | None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    return (
        await session.execute(
            select(KcEmployee).where(func.lower(KcEmployee.email_new) == normalized).limit(1)
        )
    ).scalar_one_or_none()


def normalize_birthday_to_token(raw: str) -> str | None:
    """Преобразует дату из карточки КЦ в токен YYYY-MM-DD (или 0000-MM-DD)."""
    s = (raw or "").strip()
    if not s:
        return None

    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"

    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"

    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def resolve_birthday_token(*, kc_birth_date: str, google_birthday: str) -> tuple[str, str]:
    """
    Возвращает (token, source): source = kc | google | "".
    Карточка КЦ — основной источник; Google — запасной.
    """
    kc_token = normalize_birthday_to_token(kc_birth_date)
    if kc_token:
        return kc_token, "kc"
    google_token = (google_birthday or "").strip()
    if google_token:
        return google_token, "google"
    return "", ""


def resolve_profile_photo_url(*, base_url: str, kc_photo_url: str, google_picture: str) -> tuple[str, str]:
    """KC-фото приоритетнее; Google — запасной вариант."""
    kc_abs = photo_public_url_from_base(base_url, (kc_photo_url or "").strip())
    if kc_abs:
        return kc_abs, "kc"
    google = (google_picture or "").strip()
    if google:
        return google, "google"
    return "", ""
