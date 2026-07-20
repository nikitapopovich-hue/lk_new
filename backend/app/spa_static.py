from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Первый сегмент — зарезервирован под API (не отдаём JSON 404 браузеру на эти URL).
_API_ROOT_SEGMENTS = frozenset(
    {
        "auth",
        "health",
        "me",
        "notifications",
        "profile",
        "kc-data",
        "violation-journal",
        "finance-journal",
        "finance",
        "dashboard",
        "calendar",
        "horoscope",
        "calls",
        "team",
        "teams",
        "mappings",
        "admin",
        "backoffice",
        "uis",
        "triggers-ra",
        "uploads",
        "docs",
        "openapi.json",
        "redoc",
    }
)

# React Router: те же префиксы, что и API, но это страницы приложения (F5 / прямой заход).
_SPA_PAGE_PATHS = frozenset(
    {
        "kc-data",
        "kc-data/structure",
        "profile",
        "finance",
        "mappings",
        "teams",
        "triggers",
        "triggers/ra",
        "remote-work",
        "violations",
        "violations/journal",
        "violations/stats",
        "overtime",
        "overtime/journal",
        "overtime/stats",
        "bonuses",
        "bonuses/journal",
        "recalculations",
        "recalculations/journal",
        "kpd",
        "kpd/view",
        "kpd/upload",
        "login",
    }
)


def _is_api_path(full_path: str) -> bool:
    segment = full_path.split("/", 1)[0]
    return segment in _API_ROOT_SEGMENTS


def _wants_html(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    return "text/html" in accept or "application/xhtml+xml" in accept


def mount_frontend_spa(app: FastAPI, dist_dir: Path) -> bool:
    """Раздаёт собранный Vite (`frontend/dist`) и SPA fallback. Возвращает True, если смонтировано."""
    if not dist_dir.is_dir():
        return False

    index_html = dist_dir / "index.html"
    if not index_html.is_file():
        return False

    assets_dir = dist_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request) -> FileResponse:
        if full_path == "auth/callback":
            return FileResponse(index_html)

        if full_path:
            candidate = dist_dir / full_path
            if candidate.is_file():
                return FileResponse(candidate)

        if not full_path or full_path in _SPA_PAGE_PATHS:
            return FileResponse(index_html)

        if _is_api_path(full_path):
            if _wants_html(request):
                return FileResponse(index_html)
            raise HTTPException(status_code=404, detail="Not Found")

        return FileResponse(index_html)

    return True
