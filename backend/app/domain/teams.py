from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List
from uuid import uuid4


@dataclass
class Team:
    id: str
    name: str
    member_user_ids: list[str] = field(default_factory=list)


class TeamStore:
    """
    Временное хранилище в памяти.
    Позже заменим на Postgres (таблицы teams + team_members).
    """

    def __init__(self) -> None:
        self._teams: Dict[str, Team] = {}

    def list(self) -> list[Team]:
        return list(self._teams.values())

    def get(self, team_id: str) -> Team | None:
        return self._teams.get(team_id)

    def create(self, *, name: str, member_user_ids: List[str]) -> Team:
        team_id = uuid4().hex
        t = Team(id=team_id, name=name, member_user_ids=list(dict.fromkeys(member_user_ids)))
        self._teams[team_id] = t
        return t

    def update(self, *, team_id: str, name: str | None, member_user_ids: List[str] | None) -> Team:
        t = self._teams[team_id]
        if name is not None:
            t.name = name
        if member_user_ids is not None:
            t.member_user_ids = list(dict.fromkeys(member_user_ids))
        return t

    def delete(self, team_id: str) -> None:
        self._teams.pop(team_id, None)


team_store = TeamStore()

