from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.identity import Identity, user_face_name
from app.domain.violation_notifications import names_match, operator_name_candidates
from app.infra.models import (
    EmployeeProfile,
    NotificationDismissed,
    NotificationRead,
    ViolationFineAcknowledgment,
    ViolationJournalEntry,
)

FINE_NOTIFICATION_PREFIX = "violation-fine-"
FINE_ACK_NOTIFICATION_PREFIX = "fine-ack-"
REMOTE_WORK_NOTIFICATION_ID = "remote-work-monthly"


async def read_notification_ids(session: AsyncSession, user_email: str) -> set[str]:
    rows = (
        await session.execute(
            select(NotificationRead.notification_id).where(
                NotificationRead.user_email == user_email.strip().lower()
            )
        )
    ).scalars().all()
    return set(rows)


async def dismissed_notification_ids(session: AsyncSession, user_email: str) -> set[str]:
    rows = (
        await session.execute(
            select(NotificationDismissed.notification_id).where(
                NotificationDismissed.user_email == user_email.strip().lower()
            )
        )
    ).scalars().all()
    return set(rows)


async def mark_notification_read(session: AsyncSession, user_email: str, notification_id: str) -> None:
    key = user_email.strip().lower()
    nid = notification_id.strip()
    if not nid:
        return
    existing = (
        await session.execute(
            select(NotificationRead).where(
                NotificationRead.user_email == key,
                NotificationRead.notification_id == nid,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return
    session.add(NotificationRead(user_email=key, notification_id=nid))


async def dismiss_notifications(
    session: AsyncSession,
    user_email: str,
    notification_ids: list[str],
    *,
    require_read: bool = True,
) -> int:
    key = user_email.strip().lower()
    read_ids = await read_notification_ids(session, key) if require_read else None
    dismissed = await dismissed_notification_ids(session, key)
    added = 0
    for raw in notification_ids:
        nid = raw.strip()
        if not nid or nid in dismissed:
            continue
        if require_read and read_ids is not None and nid not in read_ids:
            continue
        session.add(NotificationDismissed(user_email=key, notification_id=nid))
        dismissed.add(nid)
        added += 1
    return added


def parse_fine_notification_id(notification_id: str) -> int | None:
    if not notification_id.startswith(FINE_NOTIFICATION_PREFIX):
        return None
    raw = notification_id[len(FINE_NOTIFICATION_PREFIX) :]
    try:
        return int(raw)
    except ValueError:
        return None


async def record_fine_acknowledgment(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
    entry_id: int,
) -> ViolationFineAcknowledgment | None:
    entry = await session.get(ViolationJournalEntry, entry_id)
    if not entry or entry.penalty_kind != "fine":
        return None

    candidates = await operator_name_candidates(session, identity, profile)
    employee = entry.employee_name.strip()
    if not any(names_match(employee, name) for name in candidates):
        return None

    email_key = identity.email.strip().lower()
    existing = (
        await session.execute(
            select(ViolationFineAcknowledgment).where(
                ViolationFineAcknowledgment.violation_entry_id == entry_id,
                ViolationFineAcknowledgment.operator_email == email_key,
            )
        )
    ).scalar_one_or_none()
    supervisor_email = (entry.recorded_by_email or "").strip().lower()
    if existing:
        if supervisor_email and not (existing.supervisor_email or "").strip():
            existing.supervisor_email = supervisor_email
        return existing

    display = user_face_name(identity).strip() or profile.full_name.strip() or employee
    ack = ViolationFineAcknowledgment(
        violation_entry_id=entry_id,
        operator_email=email_key,
        operator_display_name=display,
        supervisor_email=supervisor_email,
    )
    session.add(ack)
    await session.flush()
    return ack


async def _supervisor_sees_ack(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
    ack: ViolationFineAcknowledgment,
    entry: ViolationJournalEntry,
) -> bool:
    if identity.preferred_role == "superadmin":
        return True

    user_key = identity.email.strip().lower()
    if not user_key:
        return False

    if ack.supervisor_email and ack.supervisor_email.strip().lower() == user_key:
        return True

    recorder_email = (entry.recorded_by_email or "").strip().lower()
    if recorder_email and recorder_email == user_key:
        return True

    candidates = await operator_name_candidates(session, identity, profile)
    if not candidates:
        return False

    recorder = entry.recorded_by.strip()
    return bool(recorder) and any(names_match(recorder, name) for name in candidates)


async def list_supervisor_fine_acknowledgments(
    session: AsyncSession,
    identity: Identity,
    profile: EmployeeProfile,
) -> list[tuple[ViolationFineAcknowledgment, ViolationJournalEntry]]:
    rows = (
        await session.execute(
            select(ViolationFineAcknowledgment, ViolationJournalEntry)
            .join(
                ViolationJournalEntry,
                ViolationJournalEntry.id == ViolationFineAcknowledgment.violation_entry_id,
            )
            .order_by(ViolationFineAcknowledgment.acknowledged_at.desc())
        )
    ).all()

    out: list[tuple[ViolationFineAcknowledgment, ViolationJournalEntry]] = []
    for ack, entry in rows:
        if await _supervisor_sees_ack(session, identity, profile, ack, entry):
            out.append((ack, entry))
    return out


def ack_notification_id(ack_id: int) -> str:
    return f"{FINE_ACK_NOTIFICATION_PREFIX}{ack_id}"


def ensure_utc(dt: datetime | None) -> datetime:
    now = datetime.now(timezone.utc)
    if dt is None:
        return now
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
