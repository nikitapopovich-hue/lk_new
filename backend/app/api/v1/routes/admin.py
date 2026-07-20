from __future__ import annotations

from fastapi import APIRouter

from app.core.config import Settings, get_settings
from fastapi import Depends

from app.integrations.backoffice.client import BackofficeAuth, BackofficeClient
from app.integrations.uis.client import UisAuth, UisDataApiClient
from app.integrations.itech.client import ItechClient, ItechOAuth

router = APIRouter()


@router.get("/mappings")
async def admin_mappings_get() -> dict:
    # Заглушка: позже — CRUD маппинга идентификаторов (UIS employee_id, Usedesk agent_id, 3iTech user, Backoffice user).
    return {"items": []}


@router.get("/integrations")
async def admin_integrations_get(settings: Settings = Depends(get_settings)) -> dict:
    results: dict[str, dict] = {}

    # Backoffice
    try:
        if settings.backoffice_login and settings.backoffice_fsid and settings.backoffice_user_id:
            client = BackofficeClient(
                base_url=str(settings.backoffice_base_url),
                auth=BackofficeAuth(
                    login=settings.backoffice_login,
                    fsid=settings.backoffice_fsid,
                    user_id=settings.backoffice_user_id,
                    user_lang=settings.backoffice_user_lang,
                ),
                timeout_seconds=settings.backoffice_timeout_seconds,
            )
            res = await client.get_objects_from_version_packets(
                packets=[{"className": "Users.User", "fromVersion": "0", "maxCount": 1}],
            )
            results["backoffice"] = {"ok": True, "sampleKeys": list(res.keys())[:10]}
        else:
            results["backoffice"] = {"ok": False, "error": "Not configured (BACKOFFICE_*)"}
    except Exception as e:  # noqa: BLE001
        results["backoffice"] = {"ok": False, "error": str(e)[:300]}

    # UIS
    try:
        if settings.uis_data_api_access_token:
            uis = UisDataApiClient(
                base_url=str(settings.uis_data_api_base_url),
                auth=UisAuth(access_token=settings.uis_data_api_access_token),
                request_id=settings.uis_data_api_request_id,
                timeout_seconds=settings.uis_data_api_timeout_seconds,
            )
            # безопасный "пинг": get.account часто требует токен, но конкретные методы зависят от прав.
            # Поэтому делаем просто logout.user? он завершит сессию — нельзя.
            # Пока возвращаем "configured" без сетевого вызова.
            results["uis"] = {"ok": True, "note": "Configured (token present). Add a safe ping method later."}
        else:
            results["uis"] = {"ok": False, "error": "Not configured (UIS_DATA_API_ACCESS_TOKEN)"}
    except Exception as e:  # noqa: BLE001
        results["uis"] = {"ok": False, "error": str(e)[:300]}

    # 3iTech
    try:
        if settings.itech_access_token or (settings.itech_oauth_client_id and settings.itech_oauth_username):
            oauth = None
            if not settings.itech_access_token:
                oauth = ItechOAuth(
                    client_id=settings.itech_oauth_client_id,
                    client_secret=settings.itech_oauth_client_secret or None,
                    username=settings.itech_oauth_username,
                    password=settings.itech_oauth_password,
                    grant_type=settings.itech_oauth_grant_type,
                )
            it = ItechClient(
                resource_base_url=str(settings.itech_resource_base_url),
                oauth_token_url=str(settings.itech_oauth_token_url),
                access_token=settings.itech_access_token,
                oauth=oauth,
                timeout_seconds=settings.itech_timeout_seconds,
            )
            # безопасный "пинг" зависит от API; пока без запроса.
            results["itech"] = {"ok": True, "note": "Configured (token or oauth present). Add a safe ping later."}
        else:
            results["itech"] = {"ok": False, "error": "Not configured (ITECH_ACCESS_TOKEN or OAuth creds)"}
    except Exception as e:  # noqa: BLE001
        results["itech"] = {"ok": False, "error": str(e)[:300]}

    return results

