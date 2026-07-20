from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class MonitoringError(RuntimeError):
    pass


@dataclass(frozen=True)
class MonitoringUser:
    user_id: str
    username: str
    display_name: str
    role_name: str
    is_deleted: bool = False


@dataclass(frozen=True)
class MonitoringUserMetrics:
    user_id: str
    username: str
    display_name: str
    year: int
    month: int
    score_final: float
    score_raw: float
    category: str
    monitorings_count: int | None = None


class MonitoringClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_token: str,
        timeout_seconds: float = 30.0,
        verify_tls: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_token = api_token.strip()
        self._timeout = httpx.Timeout(timeout_seconds)
        self._verify_tls = verify_tls

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_token}"}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._api_token:
            raise MonitoringError("MONITORING_API_TOKEN is not configured")

        url = f"{self._base_url}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.request(method, url, headers=self._headers(), json=json_body)

        try:
            payload = resp.json()
        except Exception as e:  # noqa: BLE001
            if resp.status_code >= 400:
                raise MonitoringError(f"Monitoring HTTP {resp.status_code}: {resp.text[:500]}") from e
            raise MonitoringError(f"Monitoring invalid JSON: {e}") from e

        if resp.status_code >= 400 or not payload.get("success"):
            code = str(payload.get("code") or "unknown")
            error = str(payload.get("error") or f"Monitoring HTTP {resp.status_code}")
            raise MonitoringError(f"{error} ({code})")
        return payload

    async def health(self) -> dict[str, Any]:
        payload = await self._request("GET", "/health")
        return payload.get("data") or {}

    async def list_users(
        self,
        *,
        search: str | None = None,
        limit: int = 500,
        include_deleted: bool = False,
    ) -> list[MonitoringUser]:
        body: dict[str, Any] = {
            "limit": min(max(limit, 1), 500),
            "include_deleted": include_deleted,
        }
        if search:
            body["search"] = search
        payload = await self._request("POST", "/users", json_body=body)
        rows = payload.get("data") or []
        out: list[MonitoringUser] = []
        for row in rows:
            user_id = str(row.get("user_id") or "").strip()
            username = str(row.get("username") or "").strip()
            if not user_id or not username:
                continue
            out.append(
                MonitoringUser(
                    user_id=user_id,
                    username=username,
                    display_name=str(row.get("display_name") or "").strip(),
                    role_name=str(row.get("role_name") or "").strip(),
                    is_deleted=bool(row.get("is_deleted")),
                )
            )
        return out

    async def user_metrics(
        self,
        *,
        user_id: str,
        year: int,
        month: int,
        include_monitorings: bool = True,
    ) -> MonitoringUserMetrics | None:
        body = {
            "user_id": user_id,
            "year": year,
            "month": month,
            "include_monitorings": include_monitorings,
        }
        try:
            payload = await self._request("POST", "/users/metrics", json_body=body)
        except MonitoringError as e:
            if "user_not_found" in str(e).lower() or "не найден" in str(e).lower():
                return None
            raise
        data = payload.get("data") or {}
        score_final = data.get("score_final")
        if score_final is None:
            return None
        return MonitoringUserMetrics(
            user_id=str(data.get("user_id") or user_id),
            username=str(data.get("username") or ""),
            display_name=str(data.get("display_name") or ""),
            year=int(data.get("year") or year),
            month=int(data.get("month") or month),
            score_final=float(score_final),
            score_raw=float(data.get("score_raw") or score_final),
            category=str(data.get("category") or "").strip() or "D",
            monitorings_count=(
                int(data["monitorings_count"])
                if data.get("monitorings_count") is not None
                else None
            ),
        )

    async def user_history(
        self,
        *,
        user_id: str,
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        body = {"user_id": user_id, "limit": min(max(limit, 1), 36)}
        payload = await self._request("POST", "/users/history", json_body=body)
        data = payload.get("data") or {}
        return list(data.get("months") or [])
