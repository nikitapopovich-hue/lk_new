from __future__ import annotations

import json
import re
import uuid
from typing import Any


def parse_extra_data(raw: str) -> dict[str, str]:
    if not (raw or "").strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) if v is not None else "" for k, v in data.items()}


def dump_extra_data(data: dict[str, str]) -> str:
    cleaned = {k: (v or "").strip() for k, v in data.items() if k}
    return json.dumps(cleaned, ensure_ascii=False)


def slug_field_key(label: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", label.strip().lower())
    base = base.strip("_") or "field"
    return f"cf_{base}_{uuid.uuid4().hex[:8]}"
