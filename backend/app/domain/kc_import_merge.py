from __future__ import annotations

from typing import Any

from app.domain.kc_career_path import parse_career_path
from app.domain.name_match import key_full, key_last_first

MERGE_SCALAR_FIELDS: tuple[str, ...] = (
    "department",
    "subdivision",
    "line",
    "company",
    "city",
    "position",
    "grade_new",
    "email_new",
    "phone",
    "residence_address",
    "telegram_username",
    "account_number",
    "account_number_extra",
    "telegram_id",
    "birth_date",
    "first_work_day",
    "access_date",
)

PROTECTED_FIELDS: frozenset[str] = frozenset({"photo_url", "express_id", "full_name", "sort_order"})


def _is_empty(value: str | None) -> bool:
    return not (value or "").strip()


def build_employee_match_index(
    employees: list[Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Индекс существующих сотрудников: полное ФИО и «фамилия имя» (без отчества)."""
    by_full: dict[str, Any] = {}
    by_last_first: dict[str, Any] = {}
    ambiguous_last_first: set[str] = set()

    for emp in employees:
        full_key = key_full(getattr(emp, "full_name", "") or "")
        if full_key:
            by_full.setdefault(full_key, emp)

        lf_key = key_last_first(getattr(emp, "full_name", "") or "")
        if not lf_key:
            continue
        if lf_key in by_last_first and by_last_first[lf_key] is not emp:
            ambiguous_last_first.add(lf_key)
        else:
            by_last_first[lf_key] = emp

    for dup in ambiguous_last_first:
        by_last_first.pop(dup, None)

    return by_full, by_last_first


def resolve_import_match(
    imported: dict[str, str],
    by_full: dict[str, Any],
    by_last_first: dict[str, Any],
) -> Any | None:
    name = imported.get("full_name", "")
    full_key = key_full(name)
    if full_key and full_key in by_full:
        return by_full[full_key]

    imp_email = (imported.get("email_new") or "").strip().lower()
    if imp_email:
        for emp in by_full.values():
            existing_email = (getattr(emp, "email_new", "") or "").strip().lower()
            if existing_email and existing_email == imp_email:
                return emp

    lf_key = key_last_first(name)
    if lf_key and lf_key in by_last_first:
        candidate = by_last_first[lf_key]
        existing_email = (getattr(candidate, "email_new", "") or "").strip().lower()
        if imp_email and existing_email and imp_email != existing_email:
            return None
        return candidate

    return None


def merge_row_into_employee(row: Any, imported: dict[str, str]) -> bool:
    """Дополняет пустые поля карточки. Фото, express_id и заполненные поля не трогает."""
    changed = False

    for field in MERGE_SCALAR_FIELDS:
        new_val = (imported.get(field) or "").strip()
        if not new_val:
            continue
        current = (getattr(row, field, "") or "").strip()
        if _is_empty(current):
            setattr(row, field, new_val)
            changed = True

    existing_steps = parse_career_path(
        getattr(row, "career_path", "[]") or "[]",
        getattr(row, "leave_or_transfer_date", "") or "",
    )
    if not existing_steps:
        imp_career = (imported.get("career_path") or "").strip()
        if imp_career and imp_career != "[]":
            row.career_path = imp_career
            changed = True

    return changed


def new_employee_kwargs(imported: dict[str, str]) -> dict[str, str]:
    data = dict(imported)
    data["photo_url"] = ""
    data["express_id"] = ""
    return data


def register_employee_in_index(
    emp: Any,
    imported: dict[str, str],
    by_full: dict[str, Any],
    by_last_first: dict[str, Any],
) -> None:
    full_key = key_full(imported.get("full_name", ""))
    if full_key and full_key not in by_full:
        by_full[full_key] = emp

    lf_key = key_last_first(imported.get("full_name", ""))
    if lf_key and lf_key not in by_last_first:
        by_last_first[lf_key] = emp
