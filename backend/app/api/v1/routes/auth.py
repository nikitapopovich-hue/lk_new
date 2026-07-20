from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.v1.deps.db import get_sessionmaker, reset_db_pool
from app.auth.roles import resolve_preferred_role
from app.auth.jwt_session import (
    SESSION_COOKIE,
    create_oauth_state,
    create_session_token,
    decode_oauth_state,
    decode_session_token,
)
from app.core.config import Settings, get_settings, resolve_oauth_redirect_uri
from app.auth.passwords import verify_password
from app.domain.google_session_store import persist_google_session
from app.infra.models import EmployeeProfile, UserAccount
from app.integrations.google.oauth import (
    build_authorization_url,
    exchange_code_for_tokens,
    fetch_userinfo,
)
from app.integrations.google.people import fetch_google_birthday_token

router = APIRouter()

RoleLiteral = Literal["operator", "supervisor", "superadmin"]


def _parse_role(role: str) -> RoleLiteral:
    if role in ("operator", "supervisor", "superadmin"):
        return role  # type: ignore[return-value]
    return "operator"


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    secure = settings.app_env != "development"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        max_age=7 * 24 * 3600,
        samesite="lax",
        secure=secure,
        path="/",
    )


BIRTHDAY_READ_SCOPE = "https://www.googleapis.com/auth/user.birthday.read"


def _cors_origin_set(settings: Settings) -> set[str]:
    origins: set[str] = set()
    for item in settings.cors_origins.split(","):
        origin = item.strip().rstrip("/")
        if origin:
            origins.add(origin)
    base = settings.frontend_url.strip().rstrip("/")
    if base:
        origins.add(base)
    return origins


def _resolve_frontend_base(settings: Settings, state_data: dict | None = None) -> str:
    allowed = _cors_origin_set(settings)
    if state_data:
        from_state = str(state_data.get("origin") or "").strip().rstrip("/")
        if from_state and from_state in allowed:
            return from_state
    return settings.frontend_url.strip().rstrip("/") or "http://localhost:5173"


def _oauth_scopes_list(settings: Settings) -> list[str]:
    return [s.strip() for s in settings.google_oauth_scopes.split() if s.strip()]


def _session_payload_from_cookie(request: Request, settings: Settings) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        return decode_session_token(token, settings.app_secret_key)
    except Exception:  # noqa: BLE001
        return None


@router.get("/config")
async def auth_config(settings: Settings = Depends(get_settings)) -> dict:
    from app.core.config import _ENV_FILE, _REPO_ROOT

    scopes = _oauth_scopes_list(settings)
    redirect_uri = resolve_oauth_redirect_uri(settings)
    out: dict = {
        "googleEnabled": bool(settings.google_oauth_client_id and settings.google_oauth_client_secret),
        "demoEnabled": settings.app_env == "development",
        "googleClientId": settings.google_oauth_client_id,
        "apiBaseUrl": redirect_uri.rsplit("/auth/", 1)[0] if redirect_uri else "",
        "oauthRedirectUri": redirect_uri,
        "googleOAuthScopes": scopes,
        "googleBirthdayScopeRequested": BIRTHDAY_READ_SCOPE in scopes,
    }
    if settings.app_env == "development":
        out["envDebug"] = {
            "repoRoot": str(_REPO_ROOT),
            "envFile": str(_ENV_FILE),
            "envFileExists": _ENV_FILE.is_file(),
        }
    return out


@router.get("/google/login")
async def google_login(
    role: str = Query(default="operator"),
    origin: str | None = Query(default=None),
    consent: bool = Query(default=True),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth не настроен (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).",
        )

    preferred = _parse_role(role)
    allowed = _cors_origin_set(settings)
    safe_origin = ""
    if origin:
        candidate = origin.strip().rstrip("/")
        if candidate in allowed:
            safe_origin = candidate
    state = create_oauth_state(role=preferred, secret=settings.app_secret_key, origin=safe_origin)
    scopes = [s.strip() for s in settings.google_oauth_scopes.split() if s.strip()]
    redirect_uri = resolve_oauth_redirect_uri(settings)
    url = build_authorization_url(
        client_id=settings.google_oauth_client_id,
        redirect_uri=redirect_uri,
        state=state,
        scopes=scopes,
        prompt="consent" if consent else None,
    )
    return RedirectResponse(url, status_code=302)


@router.get("/session-token")
async def session_token_from_cookie(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Отдаёт JWT из httpOnly-cookie — для сохранения в localStorage после OAuth."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Нет сессии")
    try:
        decode_session_token(token, settings.app_secret_key)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Сессия недействительна") from e
    return {"token": token}


def _is_stale_prepared_statement_error(exc: BaseException) -> bool:
    return "InvalidCachedStatementError" in type(exc).__name__ or "InvalidCachedStatementError" in str(exc)


