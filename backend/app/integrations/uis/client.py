from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class UisAuth:
    access_token: str


class UisError(RuntimeError):
    pass


class UisDataApiClient:
    """
    UIS Data API (JSON-RPC).

    По доку:
    - все запросы POST
    - jsonrpc=2.0
    - access_token передается в params (для методов, где он требуется)
    """

    def __init__(
        self,
        *,
        base_url: str,
        auth: UisAuth,
        request_id: str = "req1",
        timeout_seconds: float = 30.0,
        verify_tls: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = auth
        self._request_id = request_id
        self._timeout = httpx.Timeout(timeout_seconds)
        self._verify_tls = verify_tls

    async def call(self, *, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params or {},
        }

        url = self._base_url
        headers = {"Content-Type": "application/json; charset=UTF-8"}

        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.post(url, json=body, headers=headers)

        if resp.status_code >= 400:
            raise UisError(f"UIS HTTP {resp.status_code}: {resp.text[:500]}")

        try:
            data = resp.json()
        except Exception as e:  # noqa: BLE001
            raise UisError(f"UIS invalid JSON: {e}") from e

        # JSON-RPC: ошибка может быть при 200
        if isinstance(data, dict) and data.get("error"):
            raise UisError(f"UIS RPC error: {data['error']}")

        return data

    async def login_user(self, *, login: str, password: str) -> dict[str, Any]:
        # опционально, если захотите вернуться к логин/пароль схеме
        return await self.call(method="login.user", params={"login": login, "password": password})

    async def logout_user(self) -> dict[str, Any]:
        return await self.call(method="logout.user", params={"access_token": self._auth.access_token})

    async def get_calls_report(
        self,
        *,
        date_from: str,
        date_till: str,
        limit: int = 1000,
        offset: int = 0,
        fields: list[str] | None = None,
        filter_: dict[str, Any] | None = None,
        include_ongoing_calls: bool | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "access_token": self._auth.access_token,
            "date_from": date_from,
            "date_till": date_till,
            "limit": limit,
            "offset": offset,
        }
        if fields is not None:
            params["fields"] = fields
        if filter_ is not None:
            params["filter"] = filter_
        if include_ongoing_calls is not None:
            params["include_ongoing_calls"] = include_ongoing_calls
        return await self.call(method="get.calls_report", params=params)

