#!/usr/bin/env python3
"""
Подтягивает Express HUID в kc_employees.express_id по ФИО из BotX users_as_csv.

На основе express_usedesk_proxy.py — только чтение пользователей Express, без Usedesk.

Переменные окружения (.env в корне репозитория):
  EXPRESS_BOT_ID, EXPRESS_BOT_SECRET_KEY, EXPRESS_BOTX_HOST (или EXPRESS_BOTX_BASE_URL)
  DATABASE_URL — как у backend

Примеры:
  python scripts/sync_kc_express_ids.py --dry-run
  python scripts/sync_kc_express_ids.py --apply
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import get_settings  # noqa: E402
from app.domain.name_match import key_full, key_last_first  # noqa: E402
from app.infra.db import create_engine  # noqa: E402
from app.infra.models import EmployeeMapping, KcEmployee  # noqa: E402


def build_botx_jwt() -> str:
    bot_id = os.getenv("EXPRESS_BOT_ID", "").strip()
    secret = os.getenv("EXPRESS_BOT_SECRET_KEY", "").strip()
    host = os.getenv("EXPRESS_BOTX_HOST", "").strip()
    if not bot_id or not secret or not host:
        raise RuntimeError("Заполните EXPRESS_BOT_ID, EXPRESS_BOT_SECRET_KEY, EXPRESS_BOTX_HOST в .env")
    now = int(time.time())
    payload = {
        "iss": bot_id,
        "aud": host,
        "exp": now + 60,
        "nbf": now,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "version": 2,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


async def fetch_express_users() -> dict[str, str]:
    """normalized_name -> HUID"""
    base = (os.getenv("EXPRESS_BOTX_BASE_URL") or "").strip()
    if not base:
        host = os.getenv("EXPRESS_BOTX_HOST", "").strip()
        base = f"http://{host}" if host else ""
    if not base:
        raise RuntimeError("Укажите EXPRESS_BOTX_BASE_URL или EXPRESS_BOTX_HOST")

    url = (
        f"{base.rstrip('/')}/api/v3/botx/users/users_as_csv"
        "?cts_user=true&unregistered=false&botx=false"
    )
    headers = {"Authorization": f"Bearer {build_botx_jwt()}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        text = resp.text

    by_name: dict[str, str] = {}
    duplicates: set[str] = set()
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        huid = (row.get("HUID") or "").strip()
        name = (row.get("Name") or "").strip()
        if not huid or not name:
            continue
        for key_fn in (key_full, key_last_first):
            key = key_fn(name)
            if not key:
                continue
            if key in by_name and by_name[key] != huid:
                duplicates.add(key)
            else:
                by_name[key] = huid

    for dup in duplicates:
        by_name.pop(dup, None)

    return by_name


def resolve_express_huid(
    full_name: str,
    email: str,
    express_by_name: dict[str, str],
    mapping_by_email: dict[str, str],
) -> str | None:
    for key_fn in (key_full, key_last_first):
        key = key_fn(full_name)
        if key and key in express_by_name:
            return express_by_name[key]

    email_norm = email.strip().lower()
    if email_norm and email_norm in mapping_by_email:
        mapping_name = mapping_by_email[email_norm]
        for key_fn in (key_full, key_last_first):
            key = key_fn(mapping_name)
            if key and key in express_by_name:
                return express_by_name[key]
    return None


async def run(*, apply: bool, force: bool) -> int:
    settings = get_settings()
    engine = create_engine(settings)
    if engine is None:
        print("DATABASE_URL не задан")
        return 1

    express_by_name = await fetch_express_users()
    print(f"Express: загружено имён для сопоставления: {len(express_by_name)}")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    matched = 0
    skipped = 0
    already = 0

    async with factory() as session:
        employees = (await session.execute(select(KcEmployee).order_by(KcEmployee.id.asc()))).scalars().all()
        mappings = (await session.execute(select(EmployeeMapping))).scalars().all()
        mapping_by_email = {
            (m.email or "").strip().lower(): (m.display_name or "").strip()
            for m in mappings
            if (m.email or "").strip() and (m.display_name or "").strip()
        }

        for emp in employees:
            if (emp.express_id or "").strip() and not force:
                already += 1
                continue

            huid = resolve_express_huid(
                emp.full_name or "",
                emp.email_new or "",
                express_by_name,
                mapping_by_email,
            )
            if not huid:
                skipped += 1
                print(f"  ? не найден: {emp.full_name}")
                continue

            if (emp.express_id or "").strip() == huid:
                already += 1
                continue

            print(f"  {'→' if apply else '~'} {emp.full_name}: {emp.express_id or '—'} => {huid}")
            if apply:
                emp.express_id = huid
            matched += 1

        if apply and matched:
            await session.commit()

    await engine.dispose()

    mode = "применено" if apply else "dry-run"
    print(
        f"\n{mode}: обновлено {matched}, уже с ID {already}, без совпадения {skipped}. "
        f"Запустите с --apply для записи в БД."
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Синхронизация express_id в kc_employees из Express BotX")
    parser.add_argument("--apply", action="store_true", help="Записать изменения в БД (по умолчанию dry-run)")
    parser.add_argument("--force", action="store_true", help="Перезаписать уже заполненный express_id")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(apply=args.apply, force=args.force)))


if __name__ == "__main__":
    main()
