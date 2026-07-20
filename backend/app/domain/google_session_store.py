from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.remote_work import DEFAULT_DEPARTMENT
from app.infra.models import EmployeeProfile


async def get_or_create_profile(session: AsyncSession, email: str) -> EmployeeProfile:
    row = (
        await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == email))
    ).scalar_one_or_none()
    if row:
        return row
    row = EmployeeProfile(email=email, department=DEFAULT_DEPARTMENT)
    session.add(row)
    await session.flush()
    return row


async def persist_google_session(
    session: AsyncSession,
    *,
    email: str,
    full_name: str,
    google_access_token: str,
    google_refresh_token: str,
    google_access_exp: int,
    birthday: str = "",
    picture: str = "",
) -> None:
    row = await get_or_create_profile(session, email)
    if full_name.strip():
        row.full_name = full_name.strip()
    row.google_access_token = google_access_token.strip()
    if google_refresh_token.strip():
        row.google_refresh_token = google_refresh_token.strip()
    row.google_access_exp = int(google_access_exp or 0)
    if birthday.strip():
        row.google_birthday = birthday.strip()
    if picture.strip():
        row.google_picture = picture.strip()
