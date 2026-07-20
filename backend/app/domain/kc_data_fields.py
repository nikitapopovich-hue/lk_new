from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KcFieldDef:
    key: str
    label: str
    default_operator: bool
    default_supervisor: bool


KC_FIELD_DEFINITIONS: list[KcFieldDef] = [
    KcFieldDef("line", "Линия", True, True),
    KcFieldDef("company", "Компания", True, True),
    KcFieldDef("city", "Город", True, True),
    KcFieldDef("fullName", "ФИО", True, True),
    KcFieldDef("position", "Должность", True, True),
    KcFieldDef("gradeNew", "Грейд", True, True),
    KcFieldDef("emailNew", "E-mail", False, True),
    KcFieldDef("phone", "Телефон", False, True),
    KcFieldDef("residenceAddress", "Адрес проживания", False, True),
    KcFieldDef("telegramUsername", "Имя пользователя в Telegram", False, True),
    KcFieldDef("expressId", "eXpress id", False, True),
    KcFieldDef("accountNumber", "Номер счета", False, False),
    KcFieldDef("accountNumberExtra", "Дополнительный счёт", False, True),
    KcFieldDef("telegramId", "ID Telegram", False, False),
    KcFieldDef("birthDate", "Дата рождения", False, True),
    KcFieldDef("firstWorkDay", "Первый рабочий день", True, True),
    KcFieldDef("accessDate", "Допуск", False, True),
    KcFieldDef("careerPath", "Карта развития", False, True),
    KcFieldDef("department", "Отдел", True, True),
    KcFieldDef("subdivision", "Подраздел", True, True),
]

KC_FIELD_KEYS = [f.key for f in KC_FIELD_DEFINITIONS]
