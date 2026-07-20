"""Форматирование и подписи для Тригеров РА (без pandas)."""

from __future__ import annotations

from typing import Any, Literal

from app.domain.triggers_ra.config import (
    LLM_BURNOUT_DELTA,
    LLM_BURNOUT_TRIGGER_SCORE,
    MIN_CALLS_PER_OPERATOR,
    MIN_LLM_SAMPLES,
    MIN_QC_CHECKS_FOR_T5,
    QC_SCORE_DROP,
    RISK_MIN_TRIGGERS,
    RISK_SCORE_THRESHOLD,
    SCORE_WEIGHTS,
    TRIGGER_DELTA_PCT,
)

TrendSentiment = Literal["good", "bad", "neutral"]

TRIGGER_LABELS: dict[str, str] = {
    "T1: неконструктив СП ↑": "Стало больше неконструктивных обращений в проектах СП",
    "T2: неконструктив VIP ↑": "Стало больше неконструктивных обращений в VIP",
    "T3: негатив клиента ↑": "Клиенты чаще в негативе (по голосовым звонкам)",
    "T4: завершение оператором ↑": "Оператор чаще сам завершает разговор",
    "T5-QC: оценка ОКК ↓": "Снизилась средняя оценка после проверки ОКК",
    "T6–T10: поведение": "Несколько признаков проблемного поведения одновременно",
    "T11: LLM burnout": "ИИ отмечает повышенный риск выгорания",
}


def humanize_triggers(triggers: list[str]) -> str:
    if not triggers:
        return "—"
    return "; ".join(TRIGGER_LABELS.get(t, t) for t in triggers)


def fmt_int(value: Any) -> str:
    if value is None:
        return "—"
    return str(int(value))


def fmt_pct(value: Any, *, decimals: int = 1) -> str:
    if value is None:
        return "—"
    v = float(value)
    if abs(v) < 0.05:
        return "0%"
    rounded = round(v, decimals)
    if decimals == 0 or abs(rounded - round(rounded)) < 10 ** -(decimals + 1):
        return f"{int(round(rounded))}%"
    text = f"{rounded:.{decimals}f}".rstrip("0").rstrip(".")
    return f"{text}%"


def fmt_score(value: Any) -> str:
    if value is None:
        return "—"
    v = float(value)
    if abs(v - round(v)) < 0.05:
        return str(int(round(v)))
    return f"{v:.1f}".rstrip("0").rstrip(".")


def fmt_trend_pp(
    delta: float | None,
    *,
    higher_is_worse: bool = True,
) -> tuple[str, TrendSentiment]:
    if delta is None:
        return "—", "neutral"
    if abs(delta) < 0.05:
        return "→ 0", "neutral"

    arrow = "↑" if delta > 0 else "↓"
    mag = abs(delta)
    if abs(mag - round(mag)) < 0.05:
        mag_text = str(int(round(mag)))
    else:
        mag_text = f"{mag:g}"

    text = f"{arrow} {mag_text} п.п."

    if higher_is_worse:
        sentiment: TrendSentiment = "bad" if delta > 0 else "good"
    else:
        sentiment = "good" if delta > 0 else "bad"
    return text, sentiment


def fmt_trend_points(
    delta: float | None,
    *,
    higher_is_worse: bool = True,
) -> tuple[str, TrendSentiment]:
    if delta is None:
        return "—", "neutral"
    if abs(delta) < 0.05:
        return "→ 0", "neutral"
    arrow = "↑" if delta > 0 else "↓"
    text = f"{arrow} {abs(delta):g} б."
    if higher_is_worse:
        sentiment: TrendSentiment = "bad" if delta > 0 else "good"
    else:
        sentiment = "good" if delta > 0 else "bad"
    return text, sentiment


FORMULAS_MARKDOWN = f"""
### Обращений
Число обращений оператора за выбранный период (все проекты СП и VIP).

### Неконструктив, %
Доля обращений с тематикой «Неконструктив» от общего числа обращений.

### Негатив клиента, %
Средний **уровень негатива клиента (взвешенный)** по голосовым звонкам (Входящие СП/VIP, ТМ).  
Звонки с 0% тоже учитываются. Значение из TouchPoint × 100 = проценты в интерфейсе.

### Завершил оператор, %
Доля звонков, где разговор завершил оператор (поле EndCall = «Оператор» или OperatorEndCall = 1).

### Оценка ОКК, %
Средняя оценка **weight** по обращениям на стадии «Проверено» (× 100 для отображения в %).

### В мониторинге, %
Доля обращений, взятых на стадию «Взять в мониторинг».

### Риск выгорания (ИИ) / Эмпатия / Вовлечённость
Средние значения из JSON промпта выгорания в **form_items** (шкала 0–100).  
Если по оператору мало оценок — показатель пустой.

### Преждевр. завершение, %
Доля обращений, где ИИ отметил **premature_closure** (преждевременное завершение).

---

### Колонки «Δ …» (динамика)
Сравнение с **предыдущим периодом** той же длины.  
**п.п.** — процентные пункты (насколько изменился показатель).

| Стрелка | Цвет | Значение |
|---------|------|----------|
| ↑ | красный | показатель вырос (обычно это ухудшение) |
| ↓ | зелёный | показатель снизился (обычно улучшение) |
| → 0 | серый | без заметного изменения |

Для **оценки ОКК**, **эмпатии** и **вовлечённости** логика обратная: рост — зелёный, падение — красный.

---

### Балл риска
Сумма весов сработавших признаков (макс. 100):

| Признак | Баллы |
|---------|-------|
| Рост неконструктива СП (≥ {TRIGGER_DELTA_PCT:g} п.п.) | {SCORE_WEIGHTS["t1_sp_nekonstruktiv"]} |
| Рост неконструктива VIP | {SCORE_WEIGHTS["t2_vip_nekonstruktiv"]} |
| Рост негатива клиента | {SCORE_WEIGHTS["t3_client_negative"]} |
| Чаще завершает оператор | {SCORE_WEIGHTS["t4_operator_end"]} |
| Падение оценки ОКК (≥ {QC_SCORE_DROP:g} п.) | {SCORE_WEIGHTS["t5_qc_score"]} |
| Несколько признаков поведения | {SCORE_WEIGHTS["t6_behavior"]} |
| Риск выгорания по ИИ | {SCORE_WEIGHTS["t11_llm_burnout"]} |

**Зона риска:** балл ≥ {RISK_SCORE_THRESHOLD} **или** ≥ {RISK_MIN_TRIGGERS} срабатываний одновременно.

---

### Срабатывания
Список признаков, которые **сработали** в текущем периоде по сравнению с базой.  
Формулировки даны простым языком без кодов T1–T11.

---

### Порог включения в рейтинг
Оператор попадает в таблицу при **≥ {MIN_CALLS_PER_OPERATOR}** обращениях за период.  
ИИ-триггер учитывается при **≥ {MIN_LLM_SAMPLES}** оценках; порог риска ИИ — **{LLM_BURNOUT_TRIGGER_SCORE}** или рост на **{LLM_BURNOUT_DELTA:g}** баллов.  
ОКК-триггер — при **≥ {MIN_QC_CHECKS_FOR_T5}** проверках.
"""