async def _persist_google_oauth_session(
    settings: Settings,
    *,
    email: str,
    name: str,
    access_token: str,
    refresh_token: str,
    access_exp: int,
    birthday_value: str,
    picture: str,
) -> None:
    for attempt in range(2):
        async with get_sessionmaker(settings)() as session:
            try:
                profile_row = (
                    await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == email))
                ).scalar_one_or_none()

                effective_refresh = refresh_token.strip()
                effective_birthday = birthday_value.strip()
                if profile_row:
                    if not effective_refresh:
                        effective_refresh = profile_row.google_refresh_token.strip()
                    if not effective_birthday:
                        effective_birthday = profile_row.google_birthday.strip()

                await persist_google_session(
                    session,
                    email=email,
                    full_name=name,
                    google_access_token=access_token,
                    google_refresh_token=effective_refresh,
                    google_access_exp=access_exp,
                    birthday=effective_birthday,
                    picture=picture,
                )
                await session.commit()
                return
            except Exception as exc:
                await session.rollback()
                if attempt == 0 and _is_stale_prepared_statement_error(exc):
                    await reset_db_pool()
                    continue
                raise


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    frontend = _resolve_frontend_base(settings)
    if error:
        return RedirectResponse(
            f"{frontend}/login?error={error}",
            status_code=302,
        )
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    try:
        state_data = decode_oauth_state(state, settings.app_secret_key)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid state: {e}") from e

    requested_role = _parse_role(str(state_data.get("role", "operator")))

    redirect_uri = resolve_oauth_redirect_uri(settings)
    try:
        tokens = await exchange_code_for_tokens(
            client_id=settings.google_oauth_client_id,
            client_secret=settings.google_oauth_client_secret,
            redirect_uri=redirect_uri,
            code=code,
        )
        userinfo = await fetch_userinfo(access_token=str(tokens["access_token"]))
    except Exception as e:  # noqa: BLE001
        err_text = str(e).lower()
        if "redirect_uri_mismatch" in err_text:
            err_code = "redirect_uri_mismatch"
        elif "invalid_grant" in err_text:
            err_code = "invalid_grant"
        elif "invalid_client" in err_text:
            err_code = "invalid_client"
        else:
            err_code = "oauth_failed"
        print(f"[LK] Google OAuth callback failed ({err_code}): {e}")
        return RedirectResponse(
            f"{_resolve_frontend_base(settings, state_data)}/login?error={err_code}",
            status_code=302,
        )

    birthday_token = ""
    try:
        b = await fetch_google_birthday_token(access_token=str(tokens["access_token"]))
        if b:
            birthday_token = b
    except Exception:  # noqa: BLE001
        birthday_token = ""

    email = str(userinfo.get("email", "")).strip().lower()
    frontend = _resolve_frontend_base(settings, state_data)
    if not email:
        return RedirectResponse(f"{frontend}/login?error=no_email", status_code=302)

    hd = settings.google_oauth_hd.strip().lower()
    if hd and not email.endswith(f"@{hd}"):
        return RedirectResponse(f"{frontend}/login?error=domain", status_code=302)

    name = str(userinfo.get("name") or email.split("@")[0])
    given_name = str(userinfo.get("given_name") or "").strip()
    family_name = str(userinfo.get("family_name") or "").strip()
    picture = str(userinfo.get("picture") or "").strip()
    preferred_role = resolve_preferred_role(email, requested_role, settings)
    expires_in = int(tokens.get("expires_in") or 3600)
    access_exp = int(time.time()) + max(60, expires_in) - 60

    previous = _session_payload_from_cookie(request, settings)
    old_refresh = str(previous.get("google_refresh_token") or "") if previous else ""
    old_birthday = str(previous.get("birthday") or "") if previous else ""

    refresh_token = str(tokens.get("refresh_token") or "") or old_refresh
    birthday_value = birthday_token or old_birthday
    access_token = str(tokens.get("access_token") or "")

    try:
        await _persist_google_oauth_session(
            settings,
            email=email,
            name=name,
            access_token=access_token,
            refresh_token=refresh_token,
            access_exp=access_exp,
            birthday_value=birthday_value,
            picture=picture,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[LK] Google session persist failed for {email}: {exc}")

    session_token = create_session_token(
        email=email,
        name=name,
        preferred_role=preferred_role,
        secret=settings.app_secret_key,
        birthday=birthday_value,
        given_name=given_name,
        family_name=family_name,
    )

    redirect = RedirectResponse(f"{frontend}/auth/callback", status_code=302)
    _set_session_cookie(redirect, session_token, settings)
    return redirect


class PasswordLoginBody(BaseModel):
    email: EmailStr
    password: str
    role: RoleLiteral = "operator"


@router.post("/login")
async def password_login(
    body: PasswordLoginBody,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    email = str(body.email).strip().lower()
    async with get_sessionmaker(settings)() as session:
        account = (
            await session.execute(select(UserAccount).where(UserAccount.email == email))
        ).scalar_one_or_none()
    if not account or not verify_password(body.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    name = email.split("@")[0]
    preferred_role = resolve_preferred_role(email, body.role, settings)
    token = create_session_token(
        email=email,
        name=name,
        preferred_role=preferred_role,
        secret=settings.app_secret_key,
    )
    _set_session_cookie(response, token, settings)
    return {"token": token, "email": email, "name": name, "preferredRole": preferred_role}


class DemoLoginBody(BaseModel):
    email: EmailStr
    role: RoleLiteral = "operator"
    name: str = Field(default="", max_length=200)


@router.post("/demo/login")
async def demo_login(
    body: DemoLoginBody,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    if settings.app_env != "development":
        raise HTTPException(status_code=403, detail="Demo login only in development")

    email = str(body.email).strip().lower()
    name = body.name.strip() or email.split("@")[0]
    preferred_role = resolve_preferred_role(email, body.role, settings)
    token = create_session_token(
        email=email,
        name=name,
        preferred_role=preferred_role,
        secret=settings.app_secret_key,
    )
    _set_session_cookie(response, token, settings)
    return {
        "token": token,
        "email": email,
        "name": name,
        "preferredRole": preferred_role,
    }


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
