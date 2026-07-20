from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.infra.models import EmployeeMapping

router = APIRouter()


class MappingDto(BaseModel):
    id: int
    email: str
    displayName: str = ""
    backofficeUserId: str = ""
    backofficeLogonName: str = ""
    usedeskUserId: str = ""
    usedeskEmail: str = ""
    uisEmployeeId: str = ""
    uisLogin: str = ""
    notes: str = ""


def _dto(m: EmployeeMapping) -> MappingDto:
    return MappingDto(
        id=m.id,
        email=m.email,
        displayName=m.display_name,
        backofficeUserId=m.backoffice_user_id,
        backofficeLogonName=m.backoffice_logon_name,
        usedeskUserId=m.usedesk_user_id,
        usedeskEmail=m.usedesk_email,
        uisEmployeeId=m.uis_employee_id,
        uisLogin=m.uis_login,
        notes=m.notes,
    )


@router.get("")
async def list_mappings(
    q: str = "",
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    stmt = select(EmployeeMapping)
    if q:
        like = f"%{q.lower()}%"
        # простая фильтрация; позже можно улучшить
        stmt = stmt.where(EmployeeMapping.email.ilike(like))
    rows = (await session.execute(stmt.order_by(EmployeeMapping.email.asc()))).scalars().all()
    return {"items": [_dto(r).model_dump() for r in rows]}


class CreateMappingRequest(BaseModel):
    email: str
    displayName: str = ""
    backofficeUserId: str = ""
    backofficeLogonName: str = ""
    usedeskUserId: str = ""
    usedeskEmail: str = ""
    uisEmployeeId: str = ""
    uisLogin: str = ""
    notes: str = ""


@router.post("")
async def create_mapping(
    body: CreateMappingRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    m = EmployeeMapping(
        email=body.email.strip().lower(),
        display_name=body.displayName.strip(),
        backoffice_user_id=body.backofficeUserId.strip(),
        backoffice_logon_name=body.backofficeLogonName.strip(),
        usedesk_user_id=body.usedeskUserId.strip(),
        usedesk_email=body.usedeskEmail.strip().lower(),
        uis_employee_id=body.uisEmployeeId.strip(),
        uis_login=body.uisLogin.strip(),
        notes=body.notes.strip(),
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return _dto(m).model_dump()


class UpdateMappingRequest(BaseModel):
    displayName: str | None = None
    backofficeUserId: str | None = None
    backofficeLogonName: str | None = None
    usedeskUserId: str | None = None
    usedeskEmail: str | None = None
    uisEmployeeId: str | None = None
    uisLogin: str | None = None
    notes: str | None = None


@router.put("/{mapping_id}")
async def update_mapping(
    mapping_id: int,
    body: UpdateMappingRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    m = await session.get(EmployeeMapping, mapping_id)
    if not m:
        raise HTTPException(status_code=404, detail="Not found")

    if body.displayName is not None:
        m.display_name = body.displayName
    if body.backofficeUserId is not None:
        m.backoffice_user_id = body.backofficeUserId
    if body.backofficeLogonName is not None:
        m.backoffice_logon_name = body.backofficeLogonName
    if body.usedeskUserId is not None:
        m.usedesk_user_id = body.usedeskUserId
    if body.usedeskEmail is not None:
        m.usedesk_email = body.usedeskEmail.lower()
    if body.uisEmployeeId is not None:
        m.uis_employee_id = body.uisEmployeeId
    if body.uisLogin is not None:
        m.uis_login = body.uisLogin
    if body.notes is not None:
        m.notes = body.notes

    await session.commit()
    await session.refresh(m)
    return _dto(m).model_dump()


@router.delete("/{mapping_id}")
async def delete_mapping(
    mapping_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    m = await session.get(EmployeeMapping, mapping_id)
    if not m:
        return {"ok": True}
    await session.delete(m)
    await session.commit()
    return {"ok": True}

