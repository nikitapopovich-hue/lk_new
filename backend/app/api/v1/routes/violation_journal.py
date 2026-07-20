from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.domain.violation_journal import format_violation_date, month_key, parse_month_key, parse_violation_date
from app.domain.violation_journal_xlsx import build_violation_xlsx, parse_violation_xlsx
from app.infra.models import KcEmployee, ViolationJournalEntry, ViolationTypePrice

router = APIRouter()

_SEED_FILE = Path(__file__).resolve().parents[3] / "data" / "violation_journal_seed.json"


def _require_supervisor_or_superadmin(identity: Identity) -> None:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя или суперадмина")


def _entry_dict(row: ViolationJournalEntry) -> dict:
    return {
        "id": row.id,
        "date": format_violation_date(row.violation_date),
        "employeeName": row.employee_name,
        "recordedBy": row.recorded_by,
        "groupName": row.group_name,
        "violationType": row.violation_type,
        "penaltyKind": row.penalty_kind,
        "penaltyLabel": "Штраф" if row.penalty_kind == "fine" else "Предупреждение",
        "hasExplanation": row.has_explanation,
        "fineAmount": row.fine_amount,
        "comment": row.comment,
    }


def _seed_recorded_by_names() -> list[str]:
    if not _SEED_FILE.is_file():
        return []
    import json

    payload = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    names = payload.get("recordedByNames") or []
    return sorted({str(n).strip() for n in names if n and str(n).strip()}, key=str.lower)


class ViolationEntryBody(BaseModel):
    date: str
    employeeName: str
    recordedBy: str
    groupName: str
    violationType: str
    penaltyKind: str = Field(pattern="^(warning|fine)$")
    hasExplanation: bool = False
    fineAmount: float = 0
    comment: str = ""


class ViolationTypeCreate(BaseModel):
    name: str
    fineAmount: float = 750.0


class BulkDeleteBody(BaseModel):
    ids: list[int]


def _validate_entry_body(body: ViolationEntryBody) -> tuple:
    vdate = parse_violation_date(body.date)
    if not vdate:
        raise HTTPException(status_code=400, detail="Укажите дату в формате ДД.ММ.ГГГГ")
    if not body.employeeName.strip():
        raise HTTPException(status_code=400, detail="Укажите Ф.И.О.")
    if not body.recordedBy.strip():
        raise HTTPException(status_code=400, detail="Укажите, кто зафиксировал")
    if not body.groupName.strip():
        raise HTTPException(status_code=400, detail="Укажите группу")
    if not body.violationType.strip():
        raise HTTPException(status_code=400, detail="Укажите тип нарушения")
    fine = float(body.fineAmount) if body.penaltyKind == "fine" else 0.0
    return vdate, fine


def _apply_body(row: ViolationJournalEntry, body: ViolationEntryBody, vdate, fine: float) -> None:
    row.violation_date = vdate
    row.employee_name = body.employeeName.strip()
    row.recorded_by = body.recordedBy.strip()
    row.group_name = body.groupName.strip()
    row.violation_type = body.violationType.strip()
    row.penalty_kind = body.penaltyKind
    row.has_explanation = body.hasExplanation
    row.fine_amount = fine
    row.comment = body.comment.strip()


