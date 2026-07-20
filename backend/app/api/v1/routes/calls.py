from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class Period(BaseModel):
    from_: datetime = Field(alias="from")
    to: datetime
    tz: str = "Europe/Moscow"


class CallsListRequest(BaseModel):
    period: Period
    filters: dict = Field(default_factory=dict)
    pagination: dict = Field(default_factory=lambda: {"limit": 50, "offset": 0})
    sort: dict = Field(default_factory=dict)


@router.post("/list")
async def calls_list(body: CallsListRequest) -> dict:
    # Заглушка: сюда подключим UIS get.calls_report / 3iTech поиск документов.
    return {
        "period": {"from": body.period.from_.isoformat(), "to": body.period.to.isoformat(), "tz": body.period.tz},
        "rows": [],
        "total": 0,
        "meta": {},
    }

