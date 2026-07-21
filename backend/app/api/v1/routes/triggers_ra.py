from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.auth.identity import Identity, get_identity
from app.auth.roles import can_use_superadmin
from app.core.config import Settings, get_settings
from app.domain.triggers_ra.config import DEFAULT_PERIOD_DAYS
from app.domain.triggers_ra.service import (
    build_touchpoint_client,
    load_dashboard,
    touchpoint_configured,
)
from app.domain.triggers_ra.touchpoint_client import TouchPointAPIError, TouchPointAuthError
from app.domain.triggers_ra.xlsx_export import build_triggers_ra_xlsx

router = APIRouter()


def _require_supervisor(identity: Identity, settings: Settings) -> None:
    role = (identity.preferred_role or "").strip().lower()
    if role in ("supervisor", "superadmin") or can_use_superadmin(identity.email, settings):
        return
    raise HTTPException(status_code=403, detail="Доступ только для руководителя")


@router.get("/config")
async def triggers_ra_config(
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> dict:
    _require_supervisor(identity, settings)
    return {
        "configured": touchpoint_configured(settings),
        "defaultPeriodDays": DEFAULT_PERIOD_DAYS,
        "periodOptions": [7, 14, 30],
    }


async def _load_dashboard_or_raise(settings: Settings, period_days: int) -> dict:
    if period_days not in (7, 14, 30):
        period_days = DEFAULT_PERIOD_DAYS
    if not touchpoint_configured(settings):
        raise HTTPException(
            status_code=503,
            detail=(
                "TouchPoint не настроен. Заполните TP_ACCESS_TOKEN или "
                "TP_CLIENT_ID / TP_USERNAME / TP_PASSWORD в .env"
            ),
        )
    client = build_touchpoint_client(settings)
    try:
        await run_in_threadpool(lambda: client.access_token)
        return await run_in_threadpool(load_dashboard, client, period_days)
    except TouchPointAuthError as exc:
        raise HTTPException(status_code=401, detail=f"Ошибка авторизации TouchPoint: {exc}") from exc
    except TouchPointAPIError as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка API TouchPoint: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки Тригеров РА: {exc}") from exc


@router.get("/dashboard")
async def triggers_ra_dashboard(
    period_days: int = Query(default=DEFAULT_PERIOD_DAYS, ge=1, le=90),
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> dict:
    _require_supervisor(identity, settings)
    return await _load_dashboard_or_raise(settings, period_days)


@router.post("/export.xlsx")
async def triggers_ra_export_from_payload(
    payload: dict,
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Собирает Excel из уже загруженных данных дашборда (без повторного запроса к TouchPoint)."""
    _require_supervisor(identity, settings)
    if not isinstance(payload, dict) or not payload.get("operators"):
        raise HTTPException(status_code=400, detail="Нет данных для выгрузки — сначала обновите дашборд")
    try:
        content = await run_in_threadpool(build_triggers_ra_xlsx, payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка формирования Excel: {exc}") from exc

    period_days = payload.get("periodDays") or DEFAULT_PERIOD_DAYS
    filename = f"trigery-ra-{period_days}d.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.xlsx")
async def triggers_ra_export_reload(
    period_days: int = Query(default=DEFAULT_PERIOD_DAYS, ge=1, le=90),
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Перезагружает данные из TouchPoint и отдаёт Excel (может занять 1–2 минуты)."""
    _require_supervisor(identity, settings)
    data = await _load_dashboard_or_raise(settings, period_days)
    try:
        content = await run_in_threadpool(build_triggers_ra_xlsx, data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка формирования Excel: {exc}") from exc
    filename = f"trigery-ra-{period_days}d.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )