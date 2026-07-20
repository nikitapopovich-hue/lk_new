from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routes import (
    accounts,
    admin,
    auto_mapping,
    backoffice,
    calendar,
    calls,
    dashboard,
    finance,
    finance_journal,
    health,
    horoscope,
    kc_data,
    kc_structure,
    mappings,
    me,
    notifications,
    profile,
    team,
    teams,
    triggers_ra,
    uis,
    violation_journal,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(me.router, prefix="/me", tags=["me"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(kc_data.router, prefix="/kc-data", tags=["kc-data"])
api_router.include_router(kc_structure.router, prefix="/kc-data/structure", tags=["kc-structure"])
api_router.include_router(violation_journal.router, prefix="/violation-journal", tags=["violation-journal"])
api_router.include_router(finance_journal.router, prefix="/finance-journal", tags=["finance-journal"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(horoscope.router, prefix="/horoscope", tags=["horoscope"])
api_router.include_router(calls.router, prefix="/calls", tags=["calls"])
api_router.include_router(team.router, prefix="/team", tags=["team"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(backoffice.router, prefix="/backoffice", tags=["backoffice"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(mappings.router, prefix="/mappings", tags=["mappings"])
api_router.include_router(auto_mapping.router, prefix="/mappings/auto", tags=["mappings-auto"])
api_router.include_router(uis.router, prefix="/uis", tags=["uis"])
api_router.include_router(triggers_ra.router, prefix="/triggers-ra", tags=["triggers-ra"])

