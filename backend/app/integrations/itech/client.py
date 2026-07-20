from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class ItechOAuth:
    client_id: str
    client_secret: str | None
    username: str
    password: str
    grant_type: str = "password"


class ItechError(RuntimeError):
    pass


class ItechClient:
    def __init__(
        self,
        *,
        resource_base_url: str,
        oauth_token_url: str,
        access_token: str = "",
        oauth: ItechOAuth | None = None,
        timeout_seconds: float = 30.0,
        verify_tls: bool = True,
    ) -> None:
        self._resource_base_url = resource_base_url.rstrip("/")
        self._oauth_token_url = oauth_token_url  # trailing slash важен — не трогаем
        self._access_token = access_token
        self._oauth = oauth
        self._timeout = httpx.Timeout(timeout_seconds)
        self._verify_tls = verify_tls

    async def _get_access_token(self) -> str:
        if self._access_token:
            return self._access_token
        if not self._oauth:
            raise ItechError("No ITECH_ACCESS_TOKEN and no OAuth credentials configured")

        payload: dict[str, Any] = {
            "username": self._oauth.username,
            "password": self._oauth.password,
            "grant_type": self._oauth.grant_type,
            "client_id": self._oauth.client_id,
        }
        if self._oauth.client_secret:
            payload["client_secret"] = self._oauth.client_secret

        headers = {"Content-type": "application/json"}
        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.post(self._oauth_token_url, json=payload, headers=headers)

        if resp.status_code >= 400:
            raise ItechError(f"OAuth HTTP {resp.status_code}: {resp.text[:500]}")
        try:
            data = resp.json()
        except Exception as e:  # noqa: BLE001
            raise ItechError(f"OAuth invalid JSON: {e}") from e

        token = data.get("access_token") or data.get("result", {}).get("access_token")
        if not token:
            raise ItechError(f"OAuth response missing access_token: keys={list(data.keys())}")
        self._access_token = token
        return token

    async def get(self, path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        token = await self._get_access_token()
        url = f"{self._resource_base_url}/{path.lstrip('/')}"
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.get(url, params=params, headers=headers)
        if resp.status_code >= 400:
            raise ItechError(f"API HTTP {resp.status_code}: {resp.text[:500]}")
        return resp.json()

