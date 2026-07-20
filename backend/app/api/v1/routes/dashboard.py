from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.core.config import Settings, get_settings
from app.integrations.backoffice.client import BackofficeAuth, BackofficeClient
from app.integrations.uis.client import UisAuth, UisDataApiClient
from app.domain.monitoring_metrics import (
    fetch_operator_monitoring_months,
    fetch_team_monitoring_months,
    monitoring_client_from_settings,
)
from app.domain.team_operator_dashboard import build_team_operator_overview
from app.infra.models import EmployeeMapping

router = APIRouter()


class Period(BaseModel):
    from_: datetime = Field(alias="from")
    to: datetime
    tz: str = "Europe/Moscow"


class DashboardSummaryRequest(BaseModel):
    period: Period
    scope: str = "self"
    filters: dict = Field(default_factory=dict)
    """Упрощённый расчёт KPI для дашборда руководителя (без тяжёлых проверок Backoffice/UIS)."""
    light: bool = False


@router.post("/summary")
async def dashboard_summary(
    body: DashboardSummaryRequest,
    settings: Settings = Depends(get_settings),
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    scope = body.scope
    light = body.light
    if identity.preferred_role == "superadmin" and scope != "team":
        scope = "all"

    # Пока делаем "проводку": проверяем доступность Backoffice и возвращаем демо-структуру,
    # чтобы фронт уже мог собирать Bento-карточки.
    client = BackofficeClient(
        base_url=str(settings.backoffice_base_url),
        auth=BackofficeAuth(
            login=settings.backoffice_login,
            fsid=settings.backoffice_fsid,
            user_id=settings.backoffice_user_id,
            user_lang=settings.backoffice_user_lang,
        ),
        timeout_seconds=settings.backoffice_timeout_seconds,
    )

    backoffice_info = None
    tickets_kpis: dict[str, int] | None = None
    if settings.backoffice_login and settings.backoffice_fsid and settings.backoffice_user_id:
        async def _load_backoffice_block() -> None:
            nonlocal backoffice_info, tickets_kpis
            period_from_ms = int(body.period.from_.timestamp() * 1000)
            period_to_ms = int(body.period.to.timestamp() * 1000)

            def _ticket_matches_scope(*, allowed: set[str], assignee: object, last_message_user: object) -> bool:
                if not allowed:
                    return True
                au = assignee
                lu = last_message_user
                if au is not None and str(au) in allowed:
                    return True
                # В Backoffice часто `user` (исполнитель) пустой, но есть `lastMessageUser`.
                if lu is not None and str(lu) in allowed:
                    return True
                return False

            internal_theme_ids: set[str] | None = None
            raw_theme_ids = body.filters.get("backofficeInternalThemeIds")
            if isinstance(raw_theme_ids, list):
                internal_theme_ids = {str(x) for x in raw_theme_ids if str(x)}

            if light:
                backoffice_info = {"ok": True, "light": True}
            else:
                res_users = await client.get_objects_from_version_packets(
                    packets=[{"className": "Users.User", "fromVersion": "0", "maxCount": 1}],
                )
                backoffice_info = {"ok": True, "usersSampleKeys": list(res_users.keys())[:10]}
            backoffice_info["appliedInternalThemeIds"] = sorted(list(internal_theme_ids or []))

            # 2) Если передали фильтр таблицы тикетов — сохраним его в userSettings,
            # чтобы последующие запросы в Backoffice применяли те же условия.
            # Пример namespace из вашего сообщения:
            # ClientSupport.ClientSupportManager.TicketsTableFilters
            tickets_filter_ns = body.filters.get("tickets_filter_namespace")
            tickets_filter_value = body.filters.get("tickets_filter_value")
            if tickets_filter_ns and isinstance(tickets_filter_value, dict):
                await client.user_settings_set(name_space=str(tickets_filter_ns), value=tickets_filter_value)

            # 3) Первый полезный KPI по тикетам (Fon.ClientSupport.Ticket)
            # ticketStates по вашему контракту:
            # 1 - неотвеченный, 2 - отвеченный, 3 - в обработке, 4 - закрыт, 5 - редактируется
            ticket_states = body.filters.get("ticketStates")
            if not isinstance(ticket_states, list) or not all(isinstance(x, int) for x in ticket_states):
                ticket_states = [1, 2, 3, 4, 5]

            async def _fetch_all_tickets(*, states: list[int]) -> list[dict]:
                """
                Backoffice возвращает version packets (hasMoreData + version).
                Чтобы числа совпадали с UI, нужно вычитать все пакеты.
                """
                out: list[dict] = []
                from_version = "0"
                safety_pages = 0
                while True:
                    safety_pages += 1
                    if light:
                        max_pages = 3 if scope == "all" else 6
                    else:
                        max_pages = 5 if scope == "all" else 12
                    if safety_pages > max_pages:
                        break
                    res = await client.get_tickets_from_version(
                        from_version=from_version,
                        max_count=5000,
                        ticket_states=states,
                    )
                    resp = res.get("response") or {}
                    chunk = resp.get("list") or []
                    if chunk:
                        out.extend(chunk)
                    has_more = bool(resp.get("hasMoreData"))
                    next_version = resp.get("version")
                    if not has_more:
                        break
                    if not next_version:
                        break
                    from_version = str(next_version)
                return out

            backoffice_user_id = (identity.mapping.backoffice_user_id if identity.mapping else "") or ""
            team_member_ids: set[str] | None = None
            if scope == "self" and backoffice_user_id:
                allowed = {backoffice_user_id}
            elif scope == "team":
                ids = body.filters.get("teamMemberIds")
                if isinstance(ids, list):
                    team_member_ids = {str(x) for x in ids if str(x)}
                allowed = team_member_ids or set()
            else:
                allowed = set()

            lst = await _fetch_all_tickets(states=ticket_states)

            if light:
                tickets_total = 0
                for item in lst:
                    obj = item.get("object") or {}
                    if internal_theme_ids is not None:
                        theme = obj.get("internalTheme")
                        if theme is None or str(theme) not in internal_theme_ids:
                            continue
                    create_time = obj.get("createTime")
                    try:
                        create_time_ms = int(create_time)
                    except Exception:  # noqa: BLE001
                        continue
                    if create_time_ms < period_from_ms or create_time_ms > period_to_ms:
                        continue
                    if not _ticket_matches_scope(
                        allowed=allowed,
                        assignee=obj.get("user"),
                        last_message_user=obj.get("lastMessageUser"),
                    ):
                        continue
                    tickets_total += 1
                tickets_kpis = {
                    "tickets_total": tickets_total,
                    "tickets_unanswered": None,
                    "tickets_answered": None,
                    "tickets_in_progress": None,
                    "tickets_closed": None,
                    "tickets_editing": None,
                    "period_from_ms": period_from_ms,
                    "period_to_ms": period_to_ms,
                }
                backoffice_info["ticketsLightNote"] = (
                    "light=true: только tickets_total за период, без разбивки по статусам"
                )
                return

            # В Backoffice "Неотвеч." в UI может не совпадать с простым подсчетом state==1 из общей выборки,
            # поэтому вытаскиваем его отдельным запросом (как это обычно делает UI-фильтр по статусу).
            lst_unanswered = await _fetch_all_tickets(states=[1])

            states = []
            states_hist: dict[int, int] = {}
            unanswered_ticket_ids: list[str] = []
            for item in lst:
                obj = item.get("object") or {}
                if internal_theme_ids is not None:
                    theme = obj.get("internalTheme")
                    if theme is None or str(theme) not in internal_theme_ids:
                        continue
                # фильтр по периоду (createTime в UNIX ms)
                create_time = obj.get("createTime")
                try:
                    create_time_ms = int(create_time)
                except Exception:  # noqa: BLE001
                    continue
                if create_time_ms < period_from_ms or create_time_ms > period_to_ms:
                    continue

                if not _ticket_matches_scope(
                    allowed=allowed,
                    assignee=obj.get("user"),
                    last_message_user=obj.get("lastMessageUser"),
                ):
                    continue

                raw_state = obj.get("state")
                try:
                    state = int(raw_state)
                except Exception:  # noqa: BLE001
                    continue
                states.append(state)
                states_hist[state] = states_hist.get(state, 0) + 1
                if state == 1:
                    tid = str(item.get("id") or "")
                    if tid:
                        unanswered_ticket_ids.append(tid)

            def _count(v: int) -> int:
                return sum(1 for s in states if s == v)

            def _as_int(v: object) -> int | None:
                try:
                    if v is None:
                        return None
                    return int(v)  # type: ignore[arg-type]
                except Exception:  # noqa: BLE001
                    return None

            async def _is_editing_by_events(ticket_id: str) -> bool:
                """
                Backoffice "Редактируется" (как в UI) по событиям:
                - на создании (eventKind=1) ticketAfter.state=5
                - и нет события публикации (eventKind=2) после создания
                """
                ev = await client.get_ticket_events_from_version(ticket_id=ticket_id, from_version="0", max_count=200)
                evl = ((ev.get("response") or {}).get("list") or [])
                created_time: int | None = None
                created_as_5 = False
                for it in evl:
                    o = it.get("object") or {}
                    if str(o.get("eventKind")) != "1":
                        continue
                    created_time = _as_int(o.get("eventTime"))
                    created_as_5 = _as_int((o.get("ticketAfter") or {}).get("state")) == 5
                    break
                if not created_as_5:
                    return False
                for it in evl:
                    o = it.get("object") or {}
                    if str(o.get("eventKind")) != "2":
                        continue
                    t = _as_int(o.get("eventTime"))
                    if t is not None and (created_time is None or t >= created_time):
                        return False
                return True

            # "Неотвеч." считаем по отдельной выборке ticketStates=[1] (быстро: +1 запрос).
            unanswered_states: list[int] = []
            for item in lst_unanswered:
                obj = item.get("object") or {}
                if internal_theme_ids is not None:
                    theme = obj.get("internalTheme")
                    if theme is None or str(theme) not in internal_theme_ids:
                        continue
                create_time = obj.get("createTime")
                try:
                    create_time_ms = int(create_time)
                except Exception:  # noqa: BLE001
                    continue
                if create_time_ms < period_from_ms or create_time_ms > period_to_ms:
                    continue

                if not _ticket_matches_scope(
                    allowed=allowed,
                    assignee=obj.get("user"),
                    last_message_user=obj.get("lastMessageUser"),
                ):
                    continue

                raw_state = obj.get("state")
                try:
                    state = int(raw_state)
                except Exception:  # noqa: BLE001
                    continue
                unanswered_states.append(state)
            unanswered_effective = sum(1 for s in unanswered_states if s == 1)

            # Для разделения "Неотвеч." vs "Редакт." проверяем события только для state=1 (их обычно мало).
            editing_from_events = 0
            max_probe = 0 if scope == "all" else 30
            to_probe = unanswered_ticket_ids[:max_probe]
            if to_probe:
                sem = asyncio.Semaphore(6)

                async def _one(tid: str) -> int:
                    async with sem:
                        try:
                            return 1 if await _is_editing_by_events(tid) else 0
                        except Exception:  # noqa: BLE001
                            return 0

                editing_from_events = sum(await asyncio.gather(*[_one(tid) for tid in to_probe]))
                # Важно: "неотвеч." берём из отдельной выборки ticketStates=[1].
                # Иногда эта выборка может быть меньше, чем кандидаты на "редакт." из общего списка,
                # поэтому не даём "перевычитать" и уходить в 0/отрицательные.
                editing_from_events = min(editing_from_events, unanswered_effective)
                unanswered_effective = unanswered_effective - editing_from_events

            # из PDF:
            # 1 - Неотвеченный; 2 - Отвеченный; 3 - В обработке; 4 - Закрыт; 5 - Редактируется.
            answered = _count(2)
            in_progress = _count(3)
            closed = _count(4)
            tickets_kpis = {
                "tickets_total": unanswered_effective + answered + in_progress + closed + editing_from_events,
                "tickets_unanswered": unanswered_effective,
                "tickets_answered": answered,
                "tickets_in_progress": in_progress,
                "tickets_closed": closed,
                "tickets_editing": editing_from_events,
                "period_from_ms": period_from_ms,
                "period_to_ms": period_to_ms,
            }
            backoffice_info["ticketStatesHistogram"] = {str(k): v for k, v in sorted(states_hist.items())}
            backoffice_info["ticketsEditingByEvents"] = {
                "editing_from_events": editing_from_events,
                "unanswered_from_state_list": unanswered_effective + editing_from_events,
                "probed": len(to_probe),
                "max_probe": max_probe,
            }
            backoffice_info["ticketsUnansweredNote"] = (
                "tickets_unanswered считается отдельным запросом getTicketsFromVersion(ticketStates=[1]) "
                "для лучшего совпадения с UI Backoffice."
            )

        bo_timeout = 45.0 if light else 90.0
        try:
            await asyncio.wait_for(_load_backoffice_block(), timeout=bo_timeout)
        except TimeoutError:
            backoffice_info = {"ok": False, "error": f"Backoffice timeout ({int(bo_timeout)}s)"}
        except Exception as e:  # noqa: BLE001
            backoffice_info = {"ok": False, "error": str(e)[:300]}

    uis_info = None
    uis_kpis: dict[str, float | int] | None = None
    if settings.uis_data_api_access_token:
        try:
            uis = UisDataApiClient(
                base_url=str(settings.uis_data_api_base_url),
                auth=UisAuth(access_token=settings.uis_data_api_access_token),
                request_id=settings.uis_data_api_request_id,
                timeout_seconds=settings.uis_data_api_timeout_seconds,
            )
            # UIS expects "YYYY-MM-DD hh:mm:ss" in portal timezone; use Moscow as baseline.
            msk = timezone(timedelta(hours=3))
            df = body.period.from_.astimezone(msk).strftime("%Y-%m-%d %H:%M:%S")
            dt = body.period.to.astimezone(msk).strftime("%Y-%m-%d %H:%M:%S")

            employee_id = (identity.mapping.uis_employee_id if identity.mapping else "") or ""
            if not employee_id:
                # demo override: allow explicit employeeId in request filters
                override = body.filters.get("uisEmployeeId")
                if override is not None and str(override).strip():
                    employee_id = str(override).strip()
            calls_total = 0
            calls_missed = 0
            talk_sum = 0.0
            talk_cnt = 0

            fields = ["id", "is_lost", "talk_duration", "employees", "last_answered_employee_id"]
            limit = 1000
            data_rows: list[dict] = []

            uis_max_pages = 8 if light else 30

            async def _fetch_uis_pages(*, filter_: dict | None) -> list[dict]:
                out: list[dict] = []
                offset = 0
                for _ in range(uis_max_pages):
                    res = await uis.get_calls_report(
                        date_from=df,
                        date_till=dt,
                        limit=limit,
                        offset=offset,
                        fields=fields,
                        filter_=filter_,
                    )
                    rows = ((res.get("result") or {}).get("data") or [])
                    if rows:
                        out.extend(rows)
                    if not rows or len(rows) < limit:
                        break
                    offset += limit
                return out

            if scope == "all":
                data_rows = await _fetch_uis_pages(filter_=None)
                uis_info = {"ok": True, "scope": "all", "date_from": df, "date_till": dt}
            elif scope == "team":
                bo_ids = body.filters.get("teamMemberIds")
                team_uis_ids: set[str] = set()
                if isinstance(bo_ids, list) and bo_ids:
                    bo_set = {str(x).strip() for x in bo_ids if str(x).strip()}
                    if bo_set:
                        rows = (
                            await session.execute(
                                select(EmployeeMapping).where(EmployeeMapping.backoffice_user_id.in_(bo_set))
                            )
                        ).scalars().all()
                        team_uis_ids = {
                            str(r.uis_employee_id).strip()
                            for r in rows
                            if (r.uis_employee_id or "").strip()
                        }
                all_rows = await _fetch_uis_pages(filter_=None)

                def _call_matches_team(row: dict) -> bool:
                    if not team_uis_ids:
                        return False
                    lae = row.get("last_answered_employee_id")
                    if lae is not None and str(lae) in team_uis_ids:
                        return True
                    emps = row.get("employees") or []
                    return any(
                        str(e.get("employee_id")) in team_uis_ids for e in emps if isinstance(e, dict)
                    )

                data_rows = [r for r in all_rows if _call_matches_team(r)]
                uis_info = {
                    "ok": True,
                    "scope": "team",
                    "teamUisIds": sorted(team_uis_ids),
                    "date_from": df,
                    "date_till": dt,
                }
            elif scope == "self" and employee_id:
                filt = {"field": "last_answered_employee_id", "operator": "=", "value": int(employee_id)}
                data_rows = await _fetch_uis_pages(filter_=filt)
                if not data_rows:
                    all_rows = await _fetch_uis_pages(filter_=None)
                    for r in all_rows:
                        emps = r.get("employees") or []
                        if any(
                            str(e.get("employee_id")) == str(employee_id) for e in emps if isinstance(e, dict)
                        ):
                            data_rows.append(r)
                uis_info = {"ok": True, "employeeId": employee_id, "date_from": df, "date_till": dt}

            if data_rows:
                for r in data_rows:
                    calls_total += 1
                    is_lost = bool(r.get("is_lost"))
                    if is_lost:
                        calls_missed += 1
                    td = r.get("talk_duration")
                    try:
                        td_f = float(td)
                    except Exception:  # noqa: BLE001
                        td_f = 0.0
                    if td_f > 0:
                        talk_sum += td_f
                        talk_cnt += 1

            calls_connected = max(0, calls_total - calls_missed)
            aht = (talk_sum / talk_cnt) if talk_cnt else 0.0
            lcr = (calls_missed / calls_total * 100.0) if calls_total else 0.0
            if data_rows or scope == "all" or scope == "team" or (scope == "self" and employee_id):
                uis_kpis = {
                    "calls_total": calls_total,
                    "calls_connected": calls_connected,
                    "calls_missed": calls_missed,
                    "aht_avg_seconds": aht,
                    "lcr_percent": lcr,
                }
            if uis_info is None and scope == "self" and not employee_id:
                uis_info = {"ok": False, "error": "uis_employee_id not mapped"}
        except Exception as e:  # noqa: BLE001
            uis_info = {"ok": False, "error": str(e)[:300]}

    return {
        "build": "2026-05-06-bo-group-filter-v1",
        "identity": {
            "email": identity.email,
            "preferredRole": identity.preferred_role,
            "scope": scope,
            "mapped": bool(identity.mapping),
            "backofficeUserId": identity.mapping.backoffice_user_id if identity.mapping else "",
            "usedeskUserId": identity.mapping.usedesk_user_id if identity.mapping else "",
            "uisEmployeeId": identity.mapping.uis_employee_id if identity.mapping else "",
        },
        "period": {"from": body.period.from_.isoformat(), "to": body.period.to.isoformat(), "tz": body.period.tz},
        # Единый контракт под руководителя/оператора. Сейчас частично заполнено из Backoffice.
        "kpis": {
            # линия (звонки)
            "calls_total": uis_kpis.get("calls_total") if uis_kpis else None,
            "calls_connected": uis_kpis.get("calls_connected") if uis_kpis else None,
            "calls_missed": uis_kpis.get("calls_missed") if uis_kpis else None,
            "sl_percent": None,  # Service Level, %
            "sl_threshold_seconds": 10,
            "lcr_percent": uis_kpis.get("lcr_percent") if uis_kpis else None,  # Lost Call Rate, %
            "aht_avg_seconds": uis_kpis.get("aht_avg_seconds") if uis_kpis else None,  # Average Handling Time
            "csi_score": None,  # Customer Satisfaction Index (0..5)

            # чаты/мессенджеры
            "next_reply_avg_seconds": None,
            "csat_percent": None,

            # эффективность времени (UIS)
            "utz_percent": None,  # utilization
            "occ_percent": None,  # occupancy
        },
        "tickets": tickets_kpis,
        "deltas": {},
        "series": {"by_day": [], "by_hour": []},
        "integrations": {"backoffice": backoffice_info, "uis": uis_info},
    }


class TeamOverviewRequest(BaseModel):
    period: Period
    teamMemberIds: list[str] = Field(default_factory=list)


async def _all_backoffice_member_ids(session: AsyncSession) -> list[str]:
    rows = (await session.execute(select(EmployeeMapping))).scalars().all()
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        bo = (row.backoffice_user_id or "").strip()
        if not bo or bo in seen:
            continue
        seen.add(bo)
        out.append(bo)
    return out


@router.post("/team-overview")
async def team_operator_overview(
    body: TeamOverviewRequest,
    settings: Settings = Depends(get_settings),
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя")

    team_ids = [str(x).strip() for x in body.teamMemberIds if str(x).strip()]
    scope = "team" if team_ids else "all"
    member_ids = team_ids if team_ids else await _all_backoffice_member_ids(session)
    member_ids = [mid for mid in member_ids if mid and not mid.startswith("kc:")]

    period_from = body.period.from_
    if period_from.tzinfo is None:
        period_from = period_from.replace(tzinfo=timezone.utc)
    msk = period_from.astimezone(timezone(timedelta(hours=3)))

    summary_body = DashboardSummaryRequest(
        period=body.period,
        scope=scope,
        light=True,
        filters={
            "teamMemberIds": team_ids,
            "ticketStates": [1, 2, 3, 4, 5],
        },
    )

    summary = await dashboard_summary(summary_body, settings, identity, session)
    overview = build_team_operator_overview(member_ids=member_ids, summary=summary, monitoring=None)
    overview["integrations"] = {"monitoring": {"configured": bool(monitoring_client_from_settings(settings))}}
    return overview


class TeamMonitoringRequest(BaseModel):
    teamMemberIds: list[str] = Field(default_factory=list)


@router.post("/team-monitoring")
async def team_monitoring(
    body: TeamMonitoringRequest,
    settings: Settings = Depends(get_settings),
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя")

    client = monitoring_client_from_settings(settings)
    if not client:
        return {
            "configured": False,
            "monitoring": None,
            "integrations": {"monitoring": {"configured": False, "source": "demo"}},
        }

    team_ids = [str(x).strip() for x in body.teamMemberIds if str(x).strip()]
    member_ids = team_ids if team_ids else await _all_backoffice_member_ids(session)
    member_ids = [mid for mid in member_ids if mid and not mid.startswith("kc:")]

    info: dict[str, Any] = {"configured": True, "source": "demo"}
    months: list[dict[str, Any]] = []
    try:
        months = await asyncio.wait_for(
            fetch_team_monitoring_months(
                client=client,
                session=session,
                backoffice_member_ids=member_ids,
                limit=12,
            ),
            timeout=25.0,
        )
        info["source"] = "api"
        if not any(not m.get("empty") for m in months):
            info["empty"] = True
        current = months[0] if months else None
        if current:
            info["membersWithData"] = current.get("membersWithData")
            info["membersTotal"] = current.get("membersTotal")
    except TimeoutError:
        info["error"] = "Monitoring timeout (25s)"
    except Exception as e:  # noqa: BLE001
        info["error"] = str(e)[:300]

    return {
        "configured": True,
        "monitoring": {"months": months},
        "integrations": {"monitoring": info},
    }


class MyMonitoringRequest(BaseModel):
    period: Period


@router.post("/my-monitoring")
async def my_monitoring(
    body: MyMonitoringRequest,
    settings: Settings = Depends(get_settings),
    identity: Identity = Depends(get_identity),
) -> dict:
    client = monitoring_client_from_settings(settings)
    if not client:
        return {
            "configured": False,
            "monitoring": None,
            "integrations": {"monitoring": {"configured": False, "source": "demo"}},
        }

    period_from = body.period.from_
    if period_from.tzinfo is None:
        period_from = period_from.replace(tzinfo=timezone.utc)
    msk = period_from.astimezone(timezone(timedelta(hours=3)))
    info: dict[str, Any] = {"configured": True, "source": "demo"}
    months: list[dict[str, Any]] = []
    try:
        _, months = await fetch_operator_monitoring_months(
            client=client,
            email=identity.email,
            limit=12,
        )
        info["source"] = "api"
        if not any(not m.get("empty") for m in months):
            info["empty"] = True
    except Exception as e:  # noqa: BLE001
        info["error"] = str(e)[:300]

    return {
        "configured": True,
        "monitoring": {"months": months},
        "integrations": {"monitoring": info},
    }

