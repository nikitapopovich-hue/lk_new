from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.integrations.backoffice.client import BackofficeAuth, BackofficeClient

router = APIRouter()


def _client(settings: Settings) -> BackofficeClient:
    return BackofficeClient(
        base_url=str(settings.backoffice_base_url),
        auth=BackofficeAuth(
            login=settings.backoffice_login,
            fsid=settings.backoffice_fsid,
            user_id=settings.backoffice_user_id,
            user_lang=settings.backoffice_user_lang,
        ),
        timeout_seconds=settings.backoffice_timeout_seconds,
    )


class VersionPacket(BaseModel):
    className: str
    fromVersion: str = "0"
    maxCount: int = 10000


class GetObjectsRequest(BaseModel):
    packets: list[VersionPacket]


@router.post("/getObjectsFromVersionPackets")
async def get_objects_from_version_packets(
    body: GetObjectsRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await _client(settings).get_objects_from_version_packets(
        packets=[p.model_dump() for p in body.packets],
    )

@router.get("/users")
async def list_users(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """
    Возвращает нормализованный список сотрудников из Backoffice (Users.User).

    В ответе Backoffice обычно: response.list[] с элементами { id, object{ fullName, group, ... } }.
    """
    raw = await _client(settings).get_objects_from_version_packets(
        packets=[{"className": "Users.User", "fromVersion": "0", "maxCount": 10000}],
    )
    lst = (raw.get("response") or {}).get("list") or []

    items: list[dict[str, Any]] = []
    for it in lst:
        obj = it.get("object") or {}
        items.append(
            {
                "id": str(it.get("id") or obj.get("id") or ""),
                "fullName": obj.get("fullName") or obj.get("full_name") or obj.get("name") or "",
                "groupId": str(obj.get("group") or ""),
                "logonName": obj.get("logonName") or "",
            }
        )

    # отфильтруем пустые
    items = [x for x in items if x["id"]]
    # сортировка для удобства UI
    items.sort(key=lambda x: (x["groupId"] or "", x["fullName"] or "", x["id"]))
    return {"items": items}


class SetUserSettingsRequest(BaseModel):
    nameSpace: str
    value: dict[str, Any] = Field(default_factory=dict)


@router.post("/userSettings/set")
async def user_settings_set(
    body: SetUserSettingsRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await _client(settings).user_settings_set(name_space=body.nameSpace, value=body.value)


class GetTicketsFromVersionRequest(BaseModel):
    fromVersion: str = "0"
    maxCount: int = 500
    ticketStates: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])


@router.post("/clientSupport/getTicketsFromVersion")
async def client_support_get_tickets_from_version(
    body: GetTicketsFromVersionRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await _client(settings).get_tickets_from_version(
        from_version=body.fromVersion,
        max_count=body.maxCount,
        ticket_states=body.ticketStates,
    )


class GetTicketMessagesFromVersionRequest(BaseModel):
    ticketId: str
    fromVersion: str = "0"
    maxCount: int = 500


@router.post("/clientSupport/getTicketMessagesFromVersion")
async def client_support_get_ticket_messages_from_version(
    body: GetTicketMessagesFromVersionRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await _client(settings).get_ticket_messages_from_version(
        ticket_id=body.ticketId,
        from_version=body.fromVersion,
        max_count=body.maxCount,
    )


class GetTicketEventsFromVersionRequest(BaseModel):
    ticketId: str
    fromVersion: str = "0"
    maxCount: int = 500


@router.post("/clientSupport/getTicketEventsFromVersion")
async def client_support_get_ticket_events_from_version(
    body: GetTicketEventsFromVersionRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await _client(settings).get_ticket_events_from_version(
        ticket_id=body.ticketId,
        from_version=body.fromVersion,
        max_count=body.maxCount,
    )

