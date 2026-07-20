from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.auth.identity import Identity, get_identity
from app.core.config import Settings, get_settings
from app.domain.kc_office_locations import KC_OFFICES
from app.domain.kc_residence_distance import residence_geo_info
from app.domain.kc_career_path import dump_career_path, parse_career_path
from app.domain.kc_data_fields import KC_FIELD_DEFINITIONS, KC_FIELD_KEYS
from app.domain.kc_extra_data import dump_extra_data, parse_extra_data, slug_field_key
from app.domain.kc_format import normalize_kc_field_value
from app.domain.kc_import import (
    build_template_xlsx,
    employee_to_export_row,
    enforce_import_row_limits,
    parse_import_file,
)
from app.domain.kc_import_merge import (
    build_employee_match_index,
    merge_row_into_employee,
    new_employee_kwargs,
    register_employee_in_index,
    resolve_import_match,
)
from app.integrations.express import fill_express_id_if_empty

logger = logging.getLogger(__name__)
from app.infra.models import KcCustomFieldDef, KcEmployee, KcFieldVisibility, KcSubdivision

_ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
_MAX_PHOTO_BYTES = 5 * 1024 * 1024

router = APIRouter()

_CHROMA_PALETTE = [
    ("#00c7b1", "linear-gradient(145deg, rgba(0,199,177,0.28) 0%, rgba(6,11,38,0.92) 48%, rgba(2,5,21,1) 100%)"),
    ("#753bbd", "linear-gradient(210deg, rgba(117,59,189,0.32) 0%, rgba(26,31,55,0.9) 50%, rgba(2,5,21,1) 100%)"),
    ("#34d9c8", "linear-gradient(165deg, rgba(52,217,200,0.22) 0%, rgba(9,13,46,0.94) 52%, rgba(2,5,21,1) 100%)"),
    ("#9b6fd4", "linear-gradient(195deg, rgba(155,111,212,0.26) 0%, rgba(6,11,38,0.9) 50%, rgba(2,5,21,1) 100%)"),
]


def _require_superadmin(identity: Identity) -> None:
    if identity.preferred_role != "superadmin":
        raise HTTPException(status_code=403, detail="Доступ только для суперадмина")


