from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.identity import Identity, user_face_name
from app.domain.violation_journal import format_violation_date
from app.infra.models import EmployeeProfile, KcEmployee, ViolationJournalEntry

_TOKEN_RE = re.compile(r"\s+")


def _normalize_name(value: str) -> str:
    return _TOKEN_RE.sub(" ", (value or "").strip().lower())


def _name_tokens(value: str) -> frozenset[str]:
    return frozenset(_normalize_name(value).split())


def names_match(left: str, right: str) -> bool:
    a = _normalize_name(left)
    b = _normalize_name(right)
    if not a or not b:
        return False
    if a == b:
        return True
    ta, tb = _name_tokens(left), _name_tokens(right)
    if len(ta) >= 2 and len(tb) >= 2 and ta == tb:
        return True
    return a in b or b in a


async def operator_name_candidates(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
) -> set[str]:
    out: set[str] = set()
    for raw in (
        user_face_name(identity),
        identity.name,
        profile.full_name,
        identity.mapping.display_name if identity.mapping else "",
    ):
        name = (raw or "").strip()
        if name:
            out.add(name)

    email_key = identity.email.strip().lower()
    if email_key:
        kc_name = (
            await session.execute(
                select(KcEmployee.full_name).where(func.lower(KcEmployee.email_new) == email_key)
            )
        ).scalar_one_or_none()
        if kc_name and kc_name.strip():
            out.add(kc_name.strip())

    return out


def fine_notification_body(entry: ViolationJournalEntry) -> str:
    lines = [
        f"Дата: {format_violation_date(entry.violation_date)}",
        f"Тип нарушения: {entry.violation_type.strip() or '—'}",
        f"Группа: {entry.group_name.strip() or '—'}",
        f"Сумма штрафа: {int(entry.fine_amount) if entry.fine_amount == int(entry.fine_amount) else entry.fine_amount} ₽",
        f"Зафиксировал: {entry.recorded_by.strip() or '—'}",
    ]
    if entry.has_explanation:
        lines.append("Объяснительная: да")
    comment = (entry.comment or "").strip()
    if comment:
        lines.append(f"Комментарий: {comment}")
    return "\n".join(lines)


async def list_operator_fine_notifications(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
) -> list[ViolationJournalEntry]:
    if not profile.subscribe_all or not profile.subscribe_new_fines:
        return []

    candidates = await operator_name_candidates(session, identity, profile)
    if not candidates:
        return []

    rows = (
        await session.execute(
            select(ViolationJournalEntry)
            .where(ViolationJournalEntry.penalty_kind == "fine")
            .order_by(ViolationJournalEntry.violation_date.desc(), ViolationJournalEntry.id.desc())
        )
    ).scalars().all()

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    matched: list[ViolationJournalEntry] = []
    for row in rows:
        created = row.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created < cutoff:
                continue
        employee = row.employee_name.strip()
        if any(names_match(employee, name) for name in candidates):
            matched.append(row)
    return matched
