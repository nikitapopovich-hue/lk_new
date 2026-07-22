"""Сборка JSON-дашборда «Тригеры РА» из TouchPoint."""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.core.config import Settings
from app.domain.triggers_ra.config import (
    CHART_PERIOD_DAYS,
    DEFAULT_PERIOD_DAYS,
    MIN_CALLS_PER_OPERATOR,
    ProjectGroup,
    sp_vip_projects,
    tm_projects,
)
from app.domain.triggers_ra.burnout import fetch_burnout_by_operator
from app.domain.triggers_ra.metrics import (
    OperatorMetrics,
    OperatorScore,
    ProjectOperatorRow,
    TMOperatorRow,
    compute_operator_scores,
    fetch_daily_series,
    fetch_operator_metrics,
    fetch_project_operator_rows,
    fetch_tm_data,
    period_bounds,
)
from app.domain.triggers_ra.touchpoint_client import TouchPointClient
from app.domain.triggers_ra.ui_helpers import (
    FORMULAS_MARKDOWN,
    fmt_pct,
    fmt_score,
    fmt_trend_points,
    fmt_trend_pp,
    humanize_triggers,
)

logger = logging.getLogger(__name__)

# TouchPoint: слишком короткий timeout режет длинные агрегации; 120 с держит воркер слишком долго.
TOUCHPOINT_TIMEOUT_SECONDS = 40.0
DASHBOARD_CACHE_TTL_SECONDS = 180.0

_dashboard_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_dashboard_cache_lock = threading.Lock()


def build_touchpoint_client(settings: Settings) -> TouchPointClient:
    configured = float(settings.itech_timeout_seconds or TOUCHPOINT_TIMEOUT_SECONDS)
    timeout = max(TOUCHPOINT_TIMEOUT_SECONDS, min(configured, 60.0))
    return TouchPointClient(
        api_base_url=str(settings.itech_resource_base_url),
        auth_url=str(settings.itech_oauth_token_url),
        client_id=settings.itech_oauth_client_id,
        client_secret=settings.itech_oauth_client_secret,
        username=settings.itech_oauth_username,
        password=settings.itech_oauth_password,
        access_token=settings.itech_access_token,
        grant_type=settings.itech_oauth_grant_type or "password",
        timeout_seconds=timeout,
    )


def touchpoint_configured(settings: Settings) -> bool:
    if settings.itech_access_token.strip():
        return True
    if settings.itech_oauth_client_id and settings.itech_oauth_username and settings.itech_oauth_password:
        return True
    if settings.itech_oauth_client_id and settings.itech_oauth_client_secret:
        return True
    return False


def _as_utc_start(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def _as_utc_end_exclusive_as_inclusive(d: date) -> datetime:
    """Конец дня включительно для фильтров gte/lte по дате."""
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)


