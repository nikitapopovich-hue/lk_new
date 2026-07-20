from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.auth.passwords import generate_password, hash_password
from app.auth.roles import can_use_superadmin
from app.core.config import Settings, get_settings
from app.infra.models import UserAccount

router = APIRouter()


async def require_superadmin(
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> Identity:
    if not can_use_superadmin(identity.email, settings):
        raise HTTPException(status_code=403, detail="Доступ только для суперадмина")
    return identity


class CreateAccountBody(BaseModel):
    email: EmailStr


@router.get("")
async def list_accounts(
    _: Identity = Depends(require_superadmin),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    rows = (
        await session.execute(select(UserAccount).order_by(UserAccount.created_at))
    ).scalars().all()
    return {"accounts": [{"email": r.email, "createdAt": r.created_at.isoformat()} for r in rows]}


@router.post("")
async def create_account(
    body: CreateAccountBody,
    admin: Identity = Depends(require_superadmin),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    email = str(body.email).strip().lower()
    existing = (
        await session.execute(select(UserAccount).where(UserAccount.email == email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Учётка с таким email уже существует")
    password = generate_password()
    session.add(
        UserAccount(email=email, password_hash=hash_password(password), created_by_email=admin.email)
    )
    await session.commit()
    return {"email": email, "password": password}


@router.delete("/{email}")
async def delete_account(
    email: str,
    _: Identity = Depends(require_superadmin),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    target = email.strip().lower()
    row = (
        await session.execute(select(UserAccount).where(UserAccount.email == target))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Учётка не найдена")
    await session.delete(row)
    await session.commit()
    return {"ok": True}
