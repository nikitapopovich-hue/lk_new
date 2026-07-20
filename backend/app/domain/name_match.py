from __future__ import annotations

import re


def normalize_ru_name(name: str) -> str:
    """
    Нормализация ФИО для сопоставления между системами:
    - lower
    - ё -> е
    - убираем знаки/пунктуацию
    - сжимаем пробелы
    """
    s = (name or "").strip().lower()
    s = s.replace("ё", "е")
    s = re.sub(r"[^a-zа-я0-9\s-]+", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def name_tokens(name: str) -> list[str]:
    s = normalize_ru_name(name)
    if not s:
        return []
    # дефисные фамилии считаем как одно слово
    return [t for t in s.split(" ") if t]


def key_full(name: str) -> str:
    return " ".join(name_tokens(name))


def key_last_first(name: str) -> str:
    toks = name_tokens(name)
    if len(toks) >= 2:
        return f"{toks[0]} {toks[1]}"
    return ""

