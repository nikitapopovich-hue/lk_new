from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity, user_face_name
from app.core.config import Settings, get_settings
from app.domain.horoscope_daily import ensure_sign_cached, msk_today
from app.domain.kc_identity_profile import lookup_kc_employee_by_email, resolve_birthday_token
from app.domain.zodiac import month_day_from_birthday_token, western_zodiac_slug, zodiac_label_ru

router = APIRouter()


@router.get("/daily")
async def horoscope_daily(
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    kc_row = await lookup_kc_employee_by_email(session, identity.email)
    birthday_token, birthday_source = resolve_birthday_token(
        kc_birth_date=kc_row.birth_date if kc_row else "",
        google_birthday=identity.birthday,
    )

    if not birthday_token:
        if not kc_row:
            return {
                "ok": False,
                "reason": "no_kc_profile",
                "message": (
                    "Не найдена карточка сотрудника с вашей корпоративной почтой в разделе «Данные КЦ». "
                    "Попросите руководителя добавить или обновить email в карточке — после этого гороскоп "
                    "будет считаться по дате рождения из карточки."
                ),
            }
        return {
            "ok": False,
            "reason": "no_birthday",
            "message": (
                "В карточке сотрудника не указана дата рождения. Заполните поле «Дата рождения» "
                "в «Данные КЦ» (или попросите руководителя). Google используется только как запасной "
                "вариант, если в карточке даты нет."
            ),
        }

    md = month_day_from_birthday_token(birthday_token)
    if not md:
        return {
            "ok": False,
            "reason": "invalid_birthday",
            "message": "Не удалось разобрать дату рождения. Проверьте формат в карточке (например, 15.03.1995).",
        }

    month, day = md
    sign = western_zodiac_slug(month, day)
    sign_ru = zodiac_label_ru(sign)
    cache_date = msk_today(settings)

    try:
        row = await ensure_sign_cached(session, cache_date, sign)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Гороскоп: {e}") from e

    for_name = user_face_name(identity)
    if kc_row and (kc_row.full_name or "").strip():
        for_name = kc_row.full_name.strip()

    return {
        "ok": True,
        "forName": for_name,
        "sign": sign,
        "signRu": sign_ru,
        "date": row.date_label,
        "period": row.period,
        "horoscope": row.horoscope_ru,
        "birthdaySource": birthday_source,
    }
