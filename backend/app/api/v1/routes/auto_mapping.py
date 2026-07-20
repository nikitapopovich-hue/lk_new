from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.core.config import Settings, get_settings
from app.domain.name_match import key_full, key_last_first, normalize_ru_name
from app.infra.models import EmployeeMapping
from app.integrations.backoffice.client import BackofficeAuth, BackofficeClient
from app.integrations.usedesk.client import UsedeskAuth, UsedeskClient, UsedeskError
from app.integrations.uis.client import UisAuth, UisDataApiClient

router = APIRouter()


class SuggestRequest(BaseModel):
    onlyPariEmails: bool = True
    minConfidence: float = 0.7
    includeExisting: bool = True
    onlyMissing: list[str] = Field(default_factory=list)  # ["backoffice","uis","usedesk"]


def _confidence(reason: str) -> float:
    return {
        "full_name_exact": 0.95,
        "last_first_unique": 0.80,
        "name_missing": 0.0,
        "ambiguous": 0.0,
    }.get(reason, 0.5)


@router.post("/suggest")
async def suggest_mappings(
    body: SuggestRequest,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Собирает пользователей из Usedesk/Backoffice/UIS и предлагает черновики маппинга.
    Источник "канонических" email — Usedesk (там email есть стабильно).
    """

    def _extract_backoffice_list(raw: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Backoffice может менять обертки. Ищем список объектов Users.User максимально устойчиво.
        Ожидаемый вариант: raw.response.list[]
        """
        resp = raw.get("response")
        if isinstance(resp, dict) and isinstance(resp.get("list"), list):
            return resp["list"]

        # fallback: рекурсивный поиск list с объектами, содержащими поля class/id/object
        found: list[dict[str, Any]] = []

        def walk(node: Any, depth: int = 0) -> None:
            if depth > 6:
                return
            if isinstance(node, dict):
                for v in node.values():
                    walk(v, depth + 1)
            elif isinstance(node, list):
                if node and all(isinstance(x, dict) for x in node):
                    sample = node[0]
                    if {"class", "id", "object"}.issubset(sample.keys()):
                        found.extend([x for x in node if isinstance(x, dict)])
                        return
                for v in node:
                    walk(v, depth + 1)

        walk(raw)
        return found

    # 1) Usedesk users (id, name, email)
    usedesk_users: list[dict[str, Any]] = []
    usedesk_error: str | None = None
    if settings.usedesk_api_token:
        try:
            ud = UsedeskClient(
                base_url=str(settings.usedesk_api_base_url),
                auth=UsedeskAuth(api_token=settings.usedesk_api_token),
                timeout_seconds=settings.usedesk_timeout_seconds,
            )
            usedesk_users = await ud.list_users()
        except UsedeskError as exc:
            usedesk_error = str(exc)

    # 2) Backoffice users (id, fullName, logonName)
    bo_users: list[dict[str, Any]] = []
    if settings.backoffice_login and settings.backoffice_fsid and settings.backoffice_user_id:
        bo = BackofficeClient(
            base_url=str(settings.backoffice_base_url),
            auth=BackofficeAuth(
                login=settings.backoffice_login,
                fsid=settings.backoffice_fsid,
                user_id=settings.backoffice_user_id,
                user_lang=settings.backoffice_user_lang,
            ),
            timeout_seconds=settings.backoffice_timeout_seconds,
        )
        raw = await bo.get_objects_from_version_packets(
            packets=[{"className": "Users.User", "fromVersion": "0", "maxCount": 10000}],
        )
        lst = _extract_backoffice_list(raw)
        for it in lst:
            obj = it.get("object") or {}
            # фильтруем только Users.User
            if str(it.get("class") or "") != "Users.User":
                continue
            bo_users.append(
                {
                    "id": str(it.get("id") or ""),
                    "fullName": obj.get("fullName") or "",
                    "logonName": obj.get("logonName") or "",
                    "groupId": str(obj.get("group") or ""),
                }
            )

    # 3) UIS employees (id, full_name, login)
    uis_employees: list[dict[str, Any]] = []
    if settings.uis_data_api_access_token:
        uis = UisDataApiClient(
            base_url=str(settings.uis_data_api_base_url),
            auth=UisAuth(access_token=settings.uis_data_api_access_token),
            request_id=settings.uis_data_api_request_id,
            timeout_seconds=settings.uis_data_api_timeout_seconds,
        )
        res = await uis.call(
            method="get.employees",
            params={
                "access_token": settings.uis_data_api_access_token,
                "fields": ["id", "groups", "full_name", "login"],
            },
        )
        # ожидаем result.data или result.rows — зависит от версии; поэтому аккуратно
        payload = res.get("result", {}).get("data") or res.get("result") or {}
        if isinstance(payload, dict):
            candidates = payload.get("items") or payload.get("list") or payload.get("rows")
        else:
            candidates = payload
        if isinstance(candidates, list):
            for e in candidates:
                uis_employees.append(
                    {
                        "id": str(e.get("id") or ""),
                        "fullName": e.get("full_name") or e.get("fullName") or "",
                        "login": str(e.get("login") or ""),
                        "groups": e.get("groups") or [],
                    }
                )

    # helper: guess backoffice logonName from email local part "first.last"
    def _guess_bo_logon_candidates(email_: str) -> list[str]:
        local = (email_.split("@", 1)[0] if "@" in email_ else email_).strip().lower()
        local = local.replace("-", ".").replace("_", ".")
        parts = [p for p in local.split(".") if p]
        if len(parts) < 2:
            return []
        first, last = parts[0], parts[-1]
        cands = set()
        if first and last:
            cands.add(f"{first[0]}{last}")  # avenevtsev
            cands.add(f"{first}{last}")     # alekseyvenevtsev (реже, но бывает)
            cands.add(last)                 # venevtsev (реже)
        return [c for c in cands if c]

    # Build lookup tables by name keys
    bo_by_full: dict[str, list[dict[str, Any]]] = {}
    bo_by_lf: dict[str, list[dict[str, Any]]] = {}
    bo_by_logon: dict[str, list[dict[str, Any]]] = {}
    for u in bo_users:
        bo_by_full.setdefault(key_full(u["fullName"]), []).append(u)
        bo_by_lf.setdefault(key_last_first(u["fullName"]), []).append(u)
        if u.get("logonName"):
            bo_by_logon.setdefault(str(u["logonName"]).strip().lower(), []).append(u)

    uis_by_full: dict[str, list[dict[str, Any]]] = {}
    uis_by_lf: dict[str, list[dict[str, Any]]] = {}
    for u in uis_employees:
        uis_by_full.setdefault(key_full(u["fullName"]), []).append(u)
        uis_by_lf.setdefault(key_last_first(u["fullName"]), []).append(u)

    # existing emails in DB
    existing_rows = (
        await session.execute(select(EmployeeMapping))
    ).scalars().all()
    existing_by_email = {r.email: r for r in existing_rows}

    suggestions: list[dict[str, Any]] = []
    for uu in usedesk_users:
        email = (uu.get("email") or "").strip().lower()
        if not email:
            continue
        if body.onlyPariEmails and not email.endswith("@pari.ru"):
            continue
        existing = existing_by_email.get(email)
        if existing and not body.includeExisting:
            continue

        name = (uu.get("name") or "").strip()
        full_key = key_full(name)
        lf_key = key_last_first(name)

        pick_bo = None
        pick_uis = None
        reason_parts: list[str] = []

        # Backoffice match
        # 0) по logonName из email (часто надежнее, чем ФИО)
        logon_cands = _guess_bo_logon_candidates(email)
        for cand in logon_cands:
            if len(bo_by_logon.get(cand, [])) == 1:
                pick_bo = bo_by_logon[cand][0]
                reason_parts.append("bo:logon_from_email")
                break

        # 1) точное совпадение по fullName (с нормализацией)
        if not pick_bo and full_key:
            full_matches = bo_by_full.get(full_key, [])
            if len(full_matches) == 1:
                pick_bo = full_matches[0]
                reason_parts.append("bo:full_name_exact")
            elif len(full_matches) > 1:
                # если несколько одинаковых ФИО — попробуем выбрать по logonName, угаданному из email
                if logon_cands:
                    by_logon = [x for x in full_matches if str(x.get("logonName", "")).lower() in logon_cands]
                    if len(by_logon) == 1:
                        pick_bo = by_logon[0]
                        reason_parts.append("bo:full_name_plus_logon")
                    else:
                        reason_parts.append("bo:ambiguous_full_name")
                else:
                    reason_parts.append("bo:ambiguous_full_name")

        # 2) fallback: фамилия+имя (если fullName включает отчество и не матчится)
        if not pick_bo and lf_key:
            lf_matches = bo_by_lf.get(lf_key, [])
            if len(lf_matches) == 1:
                pick_bo = lf_matches[0]
                reason_parts.append("bo:last_first_unique")
            elif len(lf_matches) > 1:
                # опять пробуем logonName как tie-break
                if logon_cands:
                    by_logon = [x for x in lf_matches if str(x.get("logonName", "")).lower() in logon_cands]
                    if len(by_logon) == 1:
                        pick_bo = by_logon[0]
                        reason_parts.append("bo:last_first_plus_logon")
                    else:
                        reason_parts.append("bo:ambiguous")
                else:
                    reason_parts.append("bo:ambiguous")

        # UIS match
        if full_key and len(uis_by_full.get(full_key, [])) == 1:
            pick_uis = uis_by_full[full_key][0]
            reason_parts.append("uis:full_name_exact")
        elif lf_key and len(uis_by_lf.get(lf_key, [])) == 1:
            pick_uis = uis_by_lf[lf_key][0]
            reason_parts.append("uis:last_first_unique")
        elif lf_key and len(uis_by_lf.get(lf_key, [])) > 1:
            reason_parts.append("uis:ambiguous")

        # confidence heuristic
        conf = 0.6
        if "bo:logon_from_email" in reason_parts:
            conf += 0.25
        if "bo:full_name_plus_logon" in reason_parts or "bo:last_first_plus_logon" in reason_parts:
            conf += 0.2
        if "bo:full_name_exact" in reason_parts:
            conf += 0.2
        if "uis:full_name_exact" in reason_parts:
            conf += 0.2
        if "bo:last_first_unique" in reason_parts:
            conf += 0.1
        if "uis:last_first_unique" in reason_parts:
            conf += 0.1
        if "bo:ambiguous" in reason_parts or "uis:ambiguous" in reason_parts:
            conf -= 0.2
        conf = max(0.0, min(0.99, conf))

        if conf < body.minConfidence:
            continue

        # if we already have mapping and it is fully filled, skip
        if existing:
            if (
                existing.backoffice_user_id
                and existing.usedesk_user_id
                and existing.uis_employee_id
            ):
                continue
            # optionally restrict to items missing specific fields
            if body.onlyMissing:
                missing_ok = False
                for f in body.onlyMissing:
                    if f == "backoffice" and not existing.backoffice_user_id:
                        missing_ok = True
                    if f == "uis" and not existing.uis_employee_id:
                        missing_ok = True
                    if f == "usedesk" and not existing.usedesk_user_id:
                        missing_ok = True
                if not missing_ok:
                    continue

        suggestions.append(
            {
                "email": email,
                "displayName": name,
                "usedeskUserId": str(uu.get("id") or ""),
                "usedeskEmail": email,
                "backofficeUserId": pick_bo["id"] if pick_bo else "",
                "backofficeLogonName": pick_bo["logonName"] if pick_bo else "",
                "uisEmployeeId": pick_uis["id"] if pick_uis else "",
                "uisLogin": pick_uis["login"] if pick_uis else "",
                "confidence": conf,
                "matchKeys": {"full": full_key, "lastFirst": lf_key},
                "reasons": reason_parts,
                "backofficeCandidates": [
                    {"id": x["id"], "fullName": x["fullName"], "logonName": x.get("logonName", "")}
                    for x in (
                        (bo_by_full.get(full_key, []) if full_key else [])
                        or (bo_by_lf.get(lf_key, []) if lf_key else [])
                    )[:5]
                ]
                if (not pick_bo and ((full_key and len(bo_by_full.get(full_key, [])) > 1) or (lf_key and len(bo_by_lf.get(lf_key, [])) > 1)))
                else [],

                # current stored values (to make it obvious what will be updated)
                "current": {
                    "id": existing.id if existing else None,
                    "backofficeUserId": existing.backoffice_user_id if existing else "",
                    "usedeskUserId": existing.usedesk_user_id if existing else "",
                    "uisEmployeeId": existing.uis_employee_id if existing else "",
                },
            }
        )

    suggestions.sort(key=lambda x: (-x["confidence"], x["email"]))
    return {
        "items": suggestions,
        "meta": {
            "usedesk_users": len(usedesk_users),
            "backoffice_users": len(bo_users),
            "uis_employees": len(uis_employees),
            "backoffice_base_url": str(settings.backoffice_base_url),
            "usedesk_base_url": str(settings.usedesk_api_base_url),
            "usedesk_error": usedesk_error,
        },
    }


class ApplyRequest(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/apply")
async def apply_mappings(
    body: ApplyRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    created = 0
    updated = 0
    for it in body.items:
        email = (it.get("email") or "").strip().lower()
        if not email:
            continue
        exists = (
            await session.execute(select(EmployeeMapping).where(EmployeeMapping.email == email))
        ).scalar_one_or_none()

        if not exists:
            m = EmployeeMapping(
                email=email,
                display_name=(it.get("displayName") or "").strip(),
                backoffice_user_id=str(it.get("backofficeUserId") or "").strip(),
                backoffice_logon_name=str(it.get("backofficeLogonName") or "").strip(),
                usedesk_user_id=str(it.get("usedeskUserId") or "").strip(),
                usedesk_email=(it.get("usedeskEmail") or "").strip().lower(),
                uis_employee_id=str(it.get("uisEmployeeId") or "").strip(),
                uis_login=str(it.get("uisLogin") or "").strip(),
                notes="auto-suggest",
            )
            session.add(m)
            created += 1
        else:
            changed = False
            # дозаполняем только пустые поля (не затираем ручное)
            if not exists.display_name and (it.get("displayName") or "").strip():
                exists.display_name = (it.get("displayName") or "").strip()
                changed = True

            if not exists.backoffice_user_id and str(it.get("backofficeUserId") or "").strip():
                exists.backoffice_user_id = str(it.get("backofficeUserId") or "").strip()
                exists.backoffice_logon_name = str(it.get("backofficeLogonName") or "").strip()
                changed = True

            if not exists.usedesk_user_id and str(it.get("usedeskUserId") or "").strip():
                exists.usedesk_user_id = str(it.get("usedeskUserId") or "").strip()
                exists.usedesk_email = (it.get("usedeskEmail") or "").strip().lower()
                changed = True

            if not exists.uis_employee_id and str(it.get("uisEmployeeId") or "").strip():
                exists.uis_employee_id = str(it.get("uisEmployeeId") or "").strip()
                exists.uis_login = str(it.get("uisLogin") or "").strip()
                changed = True

            if changed:
                # пометка
                if "auto-suggest" not in (exists.notes or ""):
                    exists.notes = (exists.notes + "\n" if exists.notes else "") + "auto-suggest"
                updated += 1

    await session.commit()
    return {"created": created, "updated": updated}

