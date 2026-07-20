from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.violation_journal import parse_violation_date
from app.infra.models import ViolationJournalEntry, ViolationTypePrice

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "violation_journal_seed.json"


def _load_seed_payload() -> dict | None:
    if not _DATA_FILE.is_file():
        return None
    return json.loads(_DATA_FILE.read_text(encoding="utf-8"))


async def seed_violation_types_if_empty(session: AsyncSession) -> None:
    existing = (await session.execute(select(ViolationTypePrice.id).limit(1))).scalar_one_or_none()
    if existing is not None:
        return
    payload = _load_seed_payload()
    types: dict[str, float] = {}
    if payload and isinstance(payload.get("violationTypes"), dict):
        types = {k: float(v) for k, v in payload["violationTypes"].items() if k and float(v) >= 500}
    if not types:
        types = {"Опоздание": 750.0, "Чат": 1500.0}
    for i, (name, amount) in enumerate(sorted(types.items(), key=lambda x: x[0].lower())):
        session.add(ViolationTypePrice(name=name, fine_amount=amount, sort_order=i * 10))
    await session.commit()


async def seed_violation_entries_if_empty(session: AsyncSession) -> None:
    count = (await session.execute(select(func.count()).select_from(ViolationJournalEntry))).scalar_one()
    if count and int(count) > 0:
        return
    payload = _load_seed_payload()
    if not payload or not isinstance(payload.get("entries"), list):
        return
    for row in payload["entries"]:
        if not isinstance(row, dict):
            continue
        vdate = parse_violation_date(str(row.get("date", "")))
        if not vdate:
            continue
        employee = str(row.get("employeeName", "")).strip()
        if not employee:
            continue
        penalty_kind = str(row.get("penaltyKind", "warning"))
        if penalty_kind not in ("warning", "fine"):
            penalty_kind = "warning"
        fine = float(row.get("fineAmount") or 0) if penalty_kind == "fine" else 0.0
        session.add(
            ViolationJournalEntry(
                violation_date=vdate,
                employee_name=employee,
                recorded_by=str(row.get("recordedBy", "")).strip(),
                group_name=str(row.get("groupName", "")).strip(),
                violation_type=str(row.get("violationType", "")).strip(),
                penalty_kind=penalty_kind,
                has_explanation=bool(row.get("hasExplanation")),
                fine_amount=fine,
                comment=str(row.get("comment", "")).strip(),
            )
        )
    await session.commit()
