from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class Period(BaseModel):
    from_: datetime = Field(alias="from")
    to: datetime
    tz: str = "Europe/Moscow"


class TeamOverviewRequest(BaseModel):
    period: Period
    scope: str = "team"
    filters: dict = Field(default_factory=dict)


@router.post("/overview")
async def team_overview(body: TeamOverviewRequest) -> dict:
    # Заглушка: сюда подключим агрегацию KPI по операторам (UIS + Usedesk + 3iTech).
    return {
        "period": {"from": body.period.from_.isoformat(), "to": body.period.to.isoformat(), "tz": body.period.tz},
        "operators": [],
        "meta": {},
    }