def resolve_period(
    *,
    period_days: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[datetime, datetime, datetime, datetime, int, datetime, datetime]:
    """Возвращает cur_start/end, base_start/end, period_days, chart_start/end."""
    now = datetime.now(timezone.utc)

    if date_from is not None and date_to is not None:
        if date_to < date_from:
            raise ValueError("date_to должен быть не раньше date_from")
        # Включительно: 01.03–31.03 = 31 день
        days = (date_to - date_from).days + 1
        if days < 1:
            days = 1
        if days > 90:
            raise ValueError("Интервал не может быть больше 90 дней")
        cur_start = _as_utc_start(date_from)
        cur_end = _as_utc_end_exclusive_as_inclusive(date_to)
        base_end = cur_start
        base_start = cur_start - timedelta(days=days)
        period_days = days
    else:
        days = period_days or DEFAULT_PERIOD_DAYS
        days = max(1, min(int(days), 90))
        cur_start, cur_end = period_bounds(days, end=now)
        base_start = cur_start - timedelta(days=days)
        base_end = cur_start
        period_days = days

    chart_end = cur_end
    chart_start = chart_end - timedelta(days=CHART_PERIOD_DAYS)
    return cur_start, cur_end, base_start, base_end, period_days, chart_start, chart_end


def _cache_key(period_days: int, date_from: date | None, date_to: date | None) -> str:
    if date_from and date_to:
        return f"custom:{date_from.isoformat()}:{date_to.isoformat()}"
    return f"days:{period_days}"


def get_cached_dashboard(key: str) -> dict[str, Any] | None:
    now = time.monotonic()
    with _dashboard_cache_lock:
        entry = _dashboard_cache.get(key)
        if not entry:
            return None
        ts, payload = entry
        if now - ts > DASHBOARD_CACHE_TTL_SECONDS:
            _dashboard_cache.pop(key, None)
            return None
        return payload


def put_cached_dashboard(key: str, payload: dict[str, Any]) -> None:
    with _dashboard_cache_lock:
        _dashboard_cache[key] = (time.monotonic(), payload)


def _metric_snapshot(m: OperatorMetrics) -> dict[str, Any]:
    return {
        "totalCalls": m.total_calls,
        "nekonstruktivPct": round(m.nekonstruktiv_pct, 2),
        "clientNegPct": round(m.client_neg_pct, 2),
        "operatorEndPct": round(m.operator_end_pct, 2),
        "qcAvgWeight": m.qc_avg_weight,
        "qcAvgWeightPct": round(m.qc_avg_weight * 100, 2) if m.qc_avg_weight is not None else None,
        "monitoringPct": round(m.monitoring_pct, 2),
        "llmBurnoutAvg": m.llm_burnout_avg,
        "llmEmpathyAvg": m.llm_empathy_avg,
        "llmEngagementAvg": m.llm_engagement_avg,
        "llmPrematureClosurePct": round(m.llm_premature_closure_pct, 2) if m.llm_burnout_count else None,
        "llmSampleCount": m.llm_burnout_count,
    }


def _trend_cell(text: str, sentiment: str) -> dict[str, str]:
    return {"text": text, "sentiment": sentiment}


def serialize_operator_row(s: OperatorScore) -> dict[str, Any]:
    m = s.metrics
    base = s.baseline

    d_nek, s_nek = fmt_trend_pp(s.trend_nekonstruktiv, higher_is_worse=True)
    d_neg, s_neg = fmt_trend_pp(s.trend_client_neg, higher_is_worse=True)
    d_end, s_end = fmt_trend_pp(s.trend_operator_end, higher_is_worse=True)
    d_mon, s_mon = "—", "neutral"
    d_qc, s_qc = "—", "neutral"
    d_llm, s_llm = "—", "neutral"
    d_emp, s_emp = "—", "neutral"

    if base:
        d_mon, s_mon = fmt_trend_pp(m.monitoring_pct - base.monitoring_pct, higher_is_worse=True)
        if m.qc_avg_weight is not None and base.qc_avg_weight is not None:
            d_qc, s_qc = fmt_trend_pp(
                (m.qc_avg_weight - base.qc_avg_weight) * 100,
                higher_is_worse=False,
            )
        if m.llm_burnout_avg is not None and base.llm_burnout_avg is not None:
            d_llm, s_llm = fmt_trend_points(
                m.llm_burnout_avg - base.llm_burnout_avg,
                higher_is_worse=True,
            )
        if m.llm_empathy_avg is not None and base.llm_empathy_avg is not None:
            d_emp, s_emp = fmt_trend_points(
                m.llm_empathy_avg - base.llm_empathy_avg,
                higher_is_worse=False,
            )

    return {
        "operator": s.operator,
        "totalCalls": s.total_calls,
        "isAtRisk": s.is_at_risk,
        "compositeScore": s.composite_score,
        "triggers": s.active_triggers,
        "triggersLabel": humanize_triggers(s.active_triggers),
        "metrics": _metric_snapshot(m),
        "trends": {
            "nekonstruktiv": _trend_cell(d_nek, s_nek),
            "clientNeg": _trend_cell(d_neg, s_neg),
            "operatorEnd": _trend_cell(d_end, s_end),
            "qc": _trend_cell(d_qc, s_qc),
            "monitoring": _trend_cell(d_mon, s_mon),
            "llmRisk": _trend_cell(d_llm, s_llm),
            "empathy": _trend_cell(d_emp, s_emp),
        },
        "display": {
            "nekonstruktivPct": fmt_pct(m.nekonstruktiv_pct),
            "clientNegPct": fmt_pct(m.client_neg_pct),
            "operatorEndPct": fmt_pct(m.operator_end_pct),
            "qcPct": fmt_pct(m.qc_avg_weight * 100) if m.qc_avg_weight else "—",
            "monitoringPct": fmt_pct(m.monitoring_pct),
            "llmRisk": fmt_score(m.llm_burnout_avg),
            "empathy": fmt_score(m.llm_empathy_avg),
            "engagement": fmt_score(m.llm_engagement_avg),
            "prematureClosurePct": (
                fmt_pct(m.llm_premature_closure_pct) if m.llm_burnout_count else "—"
            ),
            "score": fmt_score(s.composite_score),
        },
    }


def serialize_project_row(row: ProjectOperatorRow, burnout: dict | None) -> dict[str, Any]:
    op_burn = (burnout or {}).get(row.operator)
    return {
        "operator": row.operator,
        "totalCalls": row.total_calls,
        "nekonstruktivPct": round(row.nekonstruktiv_pct, 2),
        "clientNegPct": round(row.client_neg_pct, 2),
        "operatorEndPct": round(row.operator_end_pct, 2),
        "qcAvgWeight": row.qc_avg_weight,
        "monitoringPct": round(row.monitoring_pct, 2),
        "llmBurnoutAvg": getattr(op_burn, "avg_risk", None) if op_burn else None,
        "llmEmpathyAvg": getattr(op_burn, "avg_empathy", None) if op_burn else None,
    }


def serialize_tm_row(row: TMOperatorRow, burnout: dict | None) -> dict[str, Any]:
    op_burn = (burnout or {}).get(row.operator)
    return {
        "operator": row.operator,
        "totalCalls": row.total_calls,
        "operatorEndPct": round(row.operator_end_pct, 2),
        "clientNegPct": round(row.client_neg_pct, 2),
        "statusPcts": {k: round(v, 2) for k, v in row.status_pcts.items()},
        "llmBurnoutAvg": getattr(op_burn, "avg_risk", None) if op_burn else None,
        "llmEmpathyAvg": getattr(op_burn, "avg_empathy", None) if op_burn else None,
        "llmPrematureClosurePct": (
            round(op_burn.premature_closure_pct, 2)
            if op_burn and getattr(op_burn, "sample_count", 0)
            else None
        ),
    }


def load_dashboard(
    client: TouchPointClient,
    *,
    period_days: int = DEFAULT_PERIOD_DAYS,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    cur_start, cur_end, base_start, base_end, period_days, chart_start, chart_end = resolve_period(
        period_days=period_days,
        date_from=date_from,
        date_to=date_to,
    )

    sp_vip = sp_vip_projects()
    tm = tm_projects()
    sp_ids = {p.id for p in sp_vip if p.group == ProjectGroup.SP}
    vip_ids = {p.id for p in sp_vip if p.group == ProjectGroup.VIP}

    burnout_cache: dict[str, dict] = {}
    current_metrics = fetch_operator_metrics(
        client,
        sp_vip,
        cur_start,
        cur_end,
        period_label="текущий период",
        burnout_cache=burnout_cache,
    )
    baseline_metrics = fetch_operator_metrics(
        client,
        sp_vip,
        base_start,
        base_end,
        period_label="базовый период",
        include_burnout=False,
    )
    for project in tm:
        if project.burnout_form_item_number:
            burnout_cache[project.id] = fetch_burnout_by_operator(
                client, project, cur_start, cur_end
            )

    scores = compute_operator_scores(
        current_metrics,
        baseline_metrics,
        sp_project_ids=sp_ids,
        vip_project_ids=vip_ids,
    )

    project_sections: list[dict[str, Any]] = []
    for project in sp_vip:
        rows = fetch_project_operator_rows(client, project, cur_start, cur_end)
        burn = burnout_cache.get(project.id) or {}
        project_sections.append(
            {
                "id": project.id,
                "name": project.name,
                "group": project.group.value,
                "hasClientSentiment": project.has_client_sentiment,
                "hasEndCall": project.end_call_field is not None,
                "operators": [serialize_project_row(r, burn) for r in rows],
            }
        )

    tm_sections: list[dict[str, Any]] = []
    for project in tm:
        rows, statuses = fetch_tm_data(client, project, cur_start, cur_end)
        burn = burnout_cache.get(project.id) or {}
        tm_sections.append(
            {
                "id": project.id,
                "name": project.name,
                "statuses": statuses,
                "operators": [serialize_tm_row(r, burn) for r in rows],
            }
        )

    charts: list[dict[str, Any]] = []
    for project in sp_vip:
        series = fetch_daily_series(client, project, chart_start, chart_end)
        charts.append(
            {
                "id": project.id,
                "name": project.name,
                "group": project.group.value,
                "hasClientSentiment": project.has_client_sentiment,
                "points": [
                    {
                        "date": p.get("date") or p.get("day") or "",
                        "nekonstruktivPct": p.get("nekonstruktiv_pct", p.get("nekonstruktivPct")),
                        "clientNegPct": p.get("client_neg_pct", p.get("clientNegPct")),
                    }
                    for p in series
                ],
            }
        )

    operators = [serialize_operator_row(s) for s in scores]
    return {
        "periodDays": period_days,
        "defaultPeriodDays": DEFAULT_PERIOD_DAYS,
        "minCalls": MIN_CALLS_PER_OPERATOR,
        "dateFrom": cur_start.date().isoformat(),
        "dateTo": cur_end.date().isoformat(),
        "period": {
            "start": cur_start.isoformat(),
            "end": cur_end.isoformat(),
            "chartStart": chart_start.isoformat(),
            "chartEnd": chart_end.isoformat(),
        },
        "operators": operators,
        "atRisk": [o for o in operators if o["isAtRisk"]],
        "projects": project_sections,
        "tm": tm_sections,
        "charts": charts,
        "formulasMarkdown": FORMULAS_MARKDOWN.strip(),
    }


def load_dashboard_cached(
    client: TouchPointClient,
    *,
    period_days: int = DEFAULT_PERIOD_DAYS,
    date_from: date | None = None,
    date_to: date | None = None,
    force: bool = False,
) -> dict[str, Any]:
    key = _cache_key(period_days, date_from, date_to)
    if not force:
        cached = get_cached_dashboard(key)
        if cached is not None:
            logger.info("triggers_ra dashboard cache hit key=%s", key)
            out = dict(cached)
            out["fromCache"] = True
            return out

    data = load_dashboard(
        client,
        period_days=period_days,
        date_from=date_from,
        date_to=date_to,
    )
    put_cached_dashboard(key, data)
    out = dict(data)
    out["fromCache"] = False
    return out
