from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import httpx


BackofficePath = Literal[
    "/api/backoffice/getObjectsFromVersionPackets",
    "/api/backoffice/userSettings/set",
    "/api/clientSupport/getTicketsFromVersion",
    "/api/clientSupport/getTicketMessagesFromVersion",
    "/api/clientSupport/getTicketEventsFromVersion",
]


@dataclass(frozen=True)
class BackofficeAuth:
    login: str
    fsid: str
    user_id: str
    user_lang: str = "ru"


class BackofficeError(RuntimeError):
    pass


class BackofficeClient:
    def __init__(
        self,
        *,
        base_url: str,
        auth: BackofficeAuth,
        timeout_seconds: float = 30.0,
        verify_tls: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = auth
        self._timeout = httpx.Timeout(timeout_seconds)
        self._verify_tls = verify_tls

    def _with_auth(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            **payload,
            "login": self._auth.login,
            "fsid": self._auth.fsid,
            "userId": self._auth.user_id,
            "userLang": self._auth.user_lang,
        }

    async def _post(self, path: BackofficePath, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.post(url, json=self._with_auth(payload))

        # Backoffice иногда отвечает 200 с ошибкой в JSON — пока просто отдаем сырой JSON
        if resp.status_code >= 400:
            raise BackofficeError(f"Backoffice HTTP {resp.status_code}: {resp.text[:500]}")

        try:
            data = resp.json()
        except Exception as e:  # noqa: BLE001
            raise BackofficeError(f"Backoffice invalid JSON: {e}") from e

        return data

    async def get_objects_from_version_packets(
        self,
        *,
        packets: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return await self._post(
            "/api/backoffice/getObjectsFromVersionPackets",
            {"packets": packets},
        )

    async def user_settings_set(
        self,
        *,
        name_space: str,
        value: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._post(
            "/api/backoffice/userSettings/set",
            {"nameSpace": name_space, "value": value},
        )

    async def get_tickets_from_version(
        self,
        *,
        from_version: str = "0",
        max_count: int = 1000,
        ticket_states: list[int] | None = None,
    ) -> dict[str, Any]:
        """
        ClientSupport: get tickets list.

        Документ "Расшифровка основных полей (БО).pdf" описывает ответы этого метода.
        Формат запроса в документе явно не приведён, поэтому используем максимально
        безопасный минимальный payload и постепенно уточним параметры.
        """
        payload: dict[str, Any] = {"fromVersion": from_version, "maxCount": str(max_count)}
        if ticket_states is not None:
            payload["ticketStates"] = ticket_states
        return await self._post(
            "/api/clientSupport/getTicketsFromVersion",
            payload,
        )

    async def get_ticket_messages_from_version(
        self,
        *,
        ticket_id: str,
        from_version: str = "0",
        max_count: int = 200,
    ) -> dict[str, Any]:
        return await self._post(
            "/api/clientSupport/getTicketMessagesFromVersion",
            {"ticketId": ticket_id, "fromVersion": from_version, "maxCount": str(max_count)},
        )

    async def get_ticket_events_from_version(
        self,
        *,
        ticket_id: str,
        from_version: str = "0",
        max_count: int = 200,
    ) -> dict[str, Any]:
        # В примере fromVersion может отсутствовать, но добавляем для совместимости.
        return await self._post(
            "/api/clientSupport/getTicketEventsFromVersion",
            {"ticketId": ticket_id, "fromVersion": from_version, "maxCount": str(max_count)},
        )

