from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.domain.remote_work import (
    DEFAULT_DEPARTMENT,
    display_full_name,
    face_name_from_identity,
    remote_work_status,
    resolve_department,
)
from app.infra.models import EmployeeMapping, EmployeeProfile

router = APIRouter()


class ProfileRemoteWork(BaseModel):
    homeAddress: str = ""
    internetProvider: str = ""
    patchCordLength: str = ""
    hasPcLaptop: str = ""
    canWorkProgramsHome: str = ""
    internetAccess: str = ""
    hasHeadset: str = ""


class ProfileSubscriptions(BaseModel):
    bonuses: bool = True
    overtime: bool = False
    newFines: bool = True
    recalculations: bool = True
    monitoring: bool = True
    kpd: bool = True
    all: bool = True


class EmployeeProfileResponse(BaseModel):
    email: str
    remoteWork: ProfileRemoteWork
    subscriptions: ProfileSubscriptions
    fullName: str = ""
    department: str = ""
    remoteWorkStatus: str = "empty"


class EmployeeProfileUpdate(BaseModel):
    remoteWork: ProfileRemoteWork | None = None
    subscriptions: ProfileSubscriptions | None = None


class RemoteWorkListItem(BaseModel):
    email: str
    fullName: str
    department: str
    remoteWork: ProfileRemoteWork
    updatedAt: datetime | None = None
    status: str


class RemoteWorkListResponse(BaseModel):
    items: list[RemoteWorkListItem]


def _require_supervisor(identity: Identity) -> None:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя")


def _row_to_response(row: EmployeeProfile, mapping_name: str = "") -> EmployeeProfileResponse:
    full_name = display_full_name(row, mapping_name)
    dept = resolve_department(row.email, row.department)
    return EmployeeProfileResponse(
        email=row.email,
        remoteWork=ProfileRemoteWork(
            homeAddress=row.home_address,
            internetProvider=row.internet_provider,
            patchCordLength=row.patch_cord_length,
            hasPcLaptop=row.has_pc_laptop,
            canWorkProgramsHome=row.can_work_programs_home,
            internetAccess=row.internet_access,
            hasHeadset=row.has_headset,
        ),
        subscriptions=ProfileSubscriptions(
            bonuses=row.subscribe_bonuses,
            overtime=row.subscribe_overtime,
            newFines=row.subscribe_new_fines,
            recalculations=getattr(row, "subscribe_recalculations", True),
            monitoring=getattr(row, "subscribe_monitoring", True),
            kpd=getattr(row, "subscribe_kpd", True),
            all=getattr(row, "subscribe_all", True),
        ),
        fullName=full_name,
        department=dept,
        remoteWorkStatus=remote_work_status(row),
    )


def _sync_identity_meta(row: EmployeeProfile, identity: Identity) -> None:
    name = face_name_from_identity(identity)
    if name:
        row.full_name = name
    if not (row.department or "").strip():
        row.department = DEFAULT_DEPARTMENT


async def _get_or_create(session: AsyncSession, email: str) -> EmployeeProfile:
    row = (await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == email))).scalar_one_or_none()
    if row:
        return row
    row = EmployeeProfile(email=email, department=DEFAULT_DEPARTMENT)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/remote-work")
async def list_remote_work_profiles(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> RemoteWorkListResponse:
    """Список анкет удалённой работы всех сотрудников (для руководителя)."""
    _require_supervisor(identity)

    rows = (
        await session.execute(select(EmployeeProfile).order_by(EmployeeProfile.updated_at.desc()))
    ).scalars().all()

    mapping_rows = (await session.execute(select(EmployeeMapping))).scalars().all()
    names_by_email = {m.email.strip().lower(): (m.display_name or "").strip() for m in mapping_rows}

    items: list[RemoteWorkListItem] = []
    for row in rows:
        email_key = row.email.strip().lower()
        full_name = display_full_name(row, names_by_email.get(email_key, ""))
        dept = resolve_department(row.email, row.department)
        items.append(
            RemoteWorkListItem(
                email=row.email,
                fullName=full_name or row.email.split("@")[0],
                department=dept,
                remoteWork=_row_to_response(row).remoteWork,
                updatedAt=row.updated_at,
                status=remote_work_status(row),
            )
        )
    return RemoteWorkListResponse(items=items)


@router.get("")
async def get_employee_profile(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> EmployeeProfileResponse:
    row = await _get_or_create(session, identity.email)
    _sync_identity_meta(row, identity)
    await session.commit()
    await session.refresh(row)
    mapping_name = ""
    if identity.mapping:
        mapping_name = (identity.mapping.display_name or "").strip()
    return _row_to_response(row, mapping_name)


@router.put("")
async def update_employee_profile(
    body: EmployeeProfileUpdate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> EmployeeProfileResponse:
    row = await _get_or_create(session, identity.email)
    _sync_identity_meta(row, identity)
    if body.remoteWork is not None:
        rw = body.remoteWork
        row.home_address = rw.homeAddress.strip()
        row.internet_provider = rw.internetProvider.strip()
        row.patch_cord_length = rw.patchCordLength.strip()
        row.has_pc_laptop = rw.hasPcLaptop.strip()
        row.can_work_programs_home = rw.canWorkProgramsHome.strip()
        row.internet_access = rw.internetAccess.strip()
        row.has_headset = rw.hasHeadset.strip()
    if body.subscriptions is not None:
        s = body.subscriptions
        row.subscribe_bonuses = s.bonuses
        row.subscribe_overtime = s.overtime
        row.subscribe_new_fines = s.newFines
        row.subscribe_recalculations = s.recalculations
        row.subscribe_monitoring = s.monitoring
        row.subscribe_kpd = s.kpd
        row.subscribe_all = s.all
    await session.commit()
    await session.refresh(row)
    mapping_name = ""
    if identity.mapping:
        mapping_name = (identity.mapping.display_name or "").strip()
    return _row_to_response(row, mapping_name)
