from __future__ import annotations

import logging
import re
import time
from typing import TYPE_CHECKING

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.domain.name_match import key_full, key_last_first

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

_TABLE_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

_cache_by_key: dict[str, str] | None = None
_cache_ts = 0.0
_cache_failed = False
_extra_engine: AsyncEngine | None = None
_extra_session_factory: async_sessionmaker[AsyncSession] | None = None


def _normalize_db_url(url: str) -> str:
    u = url.strip()
    if u.startswith("postgres://"):
        u = "postgresql://" + u.removeprefix("postgres://")
    if u.startswith("postgresql://"):
        u = "postgresql+asyncpg://" + u.removeprefix("postgresql://")
    return u


def _build_lookup(rows: list[tuple[str, str]]) -> dict[str, str]:
    """normalized_name -> express HUID; неоднозначные ключи исключаются."""
    lookup: dict[str, str] = {}
    ambiguous: set[str] = set()

    for huid, full_name in rows:
        if not huid or not full_name:
            continue
        for key_fn in (key_full, key_last_first):
            key = key_fn(full_name)
            if not key:
                continue
            if key in lookup and lookup[key] != huid:
                ambiguous.add(key)
            else:
                lookup[key] = huid

    for key in ambiguous:
        lookup.pop(key, None)

    return lookup


async def _fetch_rows(session: AsyncSession, table: str) -> list[tuple[str, str]]:
    if not _TABLE_RE.match(table):
        return []
    query = text(
        f'SELECT user_huid::text, full_name FROM "{table}" WHERE is_active IS DISTINCT FROM FALSE'
    )
    result = await session.execute(query)
    return [(str(h or "").strip(), str(n or "").strip()) for h, n in result.all()]


async def _fetch_rows_from_extra_db(settings: Settings, table: str) -> list[tuple[str, str]]:
    global _extra_engine, _extra_session_factory
    url = (settings.express_users_database_url or "").strip()
    if not url:
        return []
    if _extra_engine is None:
        connect_args: dict = {"statement_cache_size": 0}
        if settings.database_ssl:
            connect_args["ssl"] = True
        _extra_engine = create_async_engine(
            _normalize_db_url(url),
            connect_args=connect_args,
            pool_pre_ping=True,
        )
        _extra_session_factory = async_sessionmaker(
            _extra_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    assert _extra_session_factory is not None
    async with _extra_session_factory() as extra_session:
        return await _fetch_rows(extra_session, table)


def _express_source_configured(settings: Settings) -> bool:
    if (settings.express_users_database_url or "").strip():
        return True
    return bool(settings.express_users_use_main_database)


async def load_express_user_directory(
    session: AsyncSession,
    settings: Settings,
    *,
    force: bool = False,
) -> dict[str, str]:
    """Кэш справочника Express: фамилия+имя / полное ФИО → HUID."""
    global _cache_by_key, _cache_ts, _cache_failed

    if not settings.express_users_enabled:
        return {}

    if not _express_source_configured(settings):
        return {}

    ttl = max(30, int(settings.express_users_cache_seconds))
    now = time.monotonic()
    if not force and _cache_by_key is not None and (now - _cache_ts) < ttl:
        return _cache_by_key
    if not force and _cache_failed and (now - _cache_ts) < ttl:
        return {}

    table = (settings.express_users_table or "").strip()
    if not table:
        return {}

    rows: list[tuple[str, str]] = []
    try:
        extra_url = (settings.express_users_database_url or "").strip()
        if extra_url:
            rows = await _fetch_rows_from_extra_db(settings, table)
        elif settings.express_users_use_main_database:
            rows = await _fetch_rows(session, table)
    except SQLAlchemyError as exc:
        _cache_by_key = {}
        _cache_ts = now
        _cache_failed = True
        logger.warning("Express user directory unavailable (%s): %s", table, exc)
        return {}

    _cache_by_key = _build_lookup(rows)
    _cache_ts = now
    _cache_failed = False
    return _cache_by_key


def lookup_express_huid(directory: dict[str, str], full_name: str) -> str | None:
    for key_fn in (key_full, key_last_first):
        key = key_fn(full_name)
        if key and key in directory:
            return directory[key]
    return None


async def resolve_express_huid_for_name(
    session: AsyncSession,
    settings: Settings,
    full_name: str,
) -> str | None:
    directory = await load_express_user_directory(session, settings)
    return lookup_express_huid(directory, full_name)


async def fill_express_id_if_empty(
    session: AsyncSession,
    settings: Settings,
    row: object,
) -> bool:
    """Подставляет express_id из справочника, если в карточке поле пустое."""
    current = (getattr(row, "express_id", "") or "").strip()
    if current:
        return False
    full_name = (getattr(row, "full_name", "") or "").strip()
    if not full_name:
        return False
    try:
        huid = await resolve_express_huid_for_name(session, settings, full_name)
    except SQLAlchemyError as exc:
        logger.warning("Express ID lookup skipped: %s", exc)
        return False
    if not huid:
        return False
    row.express_id = huid  # type: ignore[attr-defined]
    return True
