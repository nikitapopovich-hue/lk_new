from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.domain.notification_state import (
    REMOTE_WORK_NOTIFICATION_ID,
    ack_notification_id,
    dismiss_notifications,
    dismissed_notification_ids,
    ensure_utc,
    list_supervisor_fine_acknowledgments,
    mark_notification_read,
    parse_fine_notification_id,
    read_notification_ids,
    record_fine_acknowledgment,
)
from app.domain.remote_work import DEFAULT_DEPARTMENT, current_month_key, needs_remote_work_actualization
from app.domain.finance_notifications import (
    finance_notification_body,
    finance_notification_title,
    list_operator_finance_notifications,
)
from app.domain.violation_notifications import fine_notification_body, list_operator_fine_notifications
from app.infra.models import EmployeeProfile, ViolationFineAcknowledgment

router = APIRouter()


class NotificationItem(BaseModel):
    id: str
    title: str
    body: str
    detailBody: str | None = None
    createdAt: str
    read: bool = False


class MarkReadBody(BaseModel):
    id: str = Field(min_length=1)


class DeleteNotificationsBody(BaseModel):
    ids: list[str] = Field(min_length=1)


async def _get_or_create_profile(session: AsyncSession, identity: Identity) -> EmployeeProfile:
    row = (
        await session.execute(select(EmployeeProfile).where(EmployeeProfile.email == identity.email))
    ).scalar_one_or_none()
    if not row:
        row = EmployeeProfile(email=identity.email, department=DEFAULT_DEPARTMENT)
        session.add(row)
        await session.flush()
    return row


def _supervisor_ack_short_body(operator_name: str) -> str:
    name = operator_name.strip() or "Сотрудник"
    return f"{name} ознакомился со штрафом."


def _supervisor_ack_detail_body(
    ack: ViolationFineAcknowledgment,
    entry,
) -> str:
    lines = [
        f"Сотрудник: {ack.operator_display_name.strip() or entry.employee_name.strip() or '—'}",
        f"Ознакомился: {ensure_utc(ack.acknowledged_at).strftime('%d.%m.%Y %H:%M')}",
        "",
        "Штраф:",
        fine_notification_body(entry),
    ]
    return "\n".join(lines)


async def _build_notification_items(
    identity: Identity,
    session: AsyncSession,
) -> list[NotificationItem]:
    items: list[NotificationItem] = []
    now = datetime.now(timezone.utc)
    month_key = current_month_key(now)
    user_key = identity.email.strip().lower()
    read_ids = await read_notification_ids(session, user_key)

    role = identity.preferred_role
    if role in ("operator", "supervisor", "superadmin"):
        profile = await _get_or_create_profile(session, identity)

        if role == "operator" and needs_remote_work_actualization(profile, now=now):
            if (profile.remote_work_reminder_month or "") != month_key:
                items.append(
                    NotificationItem(
                        id=REMOTE_WORK_NOTIFICATION_ID,
                        title="Актуализируйте данные удалённой работы",
                        body=(
                            "Раз в месяц проверьте и обновите анкету в разделе «Профиль» "
                            "→ «Удалённая работа»."
                        ),
                        createdAt=now.isoformat(),
                        read=REMOTE_WORK_NOTIFICATION_ID in read_ids,
                    )
                )
                profile.remote_work_reminder_month = month_key
                await session.commit()

        if role == "operator":
            fines = await list_operator_fine_notifications(session, identity, profile)
            for entry in fines:
                nid = f"violation-fine-{entry.id}"
                items.append(
                    NotificationItem(
                        id=nid,
                        title="Штраф",
                        body=fine_notification_body(entry),
                        createdAt=ensure_utc(entry.created_at).isoformat(),
                        read=nid in read_ids,
                    )
                )

            for entry_type in ("overtime", "bonus", "recalculation"):
                finance_rows = await list_operator_finance_notifications(session, identity, profile, entry_type)
                for entry in finance_rows:
                    nid = f"finance-{entry.entry_type}-{entry.id}"
                    items.append(
                        NotificationItem(
                            id=nid,
                            title=finance_notification_title(entry),
                            body=finance_notification_body(entry),
                            createdAt=ensure_utc(entry.created_at).isoformat(),
                            read=nid in read_ids,
                        )
                    )

        if role in ("supervisor", "superadmin"):
            acks = await list_supervisor_fine_acknowledgments(session, identity, profile)
            for ack, entry in acks:
                nid = ack_notification_id(ack.id)
                op_name = ack.operator_display_name.strip() or entry.employee_name.strip()
                items.append(
                    NotificationItem(
                        id=nid,
                        title="Ознакомление со штрафом",
                        body=_supervisor_ack_short_body(op_name),
                        detailBody=_supervisor_ack_detail_body(ack, entry),
                        createdAt=ensure_utc(ack.acknowledged_at).isoformat(),
                        read=nid in read_ids,
                    )
                )

    items.sort(key=lambda i: i.createdAt, reverse=True)
    return items


@router.get("")
async def list_notifications(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user_key = identity.email.strip().lower()
    dismissed = await dismissed_notification_ids(session, user_key)
    items = [i for i in await _build_notification_items(identity, session) if i.id not in dismissed]
    return {"items": [i.model_dump() for i in items], "total": len(items)}


@router.post("/read")
async def mark_read(
    body: MarkReadBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user_key = identity.email.strip().lower()
    nid = body.id.strip()
    await mark_notification_read(session, user_key, nid)

    if identity.preferred_role == "operator" and nid.startswith("violation-fine-"):
        entry_id = parse_fine_notification_id(nid)
        if entry_id is not None:
            profile = await _get_or_create_profile(session, identity)
            await record_fine_acknowledgment(session, identity, profile, entry_id)

    await session.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user_key = identity.email.strip().lower()
    dismissed = await dismissed_notification_ids(session, user_key)
    profile = await _get_or_create_profile(session, identity)
    read_ids = await read_notification_ids(session, user_key)

    marked = 0
    for item in await _build_notification_items(identity, session):
        if item.id in dismissed or item.read or item.id in read_ids:
            continue
        await mark_notification_read(session, user_key, item.id)
        if identity.preferred_role == "operator" and item.id.startswith("violation-fine-"):
            entry_id = parse_fine_notification_id(item.id)
            if entry_id is not None:
                await record_fine_acknowledgment(session, identity, profile, entry_id)
        marked += 1

    await session.commit()
    return {"ok": True, "marked": marked}


@router.post("/archive/delete")
async def delete_archived_notifications(
    body: DeleteNotificationsBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user_key = identity.email.strip().lower()
    deleted = await dismiss_notifications(session, user_key, body.ids, require_read=True)
    if deleted == 0 and body.ids:
        raise HTTPException(
            status_code=400,
            detail="Удалить можно только прочитанные оповещения из архива",
        )
    await session.commit()
    return {"ok": True, "deleted": deleted}


@router.post("/archive/delete-all")
async def delete_all_archived_notifications(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    user_key = identity.email.strip().lower()
    dismissed = await dismissed_notification_ids(session, user_key)
    read_ids = await read_notification_ids(session, user_key)
    to_delete = [nid for nid in read_ids if nid not in dismissed]
    deleted = await dismiss_notifications(session, user_key, to_delete, require_read=False)
    await session.commit()
    return {"ok": True, "deleted": deleted}