@router.get("/meta")
async def violation_journal_meta(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    types = (
        await session.execute(
            select(ViolationTypePrice).order_by(ViolationTypePrice.sort_order.asc(), ViolationTypePrice.name.asc())
        )
    ).scalars().all()
    employees = (await session.execute(select(KcEmployee.full_name).order_by(KcEmployee.full_name.asc()))).scalars().all()
    employee_names = sorted({n.strip() for n in employees if n and n.strip()}, key=str.lower)

    recorded_db = (
        await session.execute(
            select(ViolationJournalEntry.recorded_by).distinct().order_by(ViolationJournalEntry.recorded_by.asc())
        )
    ).scalars().all()
    recorded_hints = sorted(
        {*(_seed_recorded_by_names()), *(r.strip() for r in recorded_db if r and r.strip())},
        key=str.lower,
    )

    groups = (
        await session.execute(
            select(ViolationJournalEntry.group_name).distinct().order_by(ViolationJournalEntry.group_name.asc())
        )
    ).scalars().all()
    group_hints = sorted({g.strip() for g in groups if g and g.strip()}, key=str.lower)

    return {
        "violationTypes": [{"name": t.name, "fineAmount": t.fine_amount} for t in types],
        "employeeNames": employee_names,
        "recordedByHints": recorded_hints,
        "groupHints": group_hints,
    }


@router.get("/export")
async def export_violation_entries(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    month: str = Query(""),
) -> Response:
    _require_supervisor_or_superadmin(identity)
    stmt = select(ViolationJournalEntry).order_by(
        ViolationJournalEntry.violation_date.desc(),
        ViolationJournalEntry.id.desc(),
    )
    parsed_month = parse_month_key(month) if month.strip() else None
    if parsed_month:
        y, m = parsed_month
        stmt = stmt.where(
            extract("year", ViolationJournalEntry.violation_date) == y,
            extract("month", ViolationJournalEntry.violation_date) == m,
        )
    rows = (await session.execute(stmt)).scalars().all()
    payload = [_entry_dict(r) for r in rows]
    try:
        data = build_violation_xlsx(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="openpyxl не установлен на сервере") from exc
    suffix = month.replace("-", "") if month.strip() else "all"
    filename = f"zhurnal-narushenij-{suffix}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_violation_entries(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    file: UploadFile = File(...),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Укажите файл")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пуст")
    name = file.filename.lower()
    if not (name.endswith(".xlsx") or name.endswith(".xlsm") or name.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Допустим формат Excel (.xlsx, .xlsm)")

    try:
        parsed_rows = parse_violation_xlsx(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {exc}") from exc

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="В файле нет строк с данными")

    imported = 0
    skipped = 0
    for raw in parsed_rows:
        body = ViolationEntryBody(
            date=raw["date"],
            employeeName=raw["employeeName"],
            recordedBy=raw["recordedBy"] or "—",
            groupName=raw["groupName"] or "—",
            violationType=raw["violationType"] or "—",
            penaltyKind=raw["penaltyKind"],
            hasExplanation=raw["hasExplanation"],
            fineAmount=raw["fineAmount"],
            comment=raw["comment"],
        )
        try:
            vdate, fine = _validate_entry_body(body)
        except HTTPException:
            skipped += 1
            continue
        row = ViolationJournalEntry()
        _apply_body(row, body, vdate, fine)
        session.add(row)
        imported += 1

    await session.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "message": f"Загружено записей: {imported}" + (f", пропущено: {skipped}" if skipped else ""),
    }


