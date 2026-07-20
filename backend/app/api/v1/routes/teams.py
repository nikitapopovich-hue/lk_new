from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.infra.models import EmployeeMapping, KcEmployee, Team, TeamMember

router = APIRouter()


def _require_supervisor_or_superadmin(identity: Identity) -> None:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя или суперадмина")


def _can_manage_team(identity: Identity, team: Team) -> bool:
    if identity.preferred_role == "superadmin":
        return True
    owner = (team.owner_email or "").strip().lower()
    if not owner:
        return True
    return owner == identity.email.strip().lower()


class TeamDto(BaseModel):
    id: int
    name: str
    memberUserIds: list[str] = Field(default_factory=list)
    memberKcEmployeeIds: list[int] = Field(default_factory=list)
    ownerEmail: str = ""


async def _mapping_by_email(session: AsyncSession) -> dict[str, EmployeeMapping]:
    rows = (await session.execute(select(EmployeeMapping))).scalars().all()
    out: dict[str, EmployeeMapping] = {}
    for m in rows:
        key = (m.email or "").strip().lower()
        if key:
            out[key] = m
    return out


def _kc_placeholder_user_id(kc_id: int) -> str:
    return f"kc:{kc_id}"


def _is_real_backoffice_id(user_id: str) -> bool:
    uid = (user_id or "").strip()
    return bool(uid) and not uid.startswith("kc:")


async def _resolve_members(
    session: AsyncSession,
    *,
    member_user_ids: list[str],
    member_kc_employee_ids: list[int],
) -> list[tuple[str, int | None]]:
    """
    Возвращает пары (user_id, kc_employee_id) для сохранения в team_members.
    user_id — backoffice id или kc:{id}, если маппинг не найден.
    """
    email_map = await _mapping_by_email(session)
    resolved: list[tuple[str, int | None]] = []
    seen: set[str] = set()

    for raw_uid in member_user_ids:
        uid = raw_uid.strip()
        if not uid or uid in seen:
            continue
        seen.add(uid)
        resolved.append((uid, None))

    if member_kc_employee_ids:
        kc_rows = (
            await session.execute(select(KcEmployee).where(KcEmployee.id.in_(member_kc_employee_ids)))
        ).scalars().all()
        kc_by_id = {r.id: r for r in kc_rows}

        for kc_id in member_kc_employee_ids:
            row = kc_by_id.get(kc_id)
            if not row:
                continue
            email = (row.email_new or "").strip().lower()
            mapping = email_map.get(email) if email else None
            bo_id = (mapping.backoffice_user_id or "").strip() if mapping else ""
            uid = bo_id or _kc_placeholder_user_id(kc_id)
            if uid in seen:
                continue
            seen.add(uid)
            resolved.append((uid, kc_id))

    return resolved


async def _dto(session: AsyncSession, t: Team) -> TeamDto:
    members = (
        await session.execute(select(TeamMember).where(TeamMember.team_id == t.id))
    ).scalars().all()
    user_ids: list[str] = []
    kc_ids: list[int] = []
    for m in members:
        if _is_real_backoffice_id(m.user_id):
            user_ids.append(m.user_id)
        if m.kc_employee_id is not None:
            kc_ids.append(m.kc_employee_id)
    return TeamDto(
        id=t.id,
        name=t.name,
        memberUserIds=user_ids,
        memberKcEmployeeIds=kc_ids,
        ownerEmail=t.owner_email or "",
    )


def _team_list_filter(identity: Identity):
    if identity.preferred_role == "superadmin":
        return None
    email = identity.email.strip().lower()
    return or_(Team.owner_email == "", Team.owner_email.ilike(email))


@router.get("")
async def list_teams(
    session: AsyncSession = Depends(get_db_session),
    identity: Identity = Depends(get_identity),
) -> dict[str, Any]:
    _require_supervisor_or_superadmin(identity)
    stmt = select(Team).order_by(Team.name.asc())
    flt = _team_list_filter(identity)
    if flt is not None:
        stmt = stmt.where(flt)
    teams = (await session.execute(stmt)).scalars().all()
    items = [(await _dto(session, t)).model_dump() for t in teams]
    return {"items": items}


