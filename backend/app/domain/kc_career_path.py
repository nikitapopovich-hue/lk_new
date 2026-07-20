from __future__ import annotations

import json
import uuid
from typing import Any

from app.domain.kc_format import format_kc_date_string

CareerStep = dict[str, str]


def _new_step_id() -> str:
    return uuid.uuid4().hex[:12]


def _normalize_step(raw: dict[str, Any]) -> CareerStep | None:
    if not isinstance(raw, dict):
        return None
    date = format_kc_date_string(str(raw.get("date") or ""))
    title = str(raw.get("title") or "").strip()
    department = str(raw.get("department") or "").strip()
    subdivision = str(raw.get("subdivision") or "").strip()
    note = str(raw.get("note") or "").strip()
    if not date and not title and not department and not subdivision and not note:
        return None
    step_id = str(raw.get("id") or "").strip() or _new_step_id()
    return {
        "id": step_id,
        "date": date,
        "title": title,
        "department": department,
        "subdivision": subdivision,
        "note": note,
    }


def _parse_date_key(date_str: str) -> tuple[int, int, int]:
    text = format_kc_date_string(date_str)
    parts = text.split(".")
    if len(parts) == 3:
        try:
            d, mo, y = int(parts[0]), int(parts[1]), int(parts[2])
            return (y, mo, d)
        except ValueError:
            pass
    return (9999, 12, 31)


def _is_empty_date(date_str: str) -> bool:
    return not format_kc_date_string(date_str or "")


def sort_career_steps_for_edit(steps: list[CareerStep]) -> list[CareerStep]:
    """От раннего к позднему; пустые даты в конце, стабильный порядок ввода."""
    indexed = list(enumerate(steps))

    def sort_key(item: tuple[int, CareerStep]) -> tuple[int, int, int]:
        idx, step = item
        if _is_empty_date(step.get("date", "")):
            return (1, 0, idx)
        return (0, _parse_date_key(step.get("date", "")), idx)

    return [step for _, step in sorted(indexed, key=sort_key)]


def sort_career_steps(steps: list[CareerStep], *, newest_first: bool = True) -> list[CareerStep]:
    ordered = sort_career_steps_for_edit(steps)
    if newest_first:
        ordered.reverse()
    return ordered


def parse_career_path(raw_json: str, legacy_date: str = "") -> list[CareerStep]:
    steps: list[CareerStep] = []
    text = (raw_json or "").strip()
    if text:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, list):
            for item in data:
                step = _normalize_step(item) if isinstance(item, dict) else None
                if step:
                    steps.append(step)
    if not steps:
        legacy = format_kc_date_string(legacy_date) if legacy_date else ""
        if legacy:
            steps.append(
                {
                    "id": _new_step_id(),
                    "date": legacy,
                    "title": "Переход / повышение",
                    "department": "",
                    "subdivision": "",
                    "note": "",
                }
            )
    return steps


def dump_career_path(steps: list[CareerStep]) -> str:
    cleaned: list[CareerStep] = []
    for raw in steps:
        if not isinstance(raw, dict):
            continue
        step = _normalize_step(raw)
        if step:
            cleaned.append(step)
    return json.dumps(cleaned, ensure_ascii=False)
