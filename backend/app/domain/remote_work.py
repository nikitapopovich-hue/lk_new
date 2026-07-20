from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from app.auth.identity import Identity, user_face_name
from app.infra.models import EmployeeProfile

REMOTE_WORK_ACTUALIZE_DAYS = 30
DEFAULT_DEPARTMENT = "Служба поддержки"

RemoteWorkStatus = Literal["empty", "filled", "stale"]


def face_name_from_identity(identity: Identity) -> str:
    return user_face_name(identity).strip() or identity.name.strip() or identity.email.split("@")[0]


def resolve_department(email: str, stored: str) -> str:
    dept = (stored or "").strip()
    if dept:
        return dept
    return DEFAULT_DEPARTMENT


def remote_work_field_values(row: EmployeeProfile) -> list[str]:
    return [
        (row.home_address or "").strip(),
        (row.internet_provider or "").strip(),
        (row.patch_cord_length or "").strip(),
        (row.has_pc_laptop or "").strip(),
        (row.can_work_programs_home or "").strip(),
        (row.internet_access or "").strip(),
        (row.has_headset or "").strip(),
    ]


def has_remote_work_data(row: EmployeeProfile) -> bool:
    """Анкета считается заполненной только когда указаны все обязательные поля."""
    return all(remote_work_field_values(row))


def remote_work_status(row: EmployeeProfile, *, now: datetime | None = None) -> RemoteWorkStatus:
    if not has_remote_work_data(row):
        return "empty"
    ref = now or datetime.now(timezone.utc)
    updated = row.updated_at
    if updated is not None and updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    if updated and ref - updated > timedelta(days=REMOTE_WORK_ACTUALIZE_DAYS):
        return "stale"
    return "filled"


def needs_remote_work_actualization(row: EmployeeProfile, *, now: datetime | None = None) -> bool:
    return remote_work_status(row, now=now) in ("empty", "stale")


def display_full_name(row: EmployeeProfile, mapping_name: str = "") -> str:
    stored = (row.full_name or "").strip()
    if stored:
        return stored
    mapped = (mapping_name or "").strip()
    if mapped:
        return mapped
    return ""


def current_month_key(now: datetime | None = None) -> str:
    ref = now or datetime.now(timezone.utc)
    return ref.strftime("%Y-%m")
