from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.auth.identity import Identity, get_identity
from app.auth.roles import can_use_superadmin
from app.core.config import Settings, get_settings
from app.domain.triggers_ra.config import DEFAULT_PERIOD_DAYS
from app.domain.triggers_ra.service import (
    build_touchpoint_client,
    load_dashboard_cached,
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
        "maxCustomDays": 90,
        "cacheTtlSeconds": 180,
    }


async def _load_dashboard_or_raise(
    settings: Settings,
    *,
    period_days: int,
    date_from: date | None = None,
    date_to: date | None = None,
    force: bool = False,
) -> dict:
    custom = date_from is not None or date_to is not None
    if custom:
        if date_from is None or date_to is None:
            raise HTTPException(
                status_code=400,
                detail="Для произвольного интервала укажите и date_from, и date_to",
            )
        if date_to < date_from:
            raise HTTPException(status_code=400, detail="date_to не может быть раньше date_from")
        if (date_to - date_from).days + 1 > 90:
            raise HTTPException(status_code=400, detail="Интервал не может быть больше 90 дней")
    elif period_days not in (7, 14, 30):
        # произвольная длина через пресет не разрешена — fallback
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

        def _load() -> dict:
            return load_dashboard_cached(
                client,
                period_days=period_days,
                date_from=date_from if custom else None,
                date_to=date_to if custom else None,
                force=force,
            )

        return await run_in_threadpool(_load)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TouchPointAuthError as exc:
        raise HTTPException(status_code=401, detail=f"Ошибка авторизации TouchPoint: {exc}") from exc
    except TouchPointAPIError as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка API TouchPoint: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки Тригеров РА: {exc}") from exc


@router.get("/dashboard")
async def triggers_ra_dashboard(
    period_days: int = Query(default=DEFAULT_PERIOD_DAYS, ge=1, le=90),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    force: bool = Query(default=False, description="Игнорировать кэш (3 мин)"),
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> dict:
    _require_supervisor(identity, settings)
    return await _load_dashboard_or_raise(
        settings,
        period_days=period_days,
        date_from=date_from,
        date_to=date_to,
        force=force,
    )


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
    date_from = payload.get("dateFrom") or ""
    date_to = payload.get("dateTo") or ""
    if date_from and date_to:
        filename = f"trigery-ra-{date_from}_{date_to}.xlsx"
    else:
        filename = f"trigery-ra-{period_days}d.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.xlsx")
async def triggers_ra_export_reload(
    period_days: int = Query(default=DEFAULT_PERIOD_DAYS, ge=1, le=90),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    force: bool = Query(default=True),
    identity: Identity = Depends(get_identity),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Перезагружает данные из TouchPoint и отдаёт Excel (может занять 1–2 минуты)."""
    _require_supervisor(identity, settings)
    data = await _load_dashboard_or_raise(
        settings,
        period_days=period_days,
        date_from=date_from,
        date_to=date_to,
        force=force,
    )
    try:
        content = await run_in_threadpool(build_triggers_ra_xlsx, data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка формирования Excel: {exc}") from exc
    date_from_s = data.get("dateFrom") or ""
    date_to_s = data.get("dateTo") or ""
    if date_from_s and date_to_s:
        filename = f"trigery-ra-{date_from_s}_{date_to_s}.xlsx"
    else:
        filename = f"trigery-ra-{data.get('periodDays') or period_days}d.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
