from __future__ import annotations

import hashlib
from typing import Any

from app.domain.monitoring_metrics import (
    calendar_month_slots_msk,
    monitoring_grade_from_points,
    monitoring_month_to_dict,
)

# Базовые демо-значения (как на фронте до полного API).
_TOP_KPI_BASE: list[tuple[str, int, int]] = [
    ("Принято звонков", 148, 5),
    ("Обработано чатов", 1001, 10),
    ("Обработано запросов", 2492, 3),
    ("Обработано тикетов", 167, -5),
]

_KPD_BASE = 95.0
_MONITORING_BASE = 81.5

_METRIC_BASE: list[dict[str, Any]] = [
    {"key": "nextReply", "label": "Next Reply", "color": "#7c6cf0", "kind": "duration", "higherIsBetter": False, "monthly": [77, 85, 96, 83, 75]},
    {"key": "firstReply", "label": "First Reply", "color": "#facc15", "kind": "duration", "higherIsBetter": False, "monthly": [96, 100, 90, 88, 85]},
    {"key": "sl", "label": "SL", "color": "#ef4444", "kind": "percent", "higherIsBetter": True, "monthly": [100, 100, 100, 98, 100]},
    {"key": "csat", "label": "CSAT", "color": "#22c55e", "kind": "count", "higherIsBetter": False, "monthly": [1, 0, 0, 1, 0]},
    {"key": "ahtChats", "label": "AHT (чаты)", "color": "#22d3ee", "kind": "duration", "higherIsBetter": False, "monthly": [133, 155, 218, 176, 145]},
    {"key": "ahtCalls", "label": "AHT (звонки)", "color": "#fb923c", "kind": "duration", "higherIsBetter": False, "monthly": [187, 162, 198, 201, 181]},
]

def _member_factor(member_id: str) -> float:
    key = (member_id or "default").strip().lower()
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()[:8]
    bucket = int(digest, 16) % 21
    return 0.9 + bucket / 100.0


def _demo_team_monitoring_months(member_ids: list[str], *, limit: int = 12) -> list[dict[str, Any]]:
    slots = calendar_month_slots_msk(limit=limit)
    out: list[dict[str, Any]] = []
    for year, month in slots:
        vals = [_MONITORING_BASE * _member_factor(f"{mid}:{year}-{month}") for mid in member_ids]
        points = round(sum(vals) / len(vals), 1)
        out.append(
            monitoring_month_to_dict(
                year=year,
                month=month,
                points=points,
                grade=monitoring_grade_from_points(points),
                members_with_data=len(member_ids),
                members_total=len(member_ids),
            )
        )
    return out


def _monitoring_current_from_months(months: list[dict[str, Any]] | None) -> dict[str, Any]:
    if not months:
        return {"points": 0.0, "grade": "—", "months": [], "empty": True}
    current = months[0]
    if current.get("empty"):
        return {
            "points": 0.0,
            "grade": "—",
            "months": months,
            "empty": True,
            "membersWithData": current.get("membersWithData"),
            "membersTotal": current.get("membersTotal"),
        }
    return {
        "points": current.get("points"),
        "grade": current.get("grade"),
        "months": months,
        "empty": False,
        "membersWithData": current.get("membersWithData"),
        "membersTotal": current.get("membersTotal"),
    }


def _current_month_index_msk() -> int:
    """0-based индекс месяца в массиве monthly (январь=0)."""
    import datetime as dt
    from zoneinfo import ZoneInfo

    now = dt.datetime.now(ZoneInfo("Europe/Moscow"))
    return now.month - 1


def build_team_operator_overview(
    *,
    member_ids: list[str],
    summary: dict[str, Any],
    monitoring: dict[str, Any] | None = None,
) -> dict[str, Any]:
    members = [m for m in member_ids if (m or "").strip()]
    month_idx = _current_month_index_msk()

    if not members:
        empty_metrics = [
            {
                "key": spec["key"],
                "label": spec["label"],
                "color": spec["color"],
                "kind": spec["kind"],
                "higherIsBetter": spec["higherIsBetter"],
                "monthly": [None] * 12,
            }
            for spec in _METRIC_BASE
        ]
        empty_mon_months = [
            monitoring_month_to_dict(year=y, month=m, points=None, grade=None)
            for y, m in calendar_month_slots_msk()
        ]
        return {
            "memberCount": 0,
            "topKpis": [{"label": label, "value": 0, "changePercent": 0} for label, _, _ in _TOP_KPI_BASE],
            "kpdPercent": 0.0,
            "monitoring": _monitoring_current_from_months(empty_mon_months),
            "metrics": empty_metrics,
            "period": summary.get("period"),
        }

    # --- Top KPI: суммы за месяц ---
    top_kpis: list[dict[str, Any]] = []
    for label, base_val, change in _TOP_KPI_BASE:
        demo_sum = sum(round(base_val * _member_factor(mid)) for mid in members)
        demo_change = change
        value = demo_sum
        if label == "Принято звонков":
            real = (summary.get("kpis") or {}).get("calls_connected")
            if isinstance(real, (int, float)) and real >= 0:
                value = int(real)
        elif label == "Обработано тикетов":
            tickets = summary.get("tickets") or {}
            real = tickets.get("tickets_total")
            if isinstance(real, (int, float)) and real >= 0:
                value = int(real)
        top_kpis.append({"label": label, "value": value, "changePercent": demo_change})

    # --- КПД и мониторинг: средние ---
    kpd_vals = [_KPD_BASE * _member_factor(mid) for mid in members]
    kpd_percent = round(sum(kpd_vals) / len(kpd_vals), 1)
    if monitoring and monitoring.get("months"):
        monitoring_block = _monitoring_current_from_months(list(monitoring["months"]))
        if monitoring.get("empty"):
            monitoring_block["empty"] = True
    else:
        monitoring_block = _monitoring_current_from_months(_demo_team_monitoring_months(members))
    monitoring_points = float(monitoring_block.get("points") or 0.0)
    monitoring_grade = str(monitoring_block.get("grade") or "—")

    # --- Показатели: средние по месяцам ---
    metrics_out: list[dict[str, Any]] = []
    for spec in _METRIC_BASE:
        base_monthly: list[float] = [float(v) for v in spec["monthly"]]
        monthly_avg: list[float | None] = []
        for mi in range(12):
            if mi > month_idx:
                monthly_avg.append(None)
                continue
            base = base_monthly[mi] if mi < len(base_monthly) else base_monthly[-1]
            vals = [base * _member_factor(mid) for mid in members]
            monthly_avg.append(round(sum(vals) / len(vals), 2))
        metrics_out.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "color": spec["color"],
                "kind": spec["kind"],
                "higherIsBetter": spec["higherIsBetter"],
                "monthly": monthly_avg,
            }
        )

    # Реальные средние из UIS, если есть
    kpis = summary.get("kpis") or {}
    aht = kpis.get("aht_avg_seconds")
    if isinstance(aht, (int, float)) and aht > 0:
        for m in metrics_out:
            if m["key"] == "ahtCalls" and m["monthly"][month_idx] is not None:
                m["monthly"][month_idx] = round(float(aht), 2)

    return {
        "memberCount": len(members),
        "topKpis": top_kpis,
        "kpdPercent": min(100.0, max(0.0, kpd_percent)),
        "monitoring": monitoring_block,
        "metrics": metrics_out,
        "period": summary.get("period"),
    }