def _require_supervisor_or_superadmin(identity: Identity) -> None:
    if identity.preferred_role not in ("supervisor", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ только для руководителя")


async def _load_custom_defs(session: AsyncSession) -> list[KcCustomFieldDef]:
    return list(
        (
            await session.execute(
                select(KcCustomFieldDef).order_by(KcCustomFieldDef.sort_order.asc(), KcCustomFieldDef.label.asc())
            )
        )
        .scalars()
        .all()
    )


def _custom_field_keys(custom_defs: list[KcCustomFieldDef]) -> set[str]:
    return {c.field_key for c in custom_defs}


def _visibility_row(by_key: dict[str, KcFieldVisibility], field_key: str) -> KcFieldVisibility | None:
    row = by_key.get(field_key)
    if row:
        return row
    if field_key == "careerPath":
        return by_key.get("leaveOrTransferDate")
    return None


def _visible_keys(role: str, visibility: list[KcFieldVisibility], custom_defs: list[KcCustomFieldDef]) -> set[str]:
    custom_keys = _custom_field_keys(custom_defs)
    if role == "superadmin":
        return set(KC_FIELD_KEYS) | custom_keys
    by_key = {v.field_key: v for v in visibility}
    keys: set[str] = set()
    for key in list(KC_FIELD_KEYS) + list(custom_keys):
        row = _visibility_row(by_key, key)
        if not row:
            if key in custom_keys:
                continue
            continue
        if role == "operator" and row.visible_operator:
            keys.add(key)
        if role == "supervisor" and row.visible_supervisor:
            keys.add(key)
    return keys


def _builtin_fields(row: KcEmployee) -> dict[str, str]:
    raw = {
        "line": row.line,
        "company": row.company,
        "city": row.city,
        "fullName": row.full_name,
        "position": row.position,
        "gradeNew": row.grade_new,
        "emailNew": row.email_new,
        "phone": row.phone,
        "residenceAddress": row.residence_address,
        "telegramUsername": row.telegram_username,
        "expressId": row.express_id,
        "accountNumber": row.account_number,
        "accountNumberExtra": row.account_number_extra,
        "telegramId": row.telegram_id,
        "birthDate": row.birth_date,
        "firstWorkDay": row.first_work_day,
        "accessDate": row.access_date,
        "department": row.department,
        "subdivision": row.subdivision,
    }
    return {key: normalize_kc_field_value(key, value) for key, value in raw.items()}


def _career_steps_for_row(row: KcEmployee) -> list[dict[str, str]]:
    return parse_career_path(getattr(row, "career_path", "[]") or "[]", row.leave_or_transfer_date)


def _employee_payload(row: KcEmployee, visible: set[str], custom_defs: list[KcCustomFieldDef]) -> dict:
    all_fields = _builtin_fields(row)
    extra = parse_extra_data(row.extra_data)
    for cf in custom_defs:
        if cf.field_key in visible:
            all_fields[cf.field_key] = extra.get(cf.field_key, "")
    data = {k: v for k, v in all_fields.items() if k in visible and k != "careerPath"}
    payload: dict = {
        "id": row.id,
        "photoUrl": row.photo_url,
        "department": row.department,
        "onMaternityLeave": bool(row.on_maternity_leave),
        "isDismissed": bool(row.is_dismissed),
        "data": data,
    }
    if "careerPath" in visible:
        payload["careerPath"] = _career_steps_for_row(row)
    return payload


class FieldVisibilityItem(BaseModel):
    fieldKey: str
    label: str
    visibleOperator: bool
    visibleSupervisor: bool


class FieldVisibilityUpdate(BaseModel):
    items: list[FieldVisibilityItem] = Field(default_factory=list)


class CareerStepItem(BaseModel):
    id: str = ""
    date: str = ""
    title: str = ""
    department: str = ""
    subdivision: str = ""
    note: str = ""


class SubdivisionCreate(BaseModel):
    department: str
    name: str


class KcEmployeeUpdate(BaseModel):
    department: str = ""
    subdivision: str = ""
    line: str = ""
    company: str = ""
    city: str = ""
    fullName: str = ""
    position: str = ""
    gradeNew: str = ""
    emailNew: str = ""
    phone: str = ""
    residenceAddress: str = ""
    telegramUsername: str = ""
    expressId: str = ""
    accountNumber: str = ""
    accountNumberExtra: str = ""
    telegramId: str = ""
    onMaternityLeave: bool = False
    isDismissed: bool = False
    birthDate: str = ""
    firstWorkDay: str = ""
    accessDate: str = ""
    photoUrl: str = ""
    careerPath: list[CareerStepItem] = Field(default_factory=list)
    extraData: dict[str, str] = Field(default_factory=dict)


class BulkDeleteEmployees(BaseModel):
    ids: list[int] = Field(default_factory=list)


class CustomFieldCreate(BaseModel):
    label: str


class CustomFieldItem(BaseModel):
    fieldKey: str
    label: str


def _kc_photos_dir() -> Path:
    return Path(__file__).resolve().parents[4] / "uploads" / "kc"


def _photo_public_url(request: Request, relative: str) -> str:
    if not relative:
        return ""
    if relative.startswith("http://") or relative.startswith("https://"):
        return relative
    # Отдаём относительный путь — фото грузится same-origin со страницей и не
    # зависит от того, какой Host/схему backend увидит за nginx (request.base_url).
    return relative if relative.startswith("/") else f"/{relative}"


def _collect_department_hints(rows: list[KcEmployee], subdivisions: list[KcSubdivision]) -> list[str]:
    values: set[str] = set()
    for row in rows:
        dept = row.department.strip()
        if dept:
            values.add(dept)
    for sub in subdivisions:
        dept = sub.department.strip()
        if dept:
            values.add(dept)
    return sorted(values, key=lambda x: x.lower())


def _collect_subdivision_hints(rows: list[KcEmployee], subdivisions: list[KcSubdivision]) -> list[str]:
    values: set[str] = set()
    for row in rows:
        name = row.subdivision.strip()
        if name:
            values.add(name)
    for sub in subdivisions:
        name = sub.name.strip()
        if name:
            values.add(name)
    return sorted(values, key=lambda x: x.lower())


def _row_to_update_body(row: KcEmployee, custom_defs: list[KcCustomFieldDef]) -> dict:
    extra = parse_extra_data(row.extra_data)
    for cf in custom_defs:
        extra.setdefault(cf.field_key, "")
    raw = {
        "department": row.department,
        "subdivision": row.subdivision,
        "line": row.line,
        "company": row.company,
        "city": row.city,
        "fullName": row.full_name,
        "position": row.position,
        "gradeNew": row.grade_new,
        "emailNew": row.email_new,
        "phone": row.phone,
        "residenceAddress": row.residence_address,
        "telegramUsername": row.telegram_username,
        "expressId": row.express_id,
        "accountNumber": row.account_number,
        "accountNumberExtra": row.account_number_extra,
        "telegramId": row.telegram_id,
        "birthDate": row.birth_date,
        "firstWorkDay": row.first_work_day,
        "accessDate": row.access_date,
        "photoUrl": row.photo_url,
        "onMaternityLeave": bool(row.on_maternity_leave),
        "isDismissed": bool(row.is_dismissed),
        "careerPath": _career_steps_for_row(row),
        "extraData": extra,
    }
    formatted = {
        key: normalize_kc_field_value(key, value)
        if key not in ("extraData", "careerPath", "onMaternityLeave", "isDismissed")
        else value
        for key, value in raw.items()
    }
    return formatted


def _apply_employee_update(
    row: KcEmployee, body: KcEmployeeUpdate, custom_defs: list[KcCustomFieldDef]
) -> None:
    if not body.fullName.strip():
        raise HTTPException(status_code=400, detail="ФИО обязательно")
    row.department = body.department.strip()
    row.subdivision = body.subdivision.strip()
    row.line = normalize_kc_field_value("line", body.line)
    row.company = normalize_kc_field_value("company", body.company)
    row.city = normalize_kc_field_value("city", body.city)
    row.full_name = body.fullName.strip()
    row.position = body.position.strip()
    row.grade_new = normalize_kc_field_value("gradeNew", body.gradeNew)
    row.email_new = body.emailNew.strip()
    row.phone = body.phone.strip()
    row.residence_address = body.residenceAddress.strip()
    row.telegram_username = body.telegramUsername.strip()
    row.express_id = body.expressId.strip()
    row.account_number = normalize_kc_field_value("accountNumber", body.accountNumber)
    row.account_number_extra = normalize_kc_field_value("accountNumber", body.accountNumberExtra)
    row.on_maternity_leave = body.onMaternityLeave
    row.is_dismissed = body.isDismissed
    row.telegram_id = normalize_kc_field_value("telegramId", body.telegramId)
    row.birth_date = normalize_kc_field_value("birthDate", body.birthDate)
    row.first_work_day = normalize_kc_field_value("firstWorkDay", body.firstWorkDay)
    row.access_date = normalize_kc_field_value("accessDate", body.accessDate)
    steps = [s.model_dump() for s in body.careerPath]
    row.career_path = dump_career_path(steps)
    row.leave_or_transfer_date = ""
    row.photo_url = body.photoUrl.strip()

    extra = parse_extra_data(row.extra_data)
    allowed_custom = _custom_field_keys(custom_defs)
    for key, value in body.extraData.items():
        if key in allowed_custom:
            extra[key] = (value or "").strip()
    row.extra_data = dump_extra_data(extra)


def _field_labels(visible: set[str], custom_defs: list[KcCustomFieldDef]) -> list[dict]:
    labels = [{"key": f.key, "label": f.label} for f in KC_FIELD_DEFINITIONS if f.key in visible]
    for cf in custom_defs:
        if cf.field_key in visible:
            labels.append({"key": cf.field_key, "label": cf.label, "custom": True})
    return labels


@router.get("/subdivisions")
async def list_subdivisions(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    rows = (
        await session.execute(
            select(KcSubdivision).order_by(
                KcSubdivision.department.asc(),
                KcSubdivision.sort_order.asc(),
                KcSubdivision.name.asc(),
            )
        )
    ).scalars().all()
    by_dept: dict[str, list[dict]] = {}
    for row in rows:
        dept = row.department.strip()
        by_dept.setdefault(dept, []).append({"id": row.id, "name": row.name})
    groups = [{"department": d, "items": items} for d, items in sorted(by_dept.items(), key=lambda x: x[0].lower())]
    return {"groups": groups, "canEdit": identity.preferred_role == "superadmin"}


@router.post("/subdivisions")
async def create_subdivision(
    body: SubdivisionCreate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    dept = body.department.strip()
    name = body.name.strip()
    if not dept or not name:
        raise HTTPException(status_code=400, detail="Укажите отдел и название подраздела")
    existing = (
        await session.execute(
            select(KcSubdivision).where(KcSubdivision.department == dept, KcSubdivision.name == name)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Такой подраздел уже есть")
    max_order = (
        await session.execute(select(KcSubdivision.sort_order).where(KcSubdivision.department == dept))
    ).scalars().all()
    sort_order = (max(max_order) if max_order else 0) + 10
    row = KcSubdivision(department=dept, name=name, sort_order=sort_order)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return {"id": row.id, "department": row.department, "name": row.name}


@router.delete("/subdivisions/{subdivision_id}")
async def delete_subdivision(
    subdivision_id: int,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    row = await session.get(KcSubdivision, subdivision_id)
    if not row:
        raise HTTPException(status_code=404, detail="Подраздел не найден")
    await session.delete(row)
    await session.commit()
    return {"deleted": subdivision_id}


@router.get("/custom-fields")
async def list_custom_fields(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    defs = await _load_custom_defs(session)
    return {
        "items": [{"fieldKey": d.field_key, "label": d.label} for d in defs],
    }


@router.post("/custom-fields")
async def create_custom_field(
    body: CustomFieldCreate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Укажите название поля")
    field_key = slug_field_key(label)
    existing = await session.get(KcCustomFieldDef, field_key)
    if existing:
        field_key = slug_field_key(label)
    defs = await _load_custom_defs(session)
    sort_order = (max((d.sort_order for d in defs), default=0) + 10) if defs else 10
    session.add(KcCustomFieldDef(field_key=field_key, label=label, sort_order=sort_order))
    vis = (
        await session.execute(select(KcFieldVisibility).where(KcFieldVisibility.field_key == field_key))
    ).scalar_one_or_none()
    if not vis:
        session.add(
            KcFieldVisibility(field_key=field_key, visible_operator=False, visible_supervisor=True)
        )
    await session.commit()
    return {"fieldKey": field_key, "label": label}


@router.delete("/custom-fields/{field_key}")
async def delete_custom_field(
    field_key: str,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    if not field_key.startswith("cf_"):
        raise HTTPException(status_code=400, detail="Можно удалить только пользовательское поле")
    row = await session.get(KcCustomFieldDef, field_key)
    if not row:
        raise HTTPException(status_code=404, detail="Поле не найдено")
    await session.delete(row)
    vis = (
        await session.execute(select(KcFieldVisibility).where(KcFieldVisibility.field_key == field_key))
    ).scalar_one_or_none()
    if vis:
        await session.delete(vis)
    await session.commit()
    return {"deleted": field_key}


@router.get("/field-visibility")
async def get_field_visibility(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    rows = (await session.execute(select(KcFieldVisibility))).scalars().all()
    custom_defs = await _load_custom_defs(session)
    by_key = {r.field_key: r for r in rows}
    items: list[dict] = []
    for field in KC_FIELD_DEFINITIONS:
        row = _visibility_row(by_key, field.key)
        items.append(
            {
                "fieldKey": field.key,
                "label": field.label,
                "visibleOperator": row.visible_operator if row else field.default_operator,
                "visibleSupervisor": row.visible_supervisor if row else field.default_supervisor,
                "custom": False,
            }
        )
    for cf in custom_defs:
        row = by_key.get(cf.field_key)
        items.append(
            {
                "fieldKey": cf.field_key,
                "label": cf.label,
                "visibleOperator": row.visible_operator if row else False,
                "visibleSupervisor": row.visible_supervisor if row else True,
                "custom": True,
            }
        )
    return {"items": items, "canEdit": identity.preferred_role == "superadmin"}


@router.put("/field-visibility")
async def update_field_visibility(
    body: FieldVisibilityUpdate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    custom_defs = await _load_custom_defs(session)
    allowed = {f.key for f in KC_FIELD_DEFINITIONS} | _custom_field_keys(custom_defs) | {"leaveOrTransferDate"}
    rows = (await session.execute(select(KcFieldVisibility))).scalars().all()
    by_key = {r.field_key: r for r in rows}
    for item in body.items:
        if item.fieldKey not in allowed:
            continue
        row = by_key.get(item.fieldKey)
        if not row:
            row = KcFieldVisibility(field_key=item.fieldKey)
            session.add(row)
            by_key[item.fieldKey] = row
        row.visible_operator = item.visibleOperator
        row.visible_supervisor = item.visibleSupervisor
    await session.commit()
    return await get_field_visibility(identity=identity, session=session)


@router.get("/template")
async def download_kc_template(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """Шаблон Excel для массовой загрузки сотрудников."""
    _require_superadmin(identity)
    rows = (
        await session.execute(
            select(KcEmployee).order_by(
                KcEmployee.department.asc(),
                KcEmployee.sort_order.asc(),
                KcEmployee.full_name.asc(),
            )
        )
    ).scalars().all()
    actual = [employee_to_export_row(r) for r in rows]
    try:
        data = build_template_xlsx(actual)
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="openpyxl не установлен на сервере") from exc
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="shablon-dannye-kc.xlsx"'},
    )


@router.post("/employees/bulk-delete")
async def bulk_delete_kc_employees(
    body: BulkDeleteEmployees,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_superadmin(identity)
    ids = [i for i in body.ids if i > 0]
    if not ids:
        raise HTTPException(status_code=400, detail="Укажите сотрудников для удаления")
    await session.execute(delete(KcEmployee).where(KcEmployee.id.in_(ids)))
    await session.commit()
    return {"deleted": len(ids)}


@router.post("/import")
async def import_kc_employees(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    file: UploadFile = File(...),
) -> dict:
    """Загрузка сотрудников из Excel/CSV: новые добавляются, существующие дополняются."""
    _require_superadmin(identity)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Укажите файл")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пуст")

    try:
        rows = parse_import_file(content, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=400, detail="В файле нет строк с сотрудниками (нужна колонка ФИО)")

    try:
        existing = (await session.execute(select(KcEmployee).order_by(KcEmployee.sort_order.asc()))).scalars().all()
        by_full, by_last_first = build_employee_match_index(existing)

        max_order = max((e.sort_order for e in existing), default=0)
        created = 0
        updated = 0
        unchanged = 0

        for row_index, row_data in enumerate(rows, start=2):
            try:
                enforce_import_row_limits(row_data, row_index)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            match = resolve_import_match(row_data, by_full, by_last_first)
            if match:
                changed = merge_row_into_employee(match, row_data)
                if await fill_express_id_if_empty(session, settings, match):
                    changed = True
                if changed:
                    updated += 1
                else:
                    unchanged += 1
                continue

            max_order += 10
            kwargs = new_employee_kwargs(row_data)
            emp = KcEmployee(sort_order=max_order, **kwargs)
            session.add(emp)
            await session.flush()
            await fill_express_id_if_empty(session, settings, emp)
            register_employee_in_index(emp, row_data, by_full, by_last_first)
            created += 1

        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except Exception as exc:
        await session.rollback()
        logger.exception("KC import failed for %s", file.filename)
        raise HTTPException(status_code=400, detail=f"Ошибка импорта: {exc}") from exc

    parts = [f"добавлено: {created}"]
    if updated:
        parts.append(f"дополнено: {updated}")
    if unchanged:
        parts.append(f"без изменений: {unchanged}")
    message = f"Импорт завершён ({', '.join(parts)}). Фото и заполненные поля сохранены."
    return {
        "imported": created + updated,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "message": message,
    }


@router.post("/employees")
async def create_kc_employee(
    body: KcEmployeeUpdate,
    request: Request,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    _require_superadmin(identity)
    custom_defs = await _load_custom_defs(session)
    max_order = (await session.execute(select(func.max(KcEmployee.sort_order)))).scalar() or 0
    row = KcEmployee(sort_order=int(max_order) + 10, express_id="", photo_url="")
    _apply_employee_update(row, body, custom_defs)
    if not (row.express_id or "").strip():
        await fill_express_id_if_empty(session, settings, row)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    visible = set(KC_FIELD_KEYS) | _custom_field_keys(custom_defs)
    payload = _employee_payload(row, visible, custom_defs)
    payload["photoUrl"] = _photo_public_url(request, row.photo_url)
    payload["edit"] = _row_to_update_body(row, custom_defs)
    return payload


@router.put("/employees/{employee_id}")
async def update_kc_employee(
    employee_id: int,
    body: KcEmployeeUpdate,
    request: Request,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    _require_superadmin(identity)
    row = await session.get(KcEmployee, employee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    custom_defs = await _load_custom_defs(session)
    _apply_employee_update(row, body, custom_defs)
    if not (row.express_id or "").strip():
        await fill_express_id_if_empty(session, settings, row)
    await session.commit()
    await session.refresh(row)
    visible = set(KC_FIELD_KEYS) | _custom_field_keys(custom_defs)
    payload = _employee_payload(row, visible, custom_defs)
    payload["photoUrl"] = _photo_public_url(request, row.photo_url)
    payload["edit"] = _row_to_update_body(row, custom_defs)
    return payload


@router.post("/employees/{employee_id}/photo")
async def upload_kc_employee_photo(
    employee_id: int,
    request: Request,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    file: UploadFile = File(...),
) -> dict:
    _require_superadmin(identity)
    row = await session.get(KcEmployee, employee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="Допустимы JPEG, PNG или WebP")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пуст")
    if len(data) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Файл больше 5 МБ")

    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"

    photos_dir = _kc_photos_dir()
    photos_dir.mkdir(parents=True, exist_ok=True)
    path = photos_dir / f"{employee_id}{ext}"
    path.write_bytes(data)

    row.photo_url = f"/uploads/kc/{employee_id}{ext}"
    await session.commit()
    await session.refresh(row)

    url = _photo_public_url(request, row.photo_url)
    return {"photoUrl": url}


@router.get("/employees")
async def list_kc_employees(
    request: Request,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
    q: str = "",
) -> dict:
    visibility = (await session.execute(select(KcFieldVisibility))).scalars().all()
    custom_defs = await _load_custom_defs(session)
    visible = _visible_keys(identity.preferred_role, visibility, custom_defs)

    stmt = select(KcEmployee).order_by(KcEmployee.department.asc(), KcEmployee.sort_order.asc(), KcEmployee.full_name.asc())
    rows = (await session.execute(stmt)).scalars().all()

    query = q.strip().lower()
    if query:
        filtered: list[KcEmployee] = []
        for row in rows:
            hay = " ".join(
                [
                    row.full_name,
                    row.department,
                    row.subdivision,
                    row.line,
                    row.company,
                    row.city,
                    row.position,
                    row.email_new,
                ]
            ).lower()
            if query in hay:
                filtered.append(row)
        rows = filtered

    is_superadmin = identity.preferred_role == "superadmin"
    employees = []
    for row in rows:
        payload = _employee_payload(row, visible, custom_defs)
        payload["photoUrl"] = _photo_public_url(request, row.photo_url)
        if is_superadmin:
            payload["edit"] = _row_to_update_body(row, custom_defs)
        employees.append(payload)

    field_labels = _field_labels(visible, custom_defs)

    cards = []
    for i, row in enumerate(rows):
        border, gradient = _CHROMA_PALETTE[i % len(_CHROMA_PALETTE)]
        cards.append(
            {
                "id": row.id,
                "fullName": row.full_name,
                "city": row.city,
                "telegramUsername": row.telegram_username,
                "emailNew": row.email_new,
                "expressId": row.express_id,
                "line": row.line,
                "position": row.position,
                "borderColor": border,
                "gradient": gradient,
                "image": _photo_public_url(request, row.photo_url),
                "department": row.department,
                "subdivision": row.subdivision,
                "onMaternityLeave": bool(row.on_maternity_leave),
                "isDismissed": bool(row.is_dismissed),
            }
        )

    subdivisions = (
        await session.execute(
            select(KcSubdivision).order_by(
                KcSubdivision.department.asc(),
                KcSubdivision.sort_order.asc(),
                KcSubdivision.name.asc(),
            )
        )
    ).scalars().all()
    by_dept: dict[str, list[dict]] = {}
    for s in subdivisions:
        dept = s.department.strip()
        by_dept.setdefault(dept, []).append({"id": s.id, "name": s.name})
    subdivision_groups = [
        {"department": d, "items": items} for d, items in sorted(by_dept.items(), key=lambda x: x[0].lower())
    ]

    return {
        "employees": employees,
        "cards": cards,
        "fieldLabels": field_labels,
        "subdivisions": subdivision_groups,
        "departmentHints": _collect_department_hints(rows, subdivisions),
        "subdivisionHints": _collect_subdivision_hints(rows, subdivisions),
        "role": identity.preferred_role,
        "canEdit": is_superadmin,
    }


class ResidenceDistanceItem(BaseModel):
    employeeId: int
    city: str = ""
    address: str = ""


class ResidenceDistancesBody(BaseModel):
    items: list[ResidenceDistanceItem] = Field(default_factory=list)


@router.post("/employees/residence-distances")
async def kc_residence_distances(
    body: ResidenceDistancesBody,
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Координаты адреса и расстояние до офиса (только руководитель / суперадмин)."""
    _require_supervisor_or_superadmin(identity)
    distances: dict[str, float | None] = {}
    points: dict[str, dict[str, float]] = {}
    for item in body.items[:500]:
        info = await residence_geo_info(
            city=item.city,
            address=item.address,
            google_api_key=settings.google_geocoding_api_key,
            yandex_api_key=settings.yandex_geocoder_api_key,
        )
        key = str(item.employeeId)
        if info:
            distances[key] = info["distanceKm"]
            points[key] = info
        else:
            distances[key] = None
    offices = [
        {
            "city": o.city,
            "address": o.address,
            "lat": o.lat,
            "lon": o.lon,
        }
        for o in KC_OFFICES.values()
    ]
    maps_key = (settings.google_geocoding_api_key or "").strip()
    return {
        "distances": distances,
        "points": points,
        "offices": offices,
        "maps": {
            "provider": "google" if maps_key else "osm",
            "apiKey": maps_key,
        },
    }
