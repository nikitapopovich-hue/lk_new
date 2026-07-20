from __future__ import annotations

from app.core.config import Settings

Role = str  # operator | supervisor | superadmin


def _superadmin_allowlist(settings: Settings) -> set[str]:
    return {e.strip().lower() for e in settings.superadmin_emails.split(",") if e.strip()}


def can_use_superadmin(email: str, settings: Settings) -> bool:
    allow = _superadmin_allowlist(settings)
    if not allow:
        return settings.app_env == "development"
    return email.strip().lower() in allow


def resolve_preferred_role(email: str, requested: str, settings: Settings) -> Role:
    role = requested if requested in ("operator", "supervisor", "superadmin") else "operator"
    if role == "superadmin" and not can_use_superadmin(email, settings):
        return "supervisor"
    return role
