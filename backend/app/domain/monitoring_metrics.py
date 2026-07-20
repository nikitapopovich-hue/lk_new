from __future__ import annotations

import asyncio
import datetime as dt
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.monitoring.client import MonitoringClient, MonitoringUserMetrics
from app.infra.models import EmployeeMapping

_MSK = ZoneInfo("Europe/Moscow")
_USERNAME_INDEX_CACHE: dict[str, Any] = {"at": 0.0, "data": {}}
_OPERATOR_USER_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL_SECONDS = 600.0
_MAX_TEAM_HISTORY_USERS = 35


@dataclass(frozen=True)
class MonitoringAggregate:
    points: float
    grade: str
    members_with_data: int
    members_total: int


def calendar_month_slots_msk(*, limit: int = 12) -> list[tuple[int, int]]:
    """Текущий месяц первым, далее прошлые (по МСК)."""
    now = dt.datetime.now(_MSK)
    year = now.year
    month = now.month
    out: list[tuple[int, int]] = []
    for _ in range(max(1, limit)):
        out.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return out


def monitoring_month_to_dict(
    *,
    year: int,
    month: int,
    points: float | None,
    grade: str | None,
    members_with_data: int = 0,
    members_total: int = 0,
) -> dict[str, Any]:
    empty = points is None
    return {
        "year": year,
        "month": month,
        "points": round(points, 1) if points is not None else None,
        "grade": grade,
        "empty": empty,
        "membersWithData": members_with_data,
        "membersTotal": members_total,
    }


def monitoring_grade_from_points(points: float) -> str:
    if points >= 90:
        return "A+"
    if points >= 82:
        return "A"
    if points >= 74:
        return "B"
    if points >= 66:
        return "C"
    return "D"


async def _emails_for_backoffice_ids(
    session: AsyncSession,
    backoffice_ids: list[str],
) -> dict[str, str]:
    ids = {str(x).strip() for x in backoffice_ids if str(x).strip()}
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(EmployeeMapping).where(EmployeeMapping.backoffice_user_id.in_(ids))
        )
    ).scalars().all()
    out: dict[str, str] = {}
    for row in rows:
        bo = (row.backoffice_user_id or "").strip()
        email = (row.email or "").strip().lower()
        if bo and email:
            out[bo] = email
    return out


async def _resolve_monitoring_user_ids(
    *,
    client: MonitoringClient,
    session: AsyncSession,
    backoffice_member_ids: list[str],
) -> tuple[list[str], int]:
    emails_by_bo = await _emails_for_backoffice_ids(session, backoffice_member_ids)
    if not emails_by_bo:
        return [], 0

    username_to_id = await _username_index(client)
    monitoring_user_ids: list[str] = []
    for email in emails_by_bo.values():
        uid = username_to_id.get(email)
        if uid:
            monitoring_user_ids.append(uid)
    return monitoring_user_ids, len(emails_by_bo)


async def _username_index(client: MonitoringClient) -> dict[str, str]:
    now = time.monotonic()
    cached_at = float(_USERNAME_INDEX_CACHE.get("at") or 0.0)
    cached_data = _USERNAME_INDEX_CACHE.get("data")
    if isinstance(cached_data, dict) and now - cached_at < _CACHE_TTL_SECONDS:
        return cached_data

    users = await client.list_users(limit=500, include_deleted=False)
    out: dict[str, str] = {}
    for user in users:
        key = user.username.strip().lower()
        if key and key not in out:
            out[key] = user.user_id
    _USERNAME_INDEX_CACHE["at"] = now
    _USERNAME_INDEX_CACHE["data"] = out
    return out


async def _metrics_for_user_ids(
    client: MonitoringClient,
    *,
    user_ids: list[str],
    year: int,
    month: int,
    concurrency: int = 8,
) -> list[MonitoringUserMetrics]:
    unique_ids = [uid for uid in dict.fromkeys(user_ids) if uid]
    if not unique_ids:
        return []

    sem = asyncio.Semaphore(max(1, concurrency))
    results: list[MonitoringUserMetrics | None] = []

    async def one(uid: str) -> MonitoringUserMetrics | None:
        async with sem:
            return await client.user_metrics(user_id=uid, year=year, month=month)

    results = await asyncio.gather(*(one(uid) for uid in unique_ids))
    return [r for r in results if r is not None]


async def _history_for_user_ids(
    client: MonitoringClient,
    *,
    user_ids: list[str],
    limit: int = 12,
    concurrency: int = 8,
) -> list[list[dict[str, Any]]]:
    unique_ids = [uid for uid in dict.fromkeys(user_ids) if uid]
    if not unique_ids:
        return []

    sem = asyncio.Semaphore(max(1, concurrency))

    async def one(uid: str) -> list[dict[str, Any]]:
        async with sem:
            return await client.user_history(user_id=uid, limit=limit)

    return await asyncio.gather(*(one(uid) for uid in unique_ids))


