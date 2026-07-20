"""Сборка JSON-дашборда «Тригеры РА» из TouchPoint."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
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


def build_touchpoint_client(settings: Settings) -> TouchPointClient:
    return TouchPointClient(
        api_base_url=str(settings.itech_resource_base_url),
        auth_url=str(settings.itech_oauth_token_url),
        client_id=settings.itech_oauth_client_id,
        client_secret=settings.itech_oauth_client_secret,
        username=settings.itech_oauth_username,
        password=settings.itech_oauth_password,
        access_token=settings.itech_access_token,
        grant_type=settings.itech_oauth_grant_type or "password",
        timeout_seconds=max(120.0, float(settings.itech_timeout_seconds)),
    )


def touchpoint_configured(settings: Settings) -> bool:
    if settings.itech_access_token.strip():
        return True
    if settings.itech_oauth_client_id and settings.itech_oauth_username and settings.itech_oauth_password:
        return True
    if settings.itech_oauth_client_id and settings.itech_oauth_client_secret:
        return True
    return False


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


def load_dashboard(client: TouchPointClient, period_days: int) -> dict[str, Any]:
    end = datetime.now(timezone.utc)
    cur_start, cur_end = period_bounds(period_days, end=end)
    base_start = cur_start - timedelta(days=period_days)
    base_end = cur_start
    chart_start, chart_end = period_bounds(CHART_PERIOD_DAYS, end=end)

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
