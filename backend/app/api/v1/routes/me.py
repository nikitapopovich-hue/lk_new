from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity, google_picture_large, user_face_name
from app.auth.roles import can_use_superadmin
from app.core.config import Settings, get_settings
from app.domain.kc_identity_profile import (
    lookup_kc_employee_by_email,
    resolve_birthday_token,
    resolve_profile_photo_url,
)
from app.domain.zodiac import month_day_from_birthday_token, western_zodiac_slug, zodiac_label_ru as zodiac_sign_ru
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("")
async def me(
    request: Request,
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    roles: list[str] = ["operator", "supervisor"]
    if can_use_superadmin(identity.email, settings):
        roles.append("superadmin")

    kc_row = await lookup_kc_employee_by_email(session, identity.email)
    birthday_token, birthday_source = resolve_birthday_token(
        kc_birth_date=kc_row.birth_date if kc_row else "",
        google_birthday=identity.birthday,
    )
    md = month_day_from_birthday_token(birthday_token)
    birthday_known = md is not None
    zodiac_slug: str | None = None
    zodiac_label_ru: str | None = None
    if md:
        zodiac_slug = western_zodiac_slug(md[0], md[1])
        zodiac_label_ru = zodiac_sign_ru(zodiac_slug)

    photo_raw, photo_source = resolve_profile_photo_url(
        base_url=str(request.base_url),
        kc_photo_url=kc_row.photo_url if kc_row else "",
        google_picture=identity.picture,
    )
    picture_url = google_picture_large(photo_raw, 1024) if photo_source == "google" else photo_raw

    face_name = user_face_name(identity)
    if kc_row and (kc_row.full_name or "").strip():
        face_name = kc_row.full_name.strip()

    return {
        "user": {
            "email": identity.email,
            "displayName": identity.name,
            "givenName": identity.given_name,
            "familyName": identity.family_name,
            "faceName": face_name,
            "preferredRole": identity.preferred_role,
            "roles": roles,
            "mapped": bool(identity.mapping),
            "isSuperadmin": can_use_superadmin(identity.email, settings),
            "birthdayKnown": birthday_known,
            "birthdaySource": birthday_source,
            "photoSource": photo_source,
            "zodiacSign": zodiac_slug,
            "zodiacLabelRu": zodiac_label_ru,
            "pictureUrl": picture_url,
            "hasGoogleCalendar": bool(identity.google_refresh_token or identity.google_access_token),
        }
    }
