from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.identity import Identity
from app.domain.violation_journal import format_violation_date
from app.domain.violation_notifications import names_match, operator_name_candidates
from app.infra.models import EmployeeProfile, FinanceJournalEntry

_ENTRY_LABELS = {
    "overtime": "Переработка",
    "bonus": "Премия",
    "recalculation": "Перерасчёт",
}


def _subscribed(profile: EmployeeProfile, entry_type: str) -> bool:
    if not profile.subscribe_all:
        return False
    if entry_type == "overtime":
        return profile.subscribe_overtime
    if entry_type == "bonus":
        return profile.subscribe_bonuses
    if entry_type == "recalculation":
        return profile.subscribe_recalculations
    return False


def finance_notification_body(entry: FinanceJournalEntry) -> str:
    label = _ENTRY_LABELS.get(entry.entry_type, "Запись")
    lines = [
        f"Дата: {format_violation_date(entry.entry_date)}",
        f"Сотрудник: {entry.employee_name.strip() or '—'}",
    ]
    if entry.entry_type == "overtime" and entry.hours:
        hours = entry.hours
        hours_label = f"{int(hours) if hours == int(hours) else hours} ч."
        lines.append(f"Часы: {hours_label}")
    reason = (entry.reason or "").strip()
    if reason:
        lines.append(f"Причина: {reason}")
    amount = entry.amount
    amount_str = f"{int(amount) if amount == int(amount) else amount} ₽"
    lines.append(f"Сумма: {amount_str}")
    lines.append(f"Зафиксировал: {entry.recorded_by.strip() or '—'}")
    return "\n".join(lines)


def finance_notification_title(entry: FinanceJournalEntry) -> str:
    label = _ENTRY_LABELS.get(entry.entry_type, "Финансы")
    return f"Новая запись: {label}"


async def list_operator_finance_notifications(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
    entry_type: str,
) -> list[FinanceJournalEntry]:
    if not _subscribed(profile, entry_type):
        return []

    candidates = await operator_name_candidates(session, identity, profile)
    if not candidates:
        return []

    rows = (
        await session.execute(
            select(FinanceJournalEntry)
            .where(FinanceJournalEntry.entry_type == entry_type)
            .order_by(FinanceJournalEntry.entry_date.desc(), FinanceJournalEntry.id.desc())
        )
    ).scalars().all()

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    matched: list[FinanceJournalEntry] = []
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
