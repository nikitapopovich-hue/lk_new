from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.domain.violation_journal import format_violation_date
from app.domain.violation_notifications import names_match, operator_name_candidates
from app.infra.models import EmployeeProfile, FinanceJournalEntry, ViolationJournalEntry

router = APIRouter()


async def _get_profile(session: AsyncSession, identity: Identity) -> EmployeeProfile:
    row = (
        await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == identity.email))
    ).scalar_one_or_none()
    if row:
        return row
    from app.domain.remote_work import DEFAULT_DEPARTMENT

    row = EmployeeProfile(email=identity.email, department=DEFAULT_DEPARTMENT)
    session.add(row)
    await session.flush()
    return row


async def _match_entries(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
    entry_type: str | None = None,
) -> list[FinanceJournalEntry]:
    candidates = await operator_name_candidates(session, identity, profile)
    if not candidates:
        return []
    stmt = select(FinanceJournalEntry).order_by(
        FinanceJournalEntry.entry_date.desc(),
        FinanceJournalEntry.id.desc(),
    )
    if entry_type:
        stmt = stmt.where(FinanceJournalEntry.entry_type == entry_type)
    rows = (await session.execute(stmt)).scalars().all()
    matched: list[FinanceJournalEntry] = []
    for row in rows:
        employee = row.employee_name.strip()
        if any(names_match(employee, name) for name in candidates):
            matched.append(row)
    return matched


@router.get("/my")
async def my_finance_data(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    profile = await _get_profile(session, identity)
    finance_rows = await _match_entries(session, identity, profile)

    overtime = [
        {
            "date": format_violation_date(r.entry_date),
            "hours": r.hours,
            "amount": r.amount,
        }
        for r in finance_rows
        if r.entry_type == "overtime"
    ]
    bonuses = [
        {
            "date": format_violation_date(r.entry_date),
            "reason": r.reason.strip() or "Премия",
            "amount": r.amount,
        }
        for r in finance_rows
        if r.entry_type == "bonus"
    ]
    recalculations = [
        {
            "date": format_violation_date(r.entry_date),
            "reason": r.reason.strip() or "Перерасчёт",
            "amount": r.amount,
        }
        for r in finance_rows
        if r.entry_type == "recalculation"
    ]

    candidates = await operator_name_candidates(session, identity, profile)
    fines: list[dict] = []
    if candidates:
        fine_rows = (
            await session.execute(
                select(ViolationJournalEntry)
                .where(ViolationJournalEntry.penalty_kind == "fine")
                .order_by(ViolationJournalEntry.violation_date.desc(), ViolationJournalEntry.id.desc())
            )
        ).scalars().all()
        for row in fine_rows:
            employee = row.employee_name.strip()
            if any(names_match(employee, name) for name in candidates):
                fines.append(
                    {
                        "date": format_violation_date(row.violation_date),
                        "reason": row.violation_type.strip() or "Штраф",
                        "amount": -abs(float(row.fine_amount or 0)),
                    }
                )

    return {
        "overtime": overtime,
        "bonuses": bonuses,
        "recalculations": recalculations,
        "fines": fines,
    }
