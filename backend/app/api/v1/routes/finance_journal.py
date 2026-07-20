from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity, user_face_name
from app.domain.violation_journal import format_violation_date, month_key, parse_month_key, parse_violation_date
from app.infra.models import FinanceJournalEntry, KcEmployee

router = APIRouter()

VALID_TYPES = frozenset({"overtime", "bonus", "recalculation"})


def _require_supervisor_or_superadmin(identity: Identity) -> None:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя или суперадмина")


def _validate_type(entry_type: str) -> str:
    key = (entry_type or "").strip().lower()
    if key not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Неизвестный тип журнала")
    return key


def _entry_dict(row: FinanceJournalEntry) -> dict:
    return {
        "id": row.id,
        "entryType": row.entry_type,
        "date": format_violation_date(row.entry_date),
        "employeeName": row.employee_name,
        "recordedBy": row.recorded_by,
        "hours": row.hours,
        "amount": row.amount,
        "reason": row.reason,
    }


class FinanceEntryBody(BaseModel):
    date: str
    employeeName: str
    recordedBy: str = ""
    hours: float = 0
    amount: float = 0
    reason: str = ""


class BulkDeleteBody(BaseModel):
    ids: list[int]


def _validate_body(entry_type: str, body: FinanceEntryBody) -> tuple:
    edate = parse_violation_date(body.date)
    if not edate:
        raise HTTPException(status_code=400, detail="Укажите дату в формате ДД.ММ.ГГГГ")
    if not body.employeeName.strip():
        raise HTTPException(status_code=400, detail="Укажите Ф.И.О.")
    if entry_type in ("bonus", "recalculation") and not body.reason.strip():
        raise HTTPException(status_code=400, detail="Укажите причину")
    hours = float(body.hours) if entry_type == "overtime" else 0.0
    if entry_type == "overtime" and hours <= 0:
        raise HTTPException(status_code=400, detail="Укажите количество часов")
    amount = float(body.amount)
    if amount == 0 and entry_type != "recalculation":
        raise HTTPException(status_code=400, detail="Укажите сумму")
    return edate, hours, amount


def _apply_body(
    row: FinanceJournalEntry,
    entry_type: str,
    body: FinanceEntryBody,
    edate,
    hours: float,
    amount: float,
    identity: Identity,
) -> None:
    row.entry_type = entry_type
    row.entry_date = edate
    row.employee_name = body.employeeName.strip()
    recorded = body.recordedBy.strip() or user_face_name(identity) or identity.email.split("@")[0]
    row.recorded_by = recorded
    row.hours = hours
    row.amount = amount
    row.reason = body.reason.strip()


