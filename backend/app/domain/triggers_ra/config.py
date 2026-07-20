"""Конфигурация проектов TouchPoint и пороги аналитики выгорания."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class ProjectGroup(str, Enum):
    SP = "sp"
    VIP = "vip"
    TM = "tm"


@dataclass(frozen=True)
class ProjectConfig:
    id: str
    name: str
    group: ProjectGroup
    theme_field: str | None = None
    nekonstruktiv_value: str | None = None
    nekonstruktiv_wildcard: str | None = None
    status_field: str = "file.properties.StatusName"
    has_client_sentiment: bool = False
    # EndCall: «Оператор» / «Клиент» (входящие СП/VIP, file.properties.EndCall)
    # OperatorEndCall: 1 = оператор, 0 = клиент (ТМ)
    end_call_field: Literal["EndCall", "OperatorEndCall"] | None = None
    operator_end_value: str | int | None = None
    # Промпт выгорания: номер пункта формы (1-based) и id form_items в Elasticsearch
    burnout_form_item_number: int | None = None
    burnout_form_item_id: str | None = None


# Стадии документа (общие для всех проектов)
STAGE_QC_VERIFIED = "1080669263519293440"  # «Проверено»
STAGE_MONITORING = "1080714221315956736"  # «Взять в мониторинг»

# Исключённые проекты
EXCLUDED_PROJECT_IDS: frozenset[str] = frozenset(
    {
        "1021567246830411776",
        "1014634808837414912",
        "1021567615052554240",
        "1014634472273879040",
        "1014634627140165632",
        "1021513988594212864",
        "1078145375291842560",
        "107814490164167475",
        "1078140989782106112",
        "1078144267542601728",
        "1062892786354757632",
        "1063254276811268096",
        "1063225398243893248",
        "1063258828776153088",
    }
)

# Статусы ТМ (из UI; при первом запуске дополняются из API)
TM_STATUS_NAMES: list[str] = [
    "Согласие",
    "Звонок сорвался",
    "Отказ от разговора",
    "Воспользовался/Внес депозит",
    "Отказ",
    "Клиента не слышно",
    "Перезвон",
    "Другое",
    "Третье лицо",
    "Не гражданин РФ",
    "Перевод на СП",
    "Автоответчик",
    "Нет 18-ти лет",
    "Дайлер. Дозвон",
]

PROJECTS: dict[str, ProjectConfig] = {
    # СП
    "1063200411713806336": ProjectConfig(
        id="1063200411713806336",
        name="Входящие (СП)",
        group=ProjectGroup.SP,
        theme_field="file.properties.FullTheme",
        nekonstruktiv_value="Другое > Неконструктив",
        has_client_sentiment=True,
        end_call_field="EndCall",
        operator_end_value="Оператор",
        burnout_form_item_number=15,
    ),
    "1063254594366218240": ProjectConfig(
        id="1063254594366218240",
        name="Запросы (СП)",
        group=ProjectGroup.SP,
        theme_field="file.properties.theme",
        nekonstruktiv_value="Другое > Неконструктив",
        burnout_form_item_number=7,
    ),
    "1063259310391304192": ProjectConfig(
        id="1063259310391304192",
        name="Чаты (СП)",
        group=ProjectGroup.SP,
        theme_field="file.properties.full_theme",
        nekonstruktiv_value="Другое > Неконструктив",
        burnout_form_item_number=15,
    ),
    "1078143861563334656": ProjectConfig(
        id="1078143861563334656",
        name="PARI PASS",
        group=ProjectGroup.SP,
        theme_field="file.properties.full_theme",
        nekonstruktiv_value="Pari Pass > Неконструктив",
        burnout_form_item_number=11,
    ),
    # VIP
    "1078148394817429504": ProjectConfig(
        id="1078148394817429504",
        name="Входящие (VIP)",
        group=ProjectGroup.VIP,
        theme_field="file.properties.FullTheme",
        nekonstruktiv_value="Другое > Неконструктив VIP",
        has_client_sentiment=True,
        end_call_field="EndCall",
        operator_end_value="Оператор",
        burnout_form_item_number=9,
    ),
    "1078145200011878400": ProjectConfig(
        id="1078145200011878400",
        name="Запросы (VIP)",
        group=ProjectGroup.VIP,
        theme_field="file.properties.theme",
        nekonstruktiv_wildcard="*Неконструктив VIP*",
        burnout_form_item_number=11,
    ),
    "1078144709999730688": ProjectConfig(
        id="1078144709999730688",
        name="Чаты (VIP)",
        group=ProjectGroup.VIP,
        theme_field="file.properties.full_theme",
        nekonstruktiv_value="Другое > Неконструктив VIP",
        burnout_form_item_number=8,
    ),
    # ТМ
    "1063227809872224256": ProjectConfig(
        id="1063227809872224256",
        name="Взаимодействие/Реактивация",
        group=ProjectGroup.TM,
        has_client_sentiment=True,
        end_call_field="OperatorEndCall",
        operator_end_value=1,
        burnout_form_item_number=17,
    ),
}

OPERATOR_FIELD = "file.properties.operator"
# «Уровень негатива Клиента (взвешенный)» в UI TouchPoint — только client, не operator
CLIENT_NEG_FIELD = "client.sentiment_negative.duration_fraction.total_weighted"
WEIGHT_FIELD = "weight"

# Пороги LLM (промпт выгорания в form_items)
LLM_BURNOUT_TRIGGER_SCORE = 61
LLM_BURNOUT_DELTA = 10.0
MIN_LLM_SAMPLES = 3

# Пороги
MIN_CALLS_PER_OPERATOR = 10
MIN_QC_CHECKS_FOR_T5 = 5
RISK_SCORE_THRESHOLD = 51
RISK_MIN_TRIGGERS = 2

DEFAULT_PERIOD_DAYS = 14
CHART_PERIOD_DAYS = 30

# Веса composite score (СП + VIP)
SCORE_WEIGHTS = {
    "t1_sp_nekonstruktiv": 25,
    "t2_vip_nekonstruktiv": 15,
    "t3_client_negative": 15,
    "t4_operator_end": 15,
    "t5_qc_score": 10,
    "t6_behavior": 15,
    "t11_llm_burnout": 5,
}

# Пороги отклонения от базы (предыдущий период) для триггеров, %
TRIGGER_DELTA_PCT = 5.0
QC_SCORE_DROP = 5.0  # пункты weight


def active_projects() -> list[ProjectConfig]:
    return [p for p in PROJECTS.values() if p.id not in EXCLUDED_PROJECT_IDS]


def sp_vip_projects() -> list[ProjectConfig]:
    return [p for p in active_projects() if p.group in (ProjectGroup.SP, ProjectGroup.VIP)]


def tm_projects() -> list[ProjectConfig]:
    return [p for p in active_projects() if p.group == ProjectGroup.TM]
