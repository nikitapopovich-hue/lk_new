from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

_USEDESK_ERROR_MESSAGES: dict[int, str] = {
    111: "ошибка на сервере Usedesk",
    112: "неверный API-токен",
    113: "неверный id запроса или нет доступа",
    114: "не передан текст сообщения",
    115: "ошибка доступа (проверьте токен и URL API)",
    116: "теги переданы в неверном формате",
    117: "некорректный id пользователя",
    118: "некорректный id группы",
    119: "некорректный id клиента",
    120: "размер файла превышает 15 МБ",
    121: "превышен лимит запросов",
}


@dataclass(frozen=True)
class UsedeskAuth:
    api_token: str


class UsedeskError(RuntimeError):
    pass


def _is_user_record(item: Any) -> bool:
    return isinstance(item, dict) and ("email" in item or "name" in item) and "id" in item


def _is_group_record(item: Any) -> bool:
    return isinstance(item, dict) and isinstance(item.get("users"), list)


def _raise_if_usedesk_error(data: Any) -> None:
    if not isinstance(data, dict):
        return
    if "code" not in data:
        return
    code_raw = data.get("code")
    try:
        code = int(code_raw)
    except (TypeError, ValueError):
        code = 0
    detail = str(data.get("error") or data.get("message") or "").strip()
    label = _USEDESK_ERROR_MESSAGES.get(code, "ошибка Usedesk API")
    if detail and detail.lower() not in label.lower():
        raise UsedeskError(f"Usedesk ({code}): {label} — {detail}")
    raise UsedeskError(f"Usedesk ({code}): {label}")


def _flatten_group_users(groups: list[Any]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for group in groups:
        if not isinstance(group, dict):
            continue
        for user in group.get("users") or []:
            if not _is_user_record(user):
                continue
            uid = str(user.get("id") or "")
            if uid and uid not in by_id:
                by_id[uid] = user
    return list(by_id.values())


def _extract_users_payload(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        if not data:
            return []
        if _is_user_record(data[0]):
            return [x for x in data if isinstance(x, dict)]
        if _is_group_record(data[0]):
            return _flatten_group_users(data)
        return [x for x in data if isinstance(x, dict)]

    if not isinstance(data, dict):
        raise UsedeskError(f"Unexpected Usedesk users response type: {type(data).__name__}")

    _raise_if_usedesk_error(data)

    for key in ("users", "data", "result", "items", "list"):
        nested = data.get(key)
        if isinstance(nested, list):
            return _extract_users_payload(nested)

    if _is_user_record(data):
        return [data]

    raise UsedeskError(
        "Unexpected Usedesk users response shape "
        f"(keys: {', '.join(sorted(str(k) for k in data.keys()))})"
    )


class UsedeskClient:
    def __init__(
        self,
        *,
        base_url: str,
        auth: UsedeskAuth,
        timeout_seconds: float = 30.0,
        verify_tls: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = auth
        self._timeout = httpx.Timeout(timeout_seconds)
        self._verify_tls = verify_tls

    async def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self._base_url}/{path.lstrip('/')}"
        body = {"api_token": self._auth.api_token, **(payload or {})}
        async with httpx.AsyncClient(timeout=self._timeout, verify=self._verify_tls) as client:
            resp = await client.post(url, json=body)
        if resp.status_code >= 400:
            raise UsedeskError(f"Usedesk HTTP {resp.status_code}: {resp.text[:500]}")
        return resp.json()

    async def list_users(self, *, user_type: str | None = None) -> list[dict[str, Any]]:
        """
        POST /users — список агентов (см. документацию Usedesk).
        Для коробочной установки URL обычно отличается от api.usedesk.ru.
        """
        payload: dict[str, Any] = {}
        if user_type:
            payload["user_type"] = user_type
        data = await self.post("/users", payload or None)
        users = _extract_users_payload(data)
        if users:
            return users

        groups_data = await self.post("/groups")
        if isinstance(groups_data, list):
            flattened = _flatten_group_users(groups_data)
            if flattened:
                return flattened
        else:
            _extract_users_payload(groups_data)
        return []
