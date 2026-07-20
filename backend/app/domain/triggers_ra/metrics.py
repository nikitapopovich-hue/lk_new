"""Сбор агрегаций TouchPoint и расчёт composite score."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("triger")

from app.domain.triggers_ra.burnout import fetch_burnout_by_operator
from app.domain.triggers_ra.config import (
    CLIENT_NEG_FIELD,
    LLM_BURNOUT_DELTA,
    LLM_BURNOUT_TRIGGER_SCORE,
    MIN_CALLS_PER_OPERATOR,
    MIN_LLM_SAMPLES,
    MIN_QC_CHECKS_FOR_T5,
    OPERATOR_FIELD,
    QC_SCORE_DROP,
    RISK_MIN_TRIGGERS,
    RISK_SCORE_THRESHOLD,
    SCORE_WEIGHTS,
    STAGE_MONITORING,
    STAGE_QC_VERIFIED,
    TRIGGER_DELTA_PCT,
    ProjectConfig,
    ProjectGroup,
    TM_STATUS_NAMES,
    WEIGHT_FIELD,
)
from app.domain.triggers_ra.touchpoint_client import TouchPointClient


@dataclass
class OperatorMetrics:
    operator: str
    total_calls: int = 0
    nekonstruktiv_count: int = 0
    client_neg_sum: float = 0.0
    client_neg_count: int = 0
    operator_end_count: int = 0
    end_call_total: int = 0  # только проекты с EndCall / OperatorEndCall
    qc_verified_count: int = 0
    qc_weight_sum: float = 0.0
    monitoring_count: int = 0
    interruptions_sum: float = 0.0
    interruptions_count: int = 0
    # LLM burnout из form_items (промпт выгорания)
    llm_burnout_sum: float = 0.0
    llm_burnout_count: int = 0
    llm_empathy_sum: float = 0.0
    llm_empathy_count: int = 0
    llm_engagement_sum: float = 0.0
    llm_engagement_count: int = 0
    llm_high_risk_count: int = 0
    llm_premature_closure_count: int = 0
    projects: set[str] = field(default_factory=set)

    @property
    def nekonstruktiv_pct(self) -> float:
        return _pct(self.nekonstruktiv_count, self.total_calls)

    @property
    def client_neg_pct(self) -> float:
        if self.client_neg_count == 0:
            return 0.0
        return (self.client_neg_sum / self.client_neg_count) * 100

    @property
    def operator_end_pct(self) -> float:
        return _pct(self.operator_end_count, self.end_call_total)

    @property
    def qc_avg_weight(self) -> float | None:
        if self.qc_verified_count == 0:
            return None
        return self.qc_weight_sum / self.qc_verified_count

    @property
    def monitoring_pct(self) -> float:
        return _pct(self.monitoring_count, self.total_calls)

    @property
    def avg_interruptions(self) -> float:
        if self.interruptions_count == 0:
            return 0.0
        return self.interruptions_sum / self.interruptions_count

    @property
    def llm_burnout_avg(self) -> float | None:
        if self.llm_burnout_count == 0:
            return None
        return round(self.llm_burnout_sum / self.llm_burnout_count, 1)

    @property
    def llm_empathy_avg(self) -> float | None:
        if self.llm_empathy_count == 0:
            return None
        return round(self.llm_empathy_sum / self.llm_empathy_count, 1)

    @property
    def llm_engagement_avg(self) -> float | None:
        if self.llm_engagement_count == 0:
            return None
        return round(self.llm_engagement_sum / self.llm_engagement_count, 1)

    @property
    def llm_premature_closure_pct(self) -> float:
        return _pct(self.llm_premature_closure_count, self.llm_burnout_count)


@dataclass
class OperatorScore:
    operator: str
    total_calls: int
    composite_score: float
    active_triggers: list[str]
    is_at_risk: bool
    metrics: OperatorMetrics
    baseline: OperatorMetrics | None = None
    trend_nekonstruktiv: float | None = None
    trend_client_neg: float | None = None
    trend_operator_end: float | None = None


@dataclass
class ProjectOperatorRow:
    project_id: str
    project_name: str
    group: ProjectGroup
    operator: str
    total_calls: int
    nekonstruktiv_pct: float
    client_neg_pct: float
    operator_end_pct: float
    qc_avg_weight: float | None
    monitoring_pct: float


@dataclass
class TMOperatorRow:
    operator: str
    total_calls: int
    operator_end_pct: float
    client_neg_pct: float
    status_counts: dict[str, int]
    status_pcts: dict[str, float]


def _extract_agg_buckets(resp: dict | None, agg_name: str) -> tuple[list[dict], dict[str, Any]]:
    """Извлекает buckets из ответа aggregate (разные обёртки TouchPoint/ES)."""
    summary: dict[str, Any] = {}
    if not resp:
        summary["error"] = "пустой ответ"
        return [], summary

    summary["top_keys"] = list(resp.keys())[:20]
    aggs = resp.get("aggregations") or resp.get("aggs") or resp.get("aggregation") or {}
    if not isinstance(aggs, dict):
        summary["aggs_type"] = type(aggs).__name__
        return [], summary

    summary["agg_keys"] = list(aggs.keys())[:20]
    node = aggs.get(agg_name) or {}
    if isinstance(node, dict):
        summary["node_keys"] = list(node.keys())[:20]
        buckets = node.get("buckets")
    else:
        summary["node_type"] = type(node).__name__
        buckets = None

    if not isinstance(buckets, list):
        summary["buckets_missing"] = True
        return [], summary

    summary["bucket_count"] = len(buckets)
    return buckets, summary


def _log_period(label: str, start: datetime, end: datetime) -> None:
    log.info("%s: %s — %s", label, _iso_date(start), _iso_date(end))


def _log_operator_distribution(metrics: dict[str, OperatorMetrics], label: str) -> None:
    log.info("%s: уникальных операторов=%d", label, len(metrics))
    if not metrics:
        return
    ranked = sorted(metrics.values(), key=lambda m: -m.total_calls)
    for m in ranked[:15]:
        log.info(
            "  %s: calls=%d nek=%.1f%% end_call=%.1f%% llm_n=%d",
            m.operator,
            m.total_calls,
            m.nekonstruktiv_pct,
            m.operator_end_pct,
            m.llm_burnout_count,
        )
    below = [m for m in ranked if m.total_calls < MIN_CALLS_PER_OPERATOR]
    if below:
        log.info(
            "  ниже порога <%d обращений: %d операторов (макс. calls=%d)",
            MIN_CALLS_PER_OPERATOR,
            len(below),
            below[0].total_calls if below else 0,
        )


def _pct(part: int | float, whole: int | float) -> float:
    if not whole:
        return 0.0
    return round(100.0 * part / whole, 2)


def _iso_date(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def period_bounds(days: int, *, end: datetime | None = None) -> tuple[datetime, datetime]:
    end_dt = end or datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days)
    return start_dt, end_dt


def _date_range_filter(start: datetime, end: datetime) -> dict:
    return {
        "range": {
            "created_date": {
                "gte": _iso_date(start),
                "lte": _iso_date(end),
            }
        }
    }


def _nekonstruktiv_filter(project: ProjectConfig) -> dict | None:
    if not project.theme_field:
        return None
    if project.nekonstruktiv_value:
        return {"term": {project.theme_field: project.nekonstruktiv_value}}
    if project.nekonstruktiv_wildcard:
        return {"wildcard": {project.theme_field: project.nekonstruktiv_wildcard}}
    return None


def _operator_end_filter(project: ProjectConfig) -> dict | None:
    if not project.end_call_field:
        return None
    field_path = f"file.properties.{project.end_call_field}"
    return {"term": {field_path: project.operator_end_value}}


def _nested_stage_filter(stage_id: str) -> dict:
    return {
        "nested": {
            "path": "document_stages",
            "query": {"term": {"document_stages.id": stage_id}},
        }
    }


def build_operator_agg_body(
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> dict:
    nek_filter = _nekonstruktiv_filter(project)
    end_filter = _operator_end_filter(project)

    sub_aggs: dict[str, Any] = {
        "nekonstruktiv": {"filter": nek_filter or {"match_none": {}}},
        "operator_ended": {"filter": end_filter or {"match_none": {}}},
        "qc_verified": {"filter": _nested_stage_filter(STAGE_QC_VERIFIED)},
        "monitoring": {"filter": _nested_stage_filter(STAGE_MONITORING)},
        "qc_avg_weight": {
            "filter": _nested_stage_filter(STAGE_QC_VERIFIED),
            "aggs": {"value": {"avg": {"field": WEIGHT_FIELD}}},
        },
    }

    if project.has_client_sentiment:
        sub_aggs["client_neg_avg"] = {"avg": {"field": CLIENT_NEG_FIELD}}

    sub_aggs["avg_interruptions"] = {
        "avg": {"field": "interruptions.operator_interruptions_count"}
    }

    return {
        "filters": [_date_range_filter(start, end)],
        "aggs": {
            "by_operator": {
                "terms": {"field": OPERATOR_FIELD, "size": 500, "min_doc_count": 1},
                "aggs": sub_aggs,
            }
        },
    }


def build_status_agg_body(start: datetime, end: datetime, status_field: str) -> dict:
    return {
        "filters": [_date_range_filter(start, end)],
        "aggs": {
            "by_operator": {
                "terms": {"field": OPERATOR_FIELD, "size": 500},
                "aggs": {
                    "by_status": {
                        "terms": {"field": status_field, "size": 50},
                    },
                    "operator_ended": {
                        "filter": {"term": {"file.properties.OperatorEndCall": 1}},
                    },
                    "client_neg_avg": {
                        "avg": {"field": CLIENT_NEG_FIELD},
                    },
                },
            },
            "all_statuses": {
                "terms": {"field": status_field, "size": 50},
            },
        },
    }


def build_daily_agg_body(
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> dict:
    nek_filter = _nekonstruktiv_filter(project)
    aggs: dict[str, Any] = {
        "by_day": {
            "date_histogram": {
                "field": "created_date",
                "calendar_interval": "day",
                "min_doc_count": 0,
            },
            "aggs": {
                "nekonstruktiv": {"filter": nek_filter or {"match_none": {}}},
            },
        }
    }
    if project.has_client_sentiment:
        aggs["by_day"]["aggs"]["client_neg_avg"] = {"avg": {"field": CLIENT_NEG_FIELD}}

    return {
        "filters": [_date_range_filter(start, end)],
        "aggs": aggs,
    }


def _bucket_count(bucket: dict, sub_name: str) -> int:
    sub = bucket.get(sub_name, {})
    return int(sub.get("doc_count", 0))


def _parse_operator_buckets(buckets: list[dict], project: ProjectConfig) -> dict[str, OperatorMetrics]:
    result: dict[str, OperatorMetrics] = {}
    for bucket in buckets:
        name = bucket.get("key")
        if not name or name == "":
            continue
        op = result.setdefault(str(name), OperatorMetrics(operator=str(name)))
        op.total_calls += int(bucket.get("doc_count", 0))
        op.nekonstruktiv_count += _bucket_count(bucket, "nekonstruktiv")
        op.operator_end_count += _bucket_count(bucket, "operator_ended")
        if project.end_call_field:
            op.end_call_total += int(bucket.get("doc_count", 0))
        op.qc_verified_count += _bucket_count(bucket, "qc_verified")
        op.monitoring_count += _bucket_count(bucket, "monitoring")

        qc_avg = bucket.get("qc_avg_weight", {}).get("value", {})
        if qc_avg and qc_avg.get("value") is not None:
            op.qc_weight_sum += float(qc_avg["value"]) * _bucket_count(bucket, "qc_verified")

        if project.has_client_sentiment:
            voice_calls = int(bucket.get("doc_count", 0))
            avg_neg = bucket.get("client_neg_avg", {}).get("value")
            if voice_calls and avg_neg is not None:
                # Среднее по всем голосовым звонкам, включая 0% (как в UI TouchPoint)
                op.client_neg_sum += float(avg_neg) * voice_calls
                op.client_neg_count += voice_calls

        intr = bucket.get("avg_interruptions", {}).get("value")
        if intr is not None:
            op.interruptions_sum += float(intr) * int(bucket.get("doc_count", 0))
            op.interruptions_count += int(bucket.get("doc_count", 0))

        op.projects.add(project.id)
    return result


def merge_operator_metrics(
    target: dict[str, OperatorMetrics],
    source: dict[str, OperatorMetrics],
) -> dict[str, OperatorMetrics]:
    for name, metrics in source.items():
        if name not in target:
            target[name] = OperatorMetrics(operator=name)
        t = target[name]
        t.total_calls += metrics.total_calls
        t.nekonstruktiv_count += metrics.nekonstruktiv_count
        t.client_neg_sum += metrics.client_neg_sum
        t.client_neg_count += metrics.client_neg_count
        t.operator_end_count += metrics.operator_end_count
        t.end_call_total += metrics.end_call_total
        t.qc_verified_count += metrics.qc_verified_count
        t.qc_weight_sum += metrics.qc_weight_sum
        t.monitoring_count += metrics.monitoring_count
        t.interruptions_sum += metrics.interruptions_sum
        t.interruptions_count += metrics.interruptions_count
        t.llm_burnout_sum += metrics.llm_burnout_sum
        t.llm_burnout_count += metrics.llm_burnout_count
        t.llm_empathy_sum += metrics.llm_empathy_sum
        t.llm_empathy_count += metrics.llm_empathy_count
        t.llm_engagement_sum += metrics.llm_engagement_sum
        t.llm_engagement_count += metrics.llm_engagement_count
        t.llm_high_risk_count += metrics.llm_high_risk_count
        t.llm_premature_closure_count += metrics.llm_premature_closure_count
        t.projects |= metrics.projects
    return target


def _apply_burnout_stats(metrics: dict[str, OperatorMetrics], burnout: dict) -> None:
    for name, stats in burnout.items():
        op = metrics.setdefault(name, OperatorMetrics(operator=name))
        op.llm_burnout_sum += stats.risk_sum
        op.llm_burnout_count += stats.sample_count
        op.llm_empathy_sum += stats.empathy_sum
        op.llm_empathy_count += stats.empathy_count
        op.llm_engagement_sum += stats.engagement_sum
        op.llm_engagement_count += stats.engagement_count
        op.llm_high_risk_count += stats.high_risk_count
        op.llm_premature_closure_count += stats.premature_closure_count


def fetch_operator_metrics(
    client: TouchPointClient,
    projects: list[ProjectConfig],
    start: datetime,
    end: datetime,
    *,
    include_burnout: bool = True,
    period_label: str = "период",
    burnout_cache: dict[str, dict] | None = None,
) -> dict[str, OperatorMetrics]:
    _log_period(period_label, start, end)
    combined: dict[str, OperatorMetrics] = {}
    for project in projects:
        body = build_operator_agg_body(project, start, end)
        log.debug(
            "aggregate %s (%s) body=%s",
            project.name,
            project.id,
            json.dumps(body, ensure_ascii=False)[:800],
        )
        try:
            resp = client.aggregate(project.id, body)
        except Exception as exc:
            log.exception(
                "ОШИБКА aggregate %s (%s): %s",
                project.name,
                project.id,
                exc,
            )
            continue

        buckets, summary = _extract_agg_buckets(resp, "by_operator")
        log.info(
            "aggregate %s (%s): buckets=%s summary=%s",
            project.name,
            project.id,
            len(buckets),
            summary,
        )
        if not buckets:
            log.warning(
                "aggregate %s: нет buckets by_operator. Фрагмент ответа: %s",
                project.name,
                json.dumps(resp, ensure_ascii=False)[:1200],
            )

        parsed = _parse_operator_buckets(buckets, project)
        log.info("  распознано операторов в проекте: %d", len(parsed))
        merge_operator_metrics(combined, parsed)

        if include_burnout and project.burnout_form_item_number:
            burnout = fetch_burnout_by_operator(client, project, start, end)
            if burnout_cache is not None:
                burnout_cache[project.id] = burnout
            log.info(
                "  LLM burnout %s: операторов с оценкой=%d",
                project.name,
                len(burnout),
            )
            _apply_burnout_stats(combined, burnout)

    _log_operator_distribution(combined, period_label)
    return combined


def fetch_project_operator_rows(
    client: TouchPointClient,
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> list[ProjectOperatorRow]:
    body = build_operator_agg_body(project, start, end)
    try:
        resp = client.aggregate(project.id, body)
    except Exception:
        return []

    rows: list[ProjectOperatorRow] = []
    buckets = resp.get("aggregations", {}).get("by_operator", {}).get("buckets", [])
    for bucket in buckets:
        name = bucket.get("key")
        if not name:
            continue
        m = _parse_operator_buckets([bucket], project)[str(name)]
        rows.append(
            ProjectOperatorRow(
                project_id=project.id,
                project_name=project.name,
                group=project.group,
                operator=str(name),
                total_calls=m.total_calls,
                nekonstruktiv_pct=m.nekonstruktiv_pct,
                client_neg_pct=m.client_neg_pct,
                operator_end_pct=m.operator_end_pct,
                qc_avg_weight=m.qc_avg_weight,
                monitoring_pct=m.monitoring_pct,
            )
        )
    return rows


def fetch_tm_data(
    client: TouchPointClient,
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> tuple[list[TMOperatorRow], list[str]]:
    body = build_status_agg_body(start, end, project.status_field)
    try:
        resp = client.aggregate(project.id, body)
    except Exception:
        return [], list(TM_STATUS_NAMES)

    aggs = resp.get("aggregations", {})
    status_names = [b["key"] for b in aggs.get("all_statuses", {}).get("buckets", []) if b.get("key")]
    if not status_names:
        status_names = list(TM_STATUS_NAMES)

    rows: list[TMOperatorRow] = []
    for bucket in aggs.get("by_operator", {}).get("buckets", []):
        name = bucket.get("key")
        if not name:
            continue
        total = int(bucket.get("doc_count", 0))
        status_counts = {
            str(sb["key"]): int(sb["doc_count"])
            for sb in bucket.get("by_status", {}).get("buckets", [])
            if sb.get("key")
        }
        status_pcts = {k: _pct(v, total) for k, v in status_counts.items()}
        client_neg = bucket.get("client_neg_avg", {}).get("value") or 0.0
        rows.append(
            TMOperatorRow(
                operator=str(name),
                total_calls=total,
                operator_end_pct=_pct(_bucket_count(bucket, "operator_ended"), total),
                client_neg_pct=round(float(client_neg) * 100, 2),
                status_counts=status_counts,
                status_pcts=status_pcts,
            )
        )
    return rows, status_names


def fetch_daily_series(
    client: TouchPointClient,
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> list[dict]:
    body = build_daily_agg_body(project, start, end)
    try:
        resp = client.aggregate(project.id, body)
    except Exception:
        return []

    series = []
    for bucket in resp.get("aggregations", {}).get("by_day", {}).get("buckets", []):
        total = int(bucket.get("doc_count", 0))
        nek = _bucket_count(bucket, "nekonstruktiv")
        row: dict[str, Any] = {
            "date": bucket.get("key_as_string", bucket.get("key")),
            "total": total,
            "nekonstruktiv_pct": _pct(nek, total),
        }
        if project.has_client_sentiment:
            avg_neg = bucket.get("client_neg_avg", {}).get("value")
            row["client_neg_pct"] = round((avg_neg or 0) * 100, 2)
        series.append(row)
    return series


def compute_operator_scores(
    current: dict[str, OperatorMetrics],
    baseline: dict[str, OperatorMetrics],
    *,
    sp_project_ids: set[str],
    vip_project_ids: set[str],
) -> list[OperatorScore]:
    scores: list[OperatorScore] = []

    log.info(
        "compute_operator_scores: вход=%d операторов, порог calls>=%d",
        len(current),
        MIN_CALLS_PER_OPERATOR,
    )

    for name, cur in current.items():
        if cur.total_calls < MIN_CALLS_PER_OPERATOR:
            continue

        base = baseline.get(name)
        triggers: list[str] = []
        score = 0.0

        sp_calls = sum(
            1 for pid in cur.projects if pid in sp_project_ids
        )
        vip_calls = sum(
            1 for pid in cur.projects if pid in vip_project_ids
        )

        # T1 — неконструктив СП
        if sp_calls and base:
            sp_cur_pct = _sp_nek_pct(cur, sp_project_ids)
            sp_base_pct = _sp_nek_pct(base, sp_project_ids)
            delta = sp_cur_pct - sp_base_pct
            if delta >= TRIGGER_DELTA_PCT:
                triggers.append("T1: неконструктив СП ↑")
                score += SCORE_WEIGHTS["t1_sp_nekonstruktiv"]

        # T2 — неконструктив VIP
        if vip_calls and base:
            vip_cur_pct = _vip_nek_pct(cur, vip_project_ids)
            vip_base_pct = _vip_nek_pct(base, vip_project_ids)
            if vip_cur_pct - vip_base_pct >= TRIGGER_DELTA_PCT:
                triggers.append("T2: неконструктив VIP ↑")
                score += SCORE_WEIGHTS["t2_vip_nekonstruktiv"]

        # T3 — негатив клиента
        if cur.client_neg_count and base and base.client_neg_count:
            cur_neg = cur.client_neg_pct
            base_neg = base.client_neg_pct
            if cur_neg - base_neg >= TRIGGER_DELTA_PCT:
                triggers.append("T3: негатив клиента ↑")
                score += SCORE_WEIGHTS["t3_client_negative"]

        # T4 — завершение оператором
        if base and cur.operator_end_pct - base.operator_end_pct >= TRIGGER_DELTA_PCT:
            triggers.append("T4: завершение оператором ↑")
            score += SCORE_WEIGHTS["t4_operator_end"]

        # T5-QC — оценка после ОКК
        if (
            cur.qc_verified_count >= MIN_QC_CHECKS_FOR_T5
            and base
            and base.qc_avg_weight is not None
            and cur.qc_avg_weight is not None
            and base.qc_avg_weight - cur.qc_avg_weight >= QC_SCORE_DROP / 100
        ):
            triggers.append("T5-QC: оценка ОКК ↓")
            score += SCORE_WEIGHTS["t5_qc_score"]

        # T6–T10 — поведение (≥2 из набора)
        behavior_hits = 0
        if base and cur.monitoring_pct - base.monitoring_pct >= TRIGGER_DELTA_PCT:
            behavior_hits += 1
        if base and cur.avg_interruptions - base.avg_interruptions >= 0.5:
            behavior_hits += 1
        if cur.operator_end_pct >= 40:
            behavior_hits += 1
        if cur.nekonstruktiv_pct >= 15:
            behavior_hits += 1
        if behavior_hits >= 2:
            triggers.append("T6–T10: поведение")
            score += SCORE_WEIGHTS["t6_behavior"]

        # T11 — LLM burnout (form_items, промпт выгорания)
        if cur.llm_burnout_count >= MIN_LLM_SAMPLES:
            t11_hit = False
            if cur.llm_burnout_avg is not None and cur.llm_burnout_avg >= LLM_BURNOUT_TRIGGER_SCORE:
                t11_hit = True
            elif (
                base
                and base.llm_burnout_count >= MIN_LLM_SAMPLES
                and cur.llm_burnout_avg is not None
                and base.llm_burnout_avg is not None
                and cur.llm_burnout_avg - base.llm_burnout_avg >= LLM_BURNOUT_DELTA
            ):
                t11_hit = True
            if t11_hit:
                triggers.append("T11: LLM burnout")
                score += SCORE_WEIGHTS["t11_llm_burnout"]

        trend_nek = None
        trend_neg = None
        trend_end = None
        if base:
            trend_nek = round(cur.nekonstruktiv_pct - base.nekonstruktiv_pct, 2)
            trend_neg = round(cur.client_neg_pct - base.client_neg_pct, 2)
            trend_end = round(cur.operator_end_pct - base.operator_end_pct, 2)

        is_at_risk = len(triggers) >= RISK_MIN_TRIGGERS or score >= RISK_SCORE_THRESHOLD

        scores.append(
            OperatorScore(
                operator=name,
                total_calls=cur.total_calls,
                composite_score=round(score, 1),
                active_triggers=triggers,
                is_at_risk=is_at_risk,
                metrics=cur,
                baseline=base,
                trend_nekonstruktiv=trend_nek,
                trend_client_neg=trend_neg,
                trend_operator_end=trend_end,
            )
        )

    scores.sort(key=lambda s: (-s.composite_score, -s.metrics.nekonstruktiv_pct))
    log.info("compute_operator_scores: в рейтинг попало %d операторов", len(scores))
    return scores


def _sp_nek_pct(m: OperatorMetrics, sp_ids: set[str]) -> float:
    if not any(pid in sp_ids for pid in m.projects):
        return 0.0
    return m.nekonstruktiv_pct


def _vip_nek_pct(m: OperatorMetrics, vip_ids: set[str]) -> float:
    if not any(pid in vip_ids for pid in m.projects):
        return 0.0
    return m.nekonstruktiv_pct