async def fetch_team_monitoring_months(
    *,
    client: MonitoringClient,
    session: AsyncSession,
    backoffice_member_ids: list[str],
    limit: int = 12,
) -> list[dict[str, Any]]:
    """
    Средний мониторинг по выбранным сотрудникам (команда или все) за последние месяцы.
    Учитываются только сотрудники с маппингом и аккаунтом в портале мониторинга.
    """
    monitoring_user_ids, members_total = await _resolve_monitoring_user_ids(
        client=client,
        session=session,
        backoffice_member_ids=backoffice_member_ids,
    )
    if len(monitoring_user_ids) > _MAX_TEAM_HISTORY_USERS:
        monitoring_user_ids = monitoring_user_ids[:_MAX_TEAM_HISTORY_USERS]
    slots = calendar_month_slots_msk(limit=limit)
    if not monitoring_user_ids:
        return [
            monitoring_month_to_dict(
                year=year,
                month=month,
                points=None,
                grade=None,
                members_with_data=0,
                members_total=members_total,
            )
            for year, month in slots
        ]

    histories = await _history_for_user_ids(client, user_ids=monitoring_user_ids, limit=limit)
    buckets: dict[tuple[int, int], list[float]] = defaultdict(list)
    for months in histories:
        for entry in months:
            year = entry.get("year")
            month = entry.get("month")
            score = entry.get("score_final")
            if year is None or month is None or score is None:
                continue
            try:
                buckets[(int(year), int(month))].append(float(score))
            except (TypeError, ValueError):
                continue

    out: list[dict[str, Any]] = []
    for year, month in slots:
        scores = buckets.get((year, month))
        if not scores:
            out.append(
                monitoring_month_to_dict(
                    year=year,
                    month=month,
                    points=None,
                    grade=None,
                    members_with_data=0,
                    members_total=members_total,
                )
            )
            continue
        points = round(sum(scores) / len(scores), 1)
        out.append(
            monitoring_month_to_dict(
                year=year,
                month=month,
                points=points,
                grade=monitoring_grade_from_points(points),
                members_with_data=len(scores),
                members_total=members_total,
            )
        )
    return out


async def fetch_team_monitoring_aggregate(
    *,
    client: MonitoringClient,
    session: AsyncSession,
    backoffice_member_ids: list[str],
    year: int,
    month: int,
) -> MonitoringAggregate | None:
    months = await fetch_team_monitoring_months(
        client=client,
        session=session,
        backoffice_member_ids=backoffice_member_ids,
        limit=12,
    )
    for entry in months:
        if entry.get("year") == year and entry.get("month") == month and not entry.get("empty"):
            return MonitoringAggregate(
                points=float(entry["points"]),
                grade=str(entry.get("grade") or monitoring_grade_from_points(float(entry["points"]))),
                members_with_data=int(entry.get("membersWithData") or 0),
                members_total=int(entry.get("membersTotal") or 0),
            )
    return None


async def _resolve_operator_monitoring_user_id(
    client: MonitoringClient,
    email: str,
) -> str | None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None

    now = time.monotonic()
    cached = _OPERATOR_USER_CACHE.get(normalized)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    users = await client.list_users(search=normalized, limit=20)
    resolved: str | None = None
    for user in users:
        if user.username.strip().lower() == normalized:
            resolved = user.user_id
            break
    if not resolved and users:
        resolved = users[0].user_id
    if resolved:
        _OPERATOR_USER_CACHE[normalized] = (now, resolved)
    return resolved


async def fetch_operator_monitoring_months(
    *,
    client: MonitoringClient,
    email: str,
    limit: int = 12,
) -> tuple[str | None, list[dict[str, Any]]]:
    monitoring_user_id = await _resolve_operator_monitoring_user_id(client, email)
    slots = calendar_month_slots_msk(limit=limit)
    if not monitoring_user_id:
        return None, [
            monitoring_month_to_dict(year=year, month=month, points=None, grade=None)
            for year, month in slots
        ]

    history = await client.user_history(user_id=monitoring_user_id, limit=limit)
    history_map: dict[tuple[int, int], dict[str, Any]] = {}
    for entry in history:
        year = entry.get("year")
        month = entry.get("month")
        if year is None or month is None:
            continue
        history_map[(int(year), int(month))] = entry

    out: list[dict[str, Any]] = []
    for year, month in slots:
        entry = history_map.get((year, month))
        score = entry.get("score_final") if entry else None
        if score is None:
            out.append(monitoring_month_to_dict(year=year, month=month, points=None, grade=None))
            continue
        points = round(float(score), 1)
        grade = str((entry or {}).get("category") or monitoring_grade_from_points(points))
        out.append(monitoring_month_to_dict(year=year, month=month, points=points, grade=grade))
    return monitoring_user_id, out


async def fetch_operator_monitoring(
    *,
    client: MonitoringClient,
    email: str,
    year: int,
    month: int,
) -> dict[str, Any] | None:
    monitoring_user_id = await _resolve_operator_monitoring_user_id(client, email)
    if not monitoring_user_id:
        return None

    metrics = await client.user_metrics(user_id=monitoring_user_id, year=year, month=month)
    if not metrics:
        return None

    return {
        "userId": metrics.user_id,
        "username": metrics.username,
        "displayName": metrics.display_name,
        "year": metrics.year,
        "month": metrics.month,
        "points": metrics.score_final,
        "scoreRaw": metrics.score_raw,
        "grade": metrics.category,
        "monitoringsCount": metrics.monitorings_count,
    }


def monitoring_client_from_settings(settings: Any) -> MonitoringClient | None:
    token = (getattr(settings, "monitoring_api_token", None) or "").strip()
    base_url = str(getattr(settings, "monitoring_api_base_url", "") or "").strip()
    if not token or not base_url:
        return None
    return MonitoringClient(
        base_url=base_url,
        api_token=token,
        timeout_seconds=float(getattr(settings, "monitoring_timeout_seconds", 30.0)),
    )
