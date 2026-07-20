from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.deps.db import init_db_engine
from app.api.v1.router import api_router
from app.api.v1.routes import auth as auth_routes
from app.core.config import get_settings, resolve_frontend_dist
from app.spa_static import mount_frontend_spa
from app.infra.models import Base
from app.infra.kc_seed import seed_kc_data_if_empty
from app.infra.account_seed import seed_bootstrap_admin_if_empty
from app.infra.horoscope_scheduler import start_horoscope_scheduler, stop_horoscope_scheduler
from app.infra.violation_seed import seed_violation_entries_if_empty, seed_violation_types_if_empty
from app.infra.schema_migrate import (
    migrate_employee_profiles,
    migrate_employee_profiles_google_widen,
    migrate_kc_employees,
    migrate_kc_field_visibility_rows,
    migrate_kc_employees_extended_fields,
    migrate_kc_employees_line_widen,
    migrate_kc_structure_links,
    migrate_kc_structure_nodes,
    migrate_kc_structure_suppressed_keys,
    migrate_teams,
    migrate_violation_fine_acknowledgments,
    migrate_violation_journal_entries,
)

app = FastAPI(title="LK Operator / Supervisor API", version="0.1.0")

_settings = get_settings()
_cors_origins = [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(api_router)

_KC_PHOTOS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "kc"
_KC_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/kc", StaticFiles(directory=_KC_PHOTOS_DIR), name="kc_photos")

_settings_boot = get_settings()
_dist = resolve_frontend_dist(_settings_boot)
_should_serve = _settings_boot.serve_frontend or _settings_boot.app_env == "production"
if _should_serve and mount_frontend_spa(app, _dist):
    print(f"LK_SPA=1 dist={_dist}")
elif _should_serve:
    print(f"LK_SPA=0 dist missing: {_dist}")


@app.on_event("startup")
async def _startup() -> None:
    settings = get_settings()
    print("LK_API_BUILD=2026-05-06-bo-group-filter-v1")
    from app.core.config import resolve_oauth_redirect_uri

    print(f"LK_OAUTH_REDIRECT={resolve_oauth_redirect_uri(settings)}")
    if len(settings.app_secret_key) < 32:
        print(
            "[LK] Предупреждение: APP_SECRET_KEY короче 32 символов — "
            "задайте длинную случайную строку в .env"
        )
    engine = init_db_engine(settings)
    if not engine:
        print("LK_DB=0 (DATABASE_URL не задан — часть функций недоступна)")
        return
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(migrate_employee_profiles)
            await conn.run_sync(migrate_employee_profiles_google_widen)
            await conn.run_sync(migrate_kc_employees)
            await conn.run_sync(migrate_kc_field_visibility_rows)
            await conn.run_sync(migrate_kc_employees_extended_fields)
            await conn.run_sync(migrate_kc_employees_line_widen)
            await conn.run_sync(migrate_kc_structure_nodes)
            await conn.run_sync(migrate_kc_structure_links)
            await conn.run_sync(migrate_kc_structure_suppressed_keys)
            await conn.run_sync(migrate_violation_journal_entries)
            await conn.run_sync(migrate_teams)
            await conn.run_sync(migrate_violation_fine_acknowledgments)

        from app.api.v1.deps.db import get_sessionmaker, reset_db_pool

        await reset_db_pool()

        async with get_sessionmaker(settings)() as session:
            await seed_kc_data_if_empty(session)
            await seed_violation_types_if_empty(session)
            await seed_violation_entries_if_empty(session)
            await seed_bootstrap_admin_if_empty(session, settings)
        start_horoscope_scheduler(settings)
        print("LK_DB=1")
    except OSError as exc:
        print(
            "\n[LK] Не удалось подключиться к Postgres.\n"
            "  • Проверьте DATABASE_URL и доступность сервера\n"
            "  • Для удалённой БД попробуйте DATABASE_SSL=true\n"
            "  • Локально: npm run db:up\n"
            f"  Ошибка: {exc}\n"
        )
    except Exception as exc:
        import traceback

        print(
            "\n[LK] Ошибка инициализации БД (OAuth и статика работают, API с БД может быть недоступен):\n"
            f"  {exc}\n"
        )
        traceback.print_exc()


@app.on_event("shutdown")
async def _shutdown() -> None:
    stop_horoscope_scheduler()
