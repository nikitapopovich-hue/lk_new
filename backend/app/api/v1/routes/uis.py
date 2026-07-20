from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.integrations.uis.client import UisAuth, UisDataApiClient

router = APIRouter()


class UisGroup(BaseModel):
    group_id: int | None = None
    group_name: str | None = None


class UisEmployee(BaseModel):
    id: str
    full_name: str = ""
    login: str = ""
    groups: list[UisGroup] = []


@router.get("/employees")
async def list_employees(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    if not settings.uis_data_api_access_token:
        return {"ok": False, "error": "Not configured (UIS_DATA_API_ACCESS_TOKEN)", "items": []}

    uis = UisDataApiClient(
        base_url=str(settings.uis_data_api_base_url),
        auth=UisAuth(access_token=settings.uis_data_api_access_token),
        request_id=settings.uis_data_api_request_id,
        timeout_seconds=settings.uis_data_api_timeout_seconds,
    )

    res = await uis.call(
        method="get.employees",
        params={
            "access_token": settings.uis_data_api_access_token,
            "fields": ["id", "groups", "full_name", "login"],
        },
    )

    payload = (res.get("result") or {}).get("data") or res.get("result") or {}
    if isinstance(payload, dict):
        candidates = payload.get("items") or payload.get("list") or payload.get("rows") or []
    elif isinstance(payload, list):
        candidates = payload
    else:
        candidates = []

    items: list[UisEmployee] = []
    for e in candidates:
        if not isinstance(e, dict):
            continue
        emp_id = str(e.get("id") or "").strip()
        if not emp_id:
            continue
        groups_raw = e.get("groups") or []
        groups: list[UisGroup] = []
        if isinstance(groups_raw, list):
            for g in groups_raw:
                if isinstance(g, dict):
                    groups.append(UisGroup(group_id=g.get("group_id"), group_name=g.get("group_name")))
        items.append(
            UisEmployee(
                id=emp_id,
                full_name=str(e.get("full_name") or e.get("fullName") or "").strip(),
                login=str(e.get("login") or "").strip(),
                groups=groups,
            )
        )

    items.sort(key=lambda x: (x.full_name or "", x.id))
    return {"ok": True, "items": [it.model_dump() for it in items]}

