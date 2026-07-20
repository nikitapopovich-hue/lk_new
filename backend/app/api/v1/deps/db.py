from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.infra.db import create_engine, create_sessionmaker

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None
_engine_database_url: str | None = None


def init_db_engine(settings: Settings) -> AsyncEngine | None:
    """Один engine / пул на процесс — для startup и HTTP-запросов."""
    global _engine, _sessionmaker, _engine_database_url

    url = (settings.database_url or "").strip()
    if not url:
        _engine = None
        _sessionmaker = None
        _engine_database_url = None
        return None

    if _engine is not None and _sessionmaker is not None and _engine_database_url == url:
        return _engine

    _engine = create_engine(settings)
    if not _engine:
        _sessionmaker = None
        _engine_database_url = None
        return None

    _sessionmaker = create_sessionmaker(_engine)
    _engine_database_url = url
    return _engine


def get_sessionmaker(settings: Settings) -> async_sessionmaker[AsyncSession]:
    engine = init_db_engine(settings)
    if engine is None or _sessionmaker is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not configured")
    return _sessionmaker


async def get_db_session(settings: Settings = Depends(get_settings)) -> AsyncIterator[AsyncSession]:
    sm = get_sessionmaker(settings)
    async with sm() as session:
        yield session


async def reset_db_pool() -> None:
    """Сброс пула после ALTER TABLE — иначе asyncpg держит устаревший prepared statement cache."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