@router.get("/entries")
async def list_violation_entries(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    month: str = Query(""),
    employee: str = Query(""),
    violationType: str = Query(""),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    stmt = select(ViolationJournalEntry).order_by(
        ViolationJournalEntry.violation_date.desc(),
        ViolationJournalEntry.id.desc(),
    )
    parsed_month = parse_month_key(month) if month.strip() else None
    if parsed_month:
        y, m = parsed_month
        stmt = stmt.where(
            extract("year", ViolationJournalEntry.violation_date) == y,
            extract("month", ViolationJournalEntry.violation_date) == m,
        )
    if employee.strip():
        stmt = stmt.where(ViolationJournalEntry.employee_name == employee.strip())
    if violationType.strip():
        stmt = stmt.where(ViolationJournalEntry.violation_type == violationType.strip())
    rows = (await session.execute(stmt)).scalars().all()
    return {"entries": [_entry_dict(r) for r in rows]}


@router.post("/entries")
async def create_violation_entry(
    body: ViolationEntryBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    vdate, fine = _validate_entry_body(body)
    row = ViolationJournalEntry()
    _apply_body(row, body, vdate, fine)
    row.recorded_by_email = identity.email.strip().lower()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _entry_dict(row)


@router.put("/entries/{entry_id}")
async def update_violation_entry(
    entry_id: int,
    body: ViolationEntryBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    row = await session.get(ViolationJournalEntry, entry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    vdate, fine = _validate_entry_body(body)
    _apply_body(row, body, vdate, fine)
    if not (row.recorded_by_email or "").strip():
        row.recorded_by_email = identity.email.strip().lower()
    await session.commit()
    await session.refresh(row)
    return _entry_dict(row)


@router.delete("/entries/{entry_id}")
async def delete_violation_entry(
    entry_id: int,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    row = await session.get(ViolationJournalEntry, entry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    await session.delete(row)
    await session.commit()
    return {"ok": True}


@router.post("/entries/bulk-delete")
async def bulk_delete_violation_entries(
    body: BulkDeleteBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    if not body.ids:
        return {"deleted": 0}
    rows = (
        await session.execute(select(ViolationJournalEntry).where(ViolationJournalEntry.id.in_(body.ids)))
    ).scalars().all()
    for row in rows:
        await session.delete(row)
    await session.commit()
    return {"deleted": len(rows)}


@router.post("/violation-types")
async def create_violation_type(
    body: ViolationTypeCreate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название типа")
    existing = (
        await session.execute(select(ViolationTypePrice).where(ViolationTypePrice.name == name))
    ).scalar_one_or_none()
    if existing:
        return {"name": existing.name, "fineAmount": existing.fine_amount}
    max_order = (
        await session.execute(select(func.max(ViolationTypePrice.sort_order)))
    ).scalar_one_or_none()
    row = ViolationTypePrice(
        name=name,
        fine_amount=float(body.fineAmount),
        sort_order=int(max_order or 0) + 10,
    )
    session.add(row)
    await session.commit()
    return {"name": row.name, "fineAmount": row.fine_amount}


@router.get("/stats")
async def violation_journal_stats(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    month: str = Query(""),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    stmt = select(ViolationJournalEntry)
    parsed_month = parse_month_key(month) if month.strip() else None
    if parsed_month:
        y, m = parsed_month
        stmt = stmt.where(
            extract("year", ViolationJournalEntry.violation_date) == y,
            extract("month", ViolationJournalEntry.violation_date) == m,
        )
    rows = (await session.execute(stmt)).scalars().all()

    by_employee: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for r in rows:
        emp = r.employee_name.strip() or "—"
        by_employee[emp] = by_employee.get(emp, 0) + 1
        vt = r.violation_type.strip() or "—"
        by_type[vt] = by_type.get(vt, 0) + 1

    employees = [
        {"name": name, "count": count}
        for name, count in sorted(by_employee.items(), key=lambda x: (-x[1], x[0].lower()))
    ]
    violation_types = [
        {"name": name, "count": count}
        for name, count in sorted(by_type.items(), key=lambda x: (-x[1], x[0].lower()))
    ]
    return {"month": month, "employees": employees, "violationTypes": violation_types}


@router.get("/dynamics")
async def violation_journal_dynamics(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    view: str = Query("employees", pattern="^(employees|types)$"),
    top: int = Query(50, ge=1, le=50),
) -> dict:
    _require_supervisor_or_superadmin(identity)
    rows = (await session.execute(select(ViolationJournalEntry))).scalars().all()
    if not rows:
        return {"view": view, "months": [], "series": []}

    month_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    totals: dict[str, int] = defaultdict(int)

    for r in rows:
        mk = month_key(r.violation_date)
        key = r.employee_name.strip() if view == "employees" else r.violation_type.strip()
        if not key:
            key = "—"
        month_counts[mk][key] += 1
        totals[key] += 1

    months = sorted(month_counts.keys())
    top_keys = [k for k, _ in sorted(totals.items(), key=lambda x: (-x[1], x[0].lower()))[:top]]

    series = []
    for key in top_keys:
        monthly = [month_counts[m].get(key, 0) for m in months]
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
                "total": totals[key],
                "deltaPercent": delta_percent,
            }
        )

    return {"view": view, "months": months, "series": series}
