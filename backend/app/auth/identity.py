from __future__ import annotations

import re
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.jwt_session import SESSION_COOKIE, decode_session_token
from app.core.config import Settings, get_settings
from app.infra.models import EmployeeMapping, EmployeeProfile


@dataclass(frozen=True)
class Identity:
    email: str
    name: str
    given_name: str
    family_name: str
    preferred_role: str
    mapping: EmployeeMapping | None
    google_access_token: str = ""
    google_refresh_token: str = ""
    google_access_exp: int = 0
    birthday: str = ""
    picture: str = ""


def google_picture_large(url: str, size: int = 512) -> str:
    """Google userinfo picture is often =s96-c; request a larger variant for UI."""
    u = (url or "").strip()
    if not u or "googleusercontent.com" not in u:
        return u
    if re.search(r"=s\d+", u, re.I):
        return re.sub(r"=s\d+(-c)?", rf"=s{size}\1", u, count=1, flags=re.I)
    if re.search(r"[?&]sz=\d+", u, re.I):
        return re.sub(r"([?&]sz=)\d+", rf"\g<1>{size}", u, count=1, flags=re.I)
    return f"{u}{'&' if '?' in u else '?'}sz={size}"


def user_face_name(identity: Identity) -> str:
    """Имя для приветствий: имя и фамилия из Google (given/family), иначе поле name."""
    gn = identity.given_name.strip()
    fn = identity.family_name.strip()
    if gn and fn:
        return f"{gn} {fn}"
    if gn:
        return gn
    return identity.name


def _email_from_bearer(authorization: str | None, secret: str) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        return decode_session_token(token, secret)
    except jwt.PyJWTError:
        return None


def _email_from_cookie(request: Request, secret: str) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        return decode_session_token(token, secret)
    except jwt.PyJWTError:
        return None


async def get_identity(
    request: Request,
    authorization: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Identity:
    payload = _email_from_bearer(authorization, settings.app_secret_key) or _email_from_cookie(
        request, settings.app_secret_key
    )

    google_access_token = ""
    google_refresh_token = ""
    google_access_exp = 0

    if payload:
        email = str(payload.get("email", "")).strip().lower()
        name = str(payload.get("name") or email.split("@")[0])
        given_name = str(payload.get("given_name") or "").strip()
        family_name = str(payload.get("family_name") or "").strip()
        preferred_role = str(payload.get("preferred_role") or "operator")
        google_access_token = str(payload.get("google_access_token") or "")
        google_refresh_token = str(payload.get("google_refresh_token") or "")
        try:
            google_access_exp = int(payload.get("google_access_exp") or 0)
        except (TypeError, ValueError):
            google_access_exp = 0
        birthday = str(payload.get("birthday") or "").strip()
        picture = str(payload.get("picture") or "").strip()
    elif x_user_email and settings.app_env == "development":
        email = x_user_email.strip().lower()
        name = email.split("@")[0]
        given_name = ""
        family_name = ""
        preferred_role = "operator"
        birthday = ""
        picture = ""
    else:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    if not email:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    profile: EmployeeProfile | None = None
    try:
        profile = (
            await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == email))
        ).scalar_one_or_none()
    except (SQLAlchemyError, OSError, ConnectionError):
        await session.rollback()
        profile = None

    if profile:
        if profile.google_access_token.strip():
            google_access_token = profile.google_access_token.strip()
        if profile.google_refresh_token.strip():
            google_refresh_token = profile.google_refresh_token.strip()
        if profile.google_access_exp:
            google_access_exp = int(profile.google_access_exp)
        if profile.google_birthday.strip():
            birthday = profile.google_birthday.strip()
        if profile.google_picture.strip():
            picture = profile.google_picture.strip()

    row: EmployeeMapping | None = None
    try:
        row = (await session.execute(select(EmployeeMapping).where(EmployeeMapping.email == email))).scalar_one_or_none()
    except (SQLAlchemyError, OSError, ConnectionError):
        await session.rollback()
        row = None

    return Identity(
        email=email,
        name=name,
        given_name=given_name,
        family_name=family_name,
        preferred_role=preferred_role,
        mapping=row,
        google_access_token=google_access_token,
        google_refresh_token=google_refresh_token,
        google_access_exp=google_access_exp,
        birthday=birthday,
        picture=picture,
    )
