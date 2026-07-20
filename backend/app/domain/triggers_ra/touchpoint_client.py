"""OAuth2 и HTTP-клиент TouchPoint Analytics API (sync, httpx)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger("triggers_ra")


class TouchPointAuthError(Exception):
    pass


class TouchPointAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _normalize_auth_url(auth_url: str) -> str:
    raw = (auth_url or "").strip().rstrip("/")
    if not raw:
        return "https://oauth.v20.touchpoint-analytics.ru/token/"
    if not raw.endswith("/token"):
        raw = f"{raw}/token"
    return f"{raw}/"


class TouchPointClient:
    def __init__(
        self,
        *,
        api_base_url: str,
        auth_url: str,
        client_id: str = "",
        client_secret: str = "",
        username: str = "",
        password: str = "",
        access_token: str = "",
        grant_type: str = "password",
        timeout_seconds: float = 120.0,
    ) -> None:
        self.api_base_url = api_base_url.rstrip("/")
        self.auth_url = _normalize_auth_url(auth_url)
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.username = username.strip()
        self.password = password.strip()
        self.grant_type = (grant_type or "password").strip().lower()
        if not self.grant_type:
            self.grant_type = "password" if self.username and self.password else "client_credentials"
        env_token = access_token.strip()
        self._access_token: str | None = env_token or None
        self._token_from_env = bool(env_token)
        self._timeout = timeout_seconds

    @property
    def access_token(self) -> str:
        if self._access_token:
            return self._access_token
        self._refresh_token()
        return self._access_token  # type: ignore[return-value]

    def _refresh_token(self, *, force: bool = False) -> None:
        if self._access_token and self._token_from_env and not force:
            return
        if not self.auth_url:
            raise TouchPointAuthError("TP_AUTH_URL / ITECH_OAUTH_TOKEN_URL не задан")

        if self.grant_type == "password":
            if not self.username or not self.password:
                raise TouchPointAuthError("TP_USERNAME / TP_PASSWORD не заданы")
            if not self.client_id:
                raise TouchPointAuthError("TP_CLIENT_ID не задан")
            payload: dict[str, Any] = {
                "grant_type": "password",
                "client_id": self.client_id,
                "username": self.username,
                "password": self.password,
            }
            if self.client_secret:
                payload["client_secret"] = self.client_secret
        else:
            if not self.client_id or not self.client_secret:
                raise TouchPointAuthError("TP_CLIENT_ID / TP_CLIENT_SECRET не заданы")
            payload = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }

        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                self.auth_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        if resp.status_code != 200:
            raise TouchPointAuthError(f"OAuth failed ({resp.status_code}): {resp.text[:500]}")
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise TouchPointAuthError("Ответ OAuth не содержит access_token")
        self._access_token = token
        self._token_from_env = False

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        _retry_auth: bool = True,
    ) -> Any:
        url = f"{self.api_base_url}{path}"
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.request(method, url, headers=self._headers(), json=json, params=params)
        if resp.status_code == 401 and _retry_auth:
            self._access_token = None
            self._token_from_env = False
            self._refresh_token(force=True)
            return self._request(method, path, json=json, params=params, _retry_auth=False)
        if resp.status_code >= 400:
            raise TouchPointAPIError(
                f"{method} {path} → {resp.status_code}",
                status_code=resp.status_code,
                body=resp.text[:2000],
            )
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def get_projects(self) -> list[dict]:
        data = self._request("GET", "/projects")
        if isinstance(data, list):
            return data
        return data.get("items") or data.get("projects") or []

    def get_fields(self, project_id: str) -> list[dict]:
        data = self._request("GET", f"/projects/{project_id}/realtime/fields")
        if isinstance(data, list):
            return data
        return data.get("items") or data.get("fields") or []

    def aggregate(self, project_id: str, body: dict) -> dict:
        return self._request("POST", f"/projects/{project_id}/realtime/aggregate", json=body)

    def search_documents(self, project_id: str, body: dict) -> dict:
        return self._request(
            "POST",
            f"/projects/{project_id}/realtime/search",
            json=body,
            params={"error_details": ""},
        )

    def search(self, project_id: str, body: dict) -> dict:
        return self.search_documents(project_id, body)
