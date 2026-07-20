from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

SESSION_COOKIE = "lk_session"
SESSION_DAYS = 7


def create_session_token(
    *,
    email: str,
    name: str,
    preferred_role: str,
    secret: str,
    birthday: str = "",
    given_name: str = "",
    family_name: str = "",
    google_access_token: str = "",
    google_refresh_token: str = "",
    google_access_exp: int = 0,
    picture: str = "",
) -> str:
    """Компактный JWT сессии. Google-токены хранятся в employee_profiles, не в cookie."""
    _ = google_access_token, google_refresh_token, google_access_exp, picture
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": email,
        "email": email,
        "name": name,
        "given_name": given_name.strip(),
        "family_name": family_name.strip(),
        "preferred_role": preferred_role,
        "birthday": birthday.strip(),
        "iat": now,
        "exp": now + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_session_token(token: str, secret: str) -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=["HS256"])


def create_oauth_state(*, role: str, secret: str, origin: str = "", ttl_seconds: int = 600) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
        "kind": "oauth_state",
    }
    if origin.strip():
        payload["origin"] = origin.strip().rstrip("/")
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_oauth_state(state: str, secret: str) -> dict[str, Any]:
    data = jwt.decode(state, secret, algorithms=["HS256"])
    if data.get("kind") != "oauth_state":
        raise jwt.InvalidTokenError("invalid oauth state")
    return data
