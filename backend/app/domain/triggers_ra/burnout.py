"""Загрузка и разбор LLM-оценки выгорания из form_items."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.domain.triggers_ra.config import ProjectConfig
from app.domain.triggers_ra.touchpoint_client import TouchPointClient

log = logging.getLogger("triger")

FORM_ITEMS_KEYS = ("form_items", "_external_data.form_items", "file.properties.form_items")
BURNOUT_MARKER = "burnout_risk_score"
SEARCH_PAGE_SIZE = 500
MAX_BURNOUT_DOCS = 5000

_resolved_form_ids: dict[str, str] = {}


@dataclass
class BurnoutSample:
    risk_score: float
    empathy_score: float | None = None
    engagement_score: float | None = None
    premature_closure: bool = False
    burnout_level: str | None = None


@dataclass
class OperatorBurnoutStats:
    operator: str
    sample_count: int = 0
    risk_sum: float = 0.0
    empathy_sum: float = 0.0
    empathy_count: int = 0
    engagement_sum: float = 0.0
    engagement_count: int = 0
    high_risk_count: int = 0
    premature_closure_count: int = 0

    @property
    def avg_risk(self) -> float | None:
        if not self.sample_count:
            return None
        return round(self.risk_sum / self.sample_count, 1)

    @property
    def avg_empathy(self) -> float | None:
        if not self.empathy_count:
            return None
        return round(self.empathy_sum / self.empathy_count, 1)

    @property
    def avg_engagement(self) -> float | None:
        if not self.engagement_count:
            return None
        return round(self.engagement_sum / self.engagement_count, 1)

    @property
    def premature_closure_pct(self) -> float:
        if not self.sample_count:
            return 0.0
        return round(100.0 * self.premature_closure_count / self.sample_count, 2)


def extract_search_items(payload: dict[str, Any]) -> list[dict]:
    for key in ("documents", "items", "results", "hits", "list", "data", "content", "rows"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            for nested in ("documents", "items", "results", "hits", "list", "content", "rows"):
                nested_value = value.get(nested)
                if isinstance(nested_value, list):
                    return nested_value
    return []


def _get_nested(data: dict, path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _get_form_items(fields: dict[str, Any]) -> list[dict]:
    for key in FORM_ITEMS_KEYS:
        raw = _get_nested(fields, key) if "." in key else fields.get(key)
        if raw is None:
            continue
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                continue
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
        if isinstance(raw, dict):
            return [{"id": k, "value": v.get("value") if isinstance(v, dict) else v} for k, v in raw.items()]
    return []


def _get_operator_name(fields: dict[str, Any]) -> str | None:
    for key in ("file.properties.operator", "operator"):
        value = _get_nested(fields, key) if "." in key else fields.get(key)
        if value:
            return str(value).strip()
    file_block = fields.get("file")
    if isinstance(file_block, dict):
        props = file_block.get("properties") or {}
        if props.get("operator"):
            return str(props["operator"]).strip()
    return None


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        payload = json.loads(text)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    payload = json.loads(text[start : i + 1])
                    return payload if isinstance(payload, dict) else None
                except json.JSONDecodeError:
                    return None
    return None


def parse_burnout_value(raw_value: str) -> BurnoutSample | None:
    if not raw_value:
        return None
    text = str(raw_value).strip()
    if BURNOUT_MARKER not in text:
        return None

    payload = _extract_json_object(text)
    if not payload:
        return None

    score = payload.get("burnout_risk_score")
    if score is None:
        return None
    try:
        risk = float(score)
    except (TypeError, ValueError):
        return None

    empathy = payload.get("empathy_score")
    engagement = payload.get("engagement_score")
    premature = payload.get("premature_closure", False)

    return BurnoutSample(
        risk_score=risk,
        empathy_score=float(empathy) if empathy is not None else None,
        engagement_score=float(engagement) if engagement is not None else None,
        premature_closure=bool(premature),
        burnout_level=str(payload.get("burnout_level")) if payload.get("burnout_level") else None,
    )


def find_burnout_in_fields(
    fields: dict[str, Any],
    *,
    preferred_form_item_id: str | None = None,
) -> tuple[BurnoutSample | None, str | None]:
    items = _get_form_items(fields)
    if preferred_form_item_id:
        for item in items:
            if str(item.get("id")) == str(preferred_form_item_id):
                sample = parse_burnout_value(str(item.get("value", "")))
                if sample:
                    return sample, str(item["id"])

    for item in items:
        sample = parse_burnout_value(str(item.get("value", "")))
        if sample:
            return sample, str(item.get("id"))
    return None, None


def _date_range_filter(start: datetime, end: datetime) -> dict:
    return {
        "range": {
            "created_date": {
                "gte": start.strftime("%Y-%m-%dT%H:%M:%S"),
                "lte": end.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        }
    }


def _discover_burnout_form_item_id(client: TouchPointClient, project: ProjectConfig) -> str | None:
    """Ищет id form_items с JSON промпта (старые id в config могут быть другими полями)."""
    filters: list[dict] = [
        {"wildcard": {"form_items.value": f"*{BURNOUT_MARKER}*"}},
    ]
    body = {
        "query": "*",
        "filters": filters,
        "fetch_fields": ["form_items"],
        "limit": 20,
        "offset": 0,
        "sort": [{"created_date": "desc"}],
    }
    try:
        payload = client.search_documents(project.id, body)
    except Exception as exc:
        log.warning("discover form_item_id %s: %s", project.name, exc)
        return None

    id_counts: dict[str, int] = {}
    for doc in extract_search_items(payload):
        fields = doc.get("fields") or doc
        _, form_id = find_burnout_in_fields(fields)
        if form_id:
            id_counts[form_id] = id_counts.get(form_id, 0) + 1

    if id_counts:
        form_id = max(id_counts, key=id_counts.get)
        log.info(
            "form_item_id %s: %s (обнаружен по burnout JSON, совпадений=%d)",
            project.name,
            form_id,
            id_counts[form_id],
        )
        return form_id

    # Запасной путь: пункт формы по номеру (если промпт ещё не отработал ни на одном документе)
    if project.burnout_form_item_number:
        body_no_filter = {
            "query": "*",
            "filters": [],
            "fetch_fields": ["form_items"],
            "limit": 30,
            "sort": [{"created_date": "desc"}],
        }
        try:
            payload = client.search_documents(project.id, body_no_filter)
        except Exception:
            return None
        idx = project.burnout_form_item_number - 1
        for doc in extract_search_items(payload):
            items = _get_form_items(doc.get("fields") or doc)
            if 0 <= idx < len(items):
                return str(items[idx]["id"])

    return None


def resolve_burnout_form_item_id(client: TouchPointClient, project: ProjectConfig) -> str | None:
    if project.id in _resolved_form_ids:
        return _resolved_form_ids[project.id]

    form_id = _discover_burnout_form_item_id(client, project)
    if form_id:
        _resolved_form_ids[project.id] = form_id
        return form_id

    log.warning(
        "form_item_id %s: промпт выгорания не найден (пункт формы #%s)",
        project.name,
        project.burnout_form_item_number,
    )
    return None


def _search_burnout_documents(
    client: TouchPointClient,
    project_id: str,
    start: datetime,
    end: datetime,
) -> list[dict]:
    filters = [
        _date_range_filter(start, end),
        {"wildcard": {"form_items.value": f"*{BURNOUT_MARKER}*"}},
    ]
    body_template = {
        "query": "*",
        "filters": filters,
        "fetch_fields": ["form_items", "file.properties.operator", "file", "created_date"],
        "sort": [{"created_date": "asc"}],
    }

    documents: list[dict] = []
    offset = 0
    while len(documents) < MAX_BURNOUT_DOCS:
        body = {**body_template, "offset": offset, "limit": SEARCH_PAGE_SIZE}
        payload = client.search_documents(project_id, body)
        batch = extract_search_items(payload)
        if not batch:
            break
        documents.extend(batch)
        if len(batch) < SEARCH_PAGE_SIZE:
            break
        offset += SEARCH_PAGE_SIZE

    if len(documents) >= MAX_BURNOUT_DOCS:
        log.warning("burnout project %s: достигнут лимит %d документов", project_id, MAX_BURNOUT_DOCS)
    return documents


def fetch_burnout_by_operator(
    client: TouchPointClient,
    project: ProjectConfig,
    start: datetime,
    end: datetime,
) -> dict[str, OperatorBurnoutStats]:
    form_item_id = resolve_burnout_form_item_id(client, project)

    try:
        documents = _search_burnout_documents(client, project.id, start, end)
    except Exception as exc:
        log.exception("burnout search %s failed: %s", project.name, exc)
        return {}

    parsed = 0
    no_operator = 0
    stats: dict[str, OperatorBurnoutStats] = {}

    for doc in documents:
        fields = doc.get("fields") or doc
        operator = _get_operator_name(fields)
        if not operator:
            no_operator += 1
            continue
        sample, found_id = find_burnout_in_fields(fields, preferred_form_item_id=form_item_id)
        if sample is None:
            continue
        parsed += 1
        if found_id and project.id not in _resolved_form_ids:
            _resolved_form_ids[project.id] = found_id

        row = stats.setdefault(operator, OperatorBurnoutStats(operator=operator))
        row.sample_count += 1
        row.risk_sum += sample.risk_score
        if sample.risk_score >= 61:
            row.high_risk_count += 1
        if sample.premature_closure:
            row.premature_closure_count += 1
        if sample.empathy_score is not None:
            row.empathy_sum += sample.empathy_score
            row.empathy_count += 1
        if sample.engagement_score is not None:
            row.engagement_sum += sample.engagement_score
            row.engagement_count += 1

    log.info(
        "burnout %s: docs=%d parsed=%d operators=%d no_operator=%d form_item=%s",
        project.name,
        len(documents),
        parsed,
        len(stats),
        no_operator,
        form_item_id or _resolved_form_ids.get(project.id, "?"),
    )
    return stats


def merge_burnout_stats(
    target: dict[str, OperatorBurnoutStats],
    source: dict[str, OperatorBurnoutStats],
) -> dict[str, OperatorBurnoutStats]:
    for name, src in source.items():
        dst = target.setdefault(name, OperatorBurnoutStats(operator=name))
        dst.sample_count += src.sample_count
        dst.risk_sum += src.risk_sum
        dst.empathy_sum += src.empathy_sum
        dst.empathy_count += src.empathy_count
        dst.engagement_sum += src.engagement_sum
        dst.engagement_count += src.engagement_count
        dst.high_risk_count += src.high_risk_count
        dst.premature_closure_count += src.premature_closure_count
    return target