@router.get("/{entry_type}/meta")
async def finance_journal_meta(
    entry_type: str,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    employees = (await session.execute(select(KcEmployee.full_name).order_by(KcEmployee.full_name.asc()))).scalars().all()
    employee_names = sorted({n.strip() for n in employees if n and n.strip()}, key=str.lower)

    recorded_db = (
        await session.execute(
            select(FinanceJournalEntry.recorded_by)
            .where(FinanceJournalEntry.entry_type == et)
            .distinct()
            .order_by(FinanceJournalEntry.recorded_by.asc())
        )
    ).scalars().all()
    recorded_hints = sorted({r.strip() for r in recorded_db if r and r.strip()}, key=str.lower)

    return {"employeeNames": employee_names, "recordedByHints": recorded_hints}


@router.get("/{entry_type}/entries")
async def list_finance_entries(
    entry_type: str,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    month: str = Query(""),
    employee: str = Query(""),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    stmt = (
        select(FinanceJournalEntry)
        .where(FinanceJournalEntry.entry_type == et)
        .order_by(FinanceJournalEntry.entry_date.desc(), FinanceJournalEntry.id.desc())
    )
    parsed_month = parse_month_key(month) if month.strip() else None
    if parsed_month:
        y, m = parsed_month
        stmt = stmt.where(
            extract("year", FinanceJournalEntry.entry_date) == y,
            extract("month", FinanceJournalEntry.entry_date) == m,
        )
    if employee.strip():
        stmt = stmt.where(FinanceJournalEntry.employee_name == employee.strip())
    rows = (await session.execute(stmt)).scalars().all()
    return {"entries": [_entry_dict(r) for r in rows]}


@router.post("/{entry_type}/entries")
async def create_finance_entry(
    entry_type: str,
    body: FinanceEntryBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    edate, hours, amount = _validate_body(et, body)
    row = FinanceJournalEntry(
        entry_type=et,
        recorded_by_email=identity.email.strip().lower(),
    )
    _apply_body(row, et, body, edate, hours, amount, identity)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _entry_dict(row)


@router.put("/{entry_type}/entries/{entry_id}")
async def update_finance_entry(
    entry_type: str,
    entry_id: int,
    body: FinanceEntryBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    row = await session.get(FinanceJournalEntry, entry_id)
    if not row or row.entry_type != et:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    edate, hours, amount = _validate_body(et, body)
    _apply_body(row, et, body, edate, hours, amount, identity)
    if not (row.recorded_by_email or "").strip():
        row.recorded_by_email = identity.email.strip().lower()
    await session.commit()
    await session.refresh(row)
    return _entry_dict(row)


@router.delete("/{entry_type}/entries/{entry_id}")
async def delete_finance_entry(
    entry_type: str,
    entry_id: int,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    row = await session.get(FinanceJournalEntry, entry_id)
    if not row or row.entry_type != et:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    await session.delete(row)
    await session.commit()
    return {"ok": True}


@router.post("/{entry_type}/entries/bulk-delete")
async def bulk_delete_finance_entries(
    entry_type: str,
    body: BulkDeleteBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    if not body.ids:
        return {"deleted": 0}
    rows = (
        await session.execute(
            select(FinanceJournalEntry).where(
                FinanceJournalEntry.id.in_(body.ids),
                FinanceJournalEntry.entry_type == et,
            )
        )
    ).scalars().all()
    for row in rows:
        await session.delete(row)
    await session.commit()
    return {"deleted": len(rows)}


@router.get("/{entry_type}/stats")
async def finance_journal_stats(
    entry_type: str,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    month: str = Query(""),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    stmt = select(FinanceJournalEntry).where(FinanceJournalEntry.entry_type == et)
    parsed_month = parse_month_key(month) if month.strip() else None
    if parsed_month:
        y, m = parsed_month
        stmt = stmt.where(
            extract("year", FinanceJournalEntry.entry_date) == y,
            extract("month", FinanceJournalEntry.entry_date) == m,
        )
    rows = (await session.execute(stmt)).scalars().all()

    by_employee_hours: dict[str, float] = {}
    by_employee_amount: dict[str, float] = {}
    for r in rows:
        emp = r.employee_name.strip() or "—"
        by_employee_hours[emp] = by_employee_hours.get(emp, 0.0) + float(r.hours or 0)
        by_employee_amount[emp] = by_employee_amount.get(emp, 0.0) + float(r.amount or 0)

    if et == "overtime":
        employees = [
            {"name": name, "hours": round(hours, 2), "amount": round(by_employee_amount.get(name, 0), 2)}
            for name, hours in sorted(by_employee_hours.items(), key=lambda x: (-x[1], x[0].lower()))
        ]
    else:
        employees = [
            {"name": name, "count": 0, "amount": round(amount, 2)}
            for name, amount in sorted(by_employee_amount.items(), key=lambda x: (-x[1], x[0].lower()))
        ]
        for r in rows:
            emp = r.employee_name.strip() or "—"
            for item in employees:
                if item["name"] == emp:
                    item["count"] += 1
                    break

    return {"month": month, "entryType": et, "employees": employees}


@router.get("/{entry_type}/dynamics")
async def finance_journal_dynamics(
    entry_type: str,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    top: int = Query(50, ge=1, le=50),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    et = _validate_type(entry_type)
    rows = (
        await session.execute(select(FinanceJournalEntry).where(FinanceJournalEntry.entry_type == et))
    ).scalars().all()
    if not rows:
        return {"entryType": et, "months": [], "series": []}

    month_values: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    totals: dict[str, float] = defaultdict(float)

    for r in rows:
        mk = month_key(r.entry_date)
        key = r.employee_name.strip() or "—"
        value = float(r.hours or 0) if et == "overtime" else float(r.amount or 0)
        month_values[mk][key] += value
        totals[key] += value

    months = sorted(month_values.keys())
    top_keys = [k for k, _ in sorted(totals.items(), key=lambda x: (-x[1], x[0].lower()))[:top]]

    series = []
    for key in top_keys:
        monthly = [round(month_values[m].get(key, 0.0), 2) for m in months]
        prev = monthly[-2] if len(monthly) >= 2 else 0
        cur = monthly[-1] if monthly else 0
        if prev > 0:
            delta_percent = round(((cur - prev) / prev) * 100)
        elif cur > 0:
            delta_percent = 100
        else:
            delta_percent = 0
        series.append(
            {
                "key": key,
                "label": key,
                "monthly": monthly,
                "total": round(sum(monthly), 2),
                "deltaPercent": delta_percent,
            }
        )

    return {"entryType": et, "months": months, "series": series}