class CreateTeamRequest(BaseModel):
    name: str
    memberUserIds: list[str] = Field(default_factory=list)
    memberKcEmployeeIds: list[int] = Field(default_factory=list)


@router.post("")
async def create_team(
    body: CreateTeamRequest,
    session: AsyncSession = Depends(get_db_session),
    identity: Identity = Depends(get_identity),
) -> dict[str, Any]:
    _require_supervisor_or_superadmin(identity)
    t = Team(
        name=body.name.strip() or "Новая команда",
        owner_email=identity.email.strip().lower(),
    )
    session.add(t)
    await session.flush()

    pairs = await _resolve_members(
        session,
        member_user_ids=body.memberUserIds,
        member_kc_employee_ids=body.memberKcEmployeeIds,
    )
    for uid, kc_id in pairs:
        session.add(TeamMember(team_id=t.id, user_id=uid, kc_employee_id=kc_id))

    await session.commit()
    await session.refresh(t)
    return (await _dto(session, t)).model_dump()


class UpdateTeamRequest(BaseModel):
    name: str | None = None
    memberUserIds: list[str] | None = None
    memberKcEmployeeIds: list[int] | None = None


@router.put("/{team_id}")
async def update_team(
    team_id: int,
    body: UpdateTeamRequest,
    session: AsyncSession = Depends(get_db_session),
    identity: Identity = Depends(get_identity),
) -> dict[str, Any]:
    _require_supervisor_or_superadmin(identity)
    t = await session.get(Team, team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_manage_team(identity, t):
        raise HTTPException(status_code=403, detail="Нет прав на редактирование этой команды")

    if body.name is not None:
        t.name = body.name.strip() or t.name

    if body.memberUserIds is not None or body.memberKcEmployeeIds is not None:
        user_ids = body.memberUserIds if body.memberUserIds is not None else []
        kc_ids = body.memberKcEmployeeIds if body.memberKcEmployeeIds is not None else []
        pairs = await _resolve_members(session, member_user_ids=user_ids, member_kc_employee_ids=kc_ids)
        await session.execute(delete(TeamMember).where(TeamMember.team_id == t.id))
        for uid, kc_id in pairs:
            session.add(TeamMember(team_id=t.id, user_id=uid, kc_employee_id=kc_id))

    await session.commit()
    await session.refresh(t)
    return (await _dto(session, t)).model_dump()


@router.delete("/{team_id}")
async def delete_team(
    team_id: int,
    session: AsyncSession = Depends(get_db_session),
    identity: Identity = Depends(get_identity),
) -> dict[str, Any]:
    _require_supervisor_or_superadmin(identity)
    t = await session.get(Team, team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_manage_team(identity, t):
        raise HTTPException(status_code=403, detail="Нет прав на удаление этой команды")

    await session.execute(delete(TeamMember).where(TeamMember.team_id == team_id))
    await session.execute(delete(Team).where(Team.id == team_id))
    await session.commit()
    return {"ok": True}


class BulkDeleteTeamsRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)


@router.post("/bulk-delete")
async def bulk_delete_teams(
    body: BulkDeleteTeamsRequest,
    session: AsyncSession = Depends(get_db_session),
    identity: Identity = Depends(get_identity),
) -> dict[str, Any]:
    _require_supervisor_or_superadmin(identity)
    unique_ids = list(dict.fromkeys(body.ids))
    if not unique_ids:
        return {"ok": True, "deleted": 0}

    teams = (await session.execute(select(Team).where(Team.id.in_(unique_ids)))).scalars().all()
    allowed_ids = [t.id for t in teams if _can_manage_team(identity, t)]
    if not allowed_ids:
        return {"ok": True, "deleted": 0}

    await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(allowed_ids)))
    await session.execute(delete(Team).where(Team.id.in_(allowed_ids)))
    await session.commit()
    return {"ok": True, "deleted": len(allowed_ids)}
