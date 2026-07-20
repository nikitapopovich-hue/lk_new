#!/usr/bin/env python3
"""
Среднее время консультации операторов — проект Запросы (СП).

Проект: 1063254594366218240
Тематика: file.properties.theme = «1 Акции > Запрос на бонус»
Исключение: операторы из EXCLUDED_OPERATORS

Длительность консультации (чаты BackOffice):
    max(_dialog[].begin_time) - min(_dialog[].begin_time), миллисекунды.

Примеры:
    python avg_consultation_time.py
    python avg_consultation_time.py --document-id 22201757
    python avg_consultation_time.py --output consultation_q1_2026.csv
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from zoneinfo import ZoneInfo

import requests

from touchpoint_client import TouchPointAPIError, TouchPointClient

PROJECT_ID = "1063254594366218240"
PROJECT_NAME = "Запросы (СП)"
THEME = "1 Акции > Запрос на бонус"
EXCLUDED_OPERATORS: tuple[str, ...] = (
    "Ростов CSAT",
    "Чичибабина Юлия",
    "Зайтемирова Шумайсат",
    "Фоменко Елена",
    "Фоменко Денис",
    "Урупина Дарья",
    "Бондарь Есения",
    "Каримова Газиза",
    "Никитина Татьяна",
    "Чернов Андрей",
    "Гуляев Дмитрий",
    "Ивашинникова Кристина",
    "Ульшин Михаил",
    "Самохин Дмитрий",
    "Кизин Денис",
    "Беглецовайте Дана",
)
APP_DOCUMENT_URL = (
    "https://app.v20.touchpoint-analytics.ru/projects/"
    f"{PROJECT_ID}/documents/{{doc_id}}"
)

DEFAULT_DATE_FROM = "2026-01-01"
DEFAULT_DATE_TO = "2026-03-31"

SCROLL_PAGE_SIZE = 500
SCROLL_TTL = "2m"
MAX_DOCS = 200_000
MSK = ZoneInfo("Europe/Moscow")

FETCH_FIELDS = [
    "created_date",
    "file.properties",
    "_dialog",
    "_internal_data.id",
]

log = logging.getLogger("avg_consultation")


@dataclass
class ConsultationRow:
    document_id: str
    created_at: str
    operator: str
    theme: str
    duration_ms: int
    duration_hms: str
    message_count: int
    first_begin_ms: int
    last_begin_ms: int
    url: str


@dataclass
class OperatorStats:
    operator: str
    count: int = 0
    total_ms: int = 0

    @property
    def avg_ms(self) -> float:
        return self.total_ms / self.count if self.count else 0.0


@dataclass
class AggregateStats:
    rows: list[ConsultationRow] = field(default_factory=list)
    skipped_no_dialog: int = 0
    skipped_short_dialog: int = 0
    skipped_excluded_operator: int = 0
    scanned: int = 0
    expected_count: int | None = None

    @property
    def count(self) -> int:
        return len(self.rows)

    @property
    def total_ms(self) -> int:
        return sum(r.duration_ms for r in self.rows)

    @property
    def avg_ms(self) -> float:
        return self.total_ms / self.count if self.count else 0.0

    def by_operator(self) -> list[OperatorStats]:
        buckets: dict[str, OperatorStats] = {}
        for row in self.rows:
            stat = buckets.get(row.operator)
            if not stat:
                stat = OperatorStats(operator=row.operator)
                buckets[row.operator] = stat
            stat.count += 1
            stat.total_ms += row.duration_ms
        return sorted(buckets.values(), key=lambda s: (-s.count, s.operator))


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def parse_date_arg(text: str, *, end_of_day: bool = False) -> datetime:
    dt = datetime.strptime(text, "%Y-%m-%d")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    else:
        dt = dt.replace(hour=0, minute=0, second=0)
    return dt.replace(tzinfo=MSK)


def to_api_iso(dt: datetime) -> str:
    utc = dt.astimezone(timezone.utc).replace(microsecond=0)
    return utc.isoformat().replace("+00:00", "Z")


def ms_to_hms(ms: int) -> str:
    total_sec = max(0, ms) // 1000
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    seconds = total_sec % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def get_nested(data: dict, path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def parse_created_at(fields: dict[str, Any]) -> str:
    raw = fields.get("created_date") or get_nested(
        fields, "file.properties.record_start_time"
    )
    if not raw:
        return "—"
    text = str(raw).strip()
    try:
        if text.endswith("Z"):
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        else:
            dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=MSK)
        return dt.astimezone(MSK).strftime("%d.%m.%Y %H:%M:%S")
    except ValueError:
        return text


def get_operator_name(fields: dict[str, Any]) -> str:
    value = get_nested(fields, "file.properties.operator")
    if value:
        return str(value).strip()
    return "—"


def get_theme(fields: dict[str, Any]) -> str:
    value = get_nested(fields, "file.properties.theme")
    return str(value).strip() if value else "—"


def get_document_id(item: dict[str, Any], fields: dict[str, Any]) -> str | None:
    for candidate in (
        item.get("id"),
        get_nested(fields, "_internal_data.id"),
        get_nested(fields, "file.properties.chat_id"),
    ):
        if candidate:
            return str(candidate)
    return None


def extract_dialog_begin_times(fields: dict[str, Any]) -> list[int]:
    dialog = fields.get("_dialog")
    if not isinstance(dialog, list):
        return []
    times: list[int] = []
    for message in dialog:
        if not isinstance(message, dict):
            continue
        begin = message.get("begin_time")
        if begin is None:
            continue
        try:
            times.append(int(begin))
        except (TypeError, ValueError):
            continue
    return times


def compute_consultation_duration_ms(fields: dict[str, Any]) -> tuple[int | None, dict[str, Any]]:
    """
    Длительность консультации = последнее сообщение - первое (begin_time, мс).
    Возвращает (duration_ms | None, debug).
    """
    dialog = fields.get("_dialog")
    if not isinstance(dialog, list) or not dialog:
        return None, {"reason": "нет _dialog"}

    times = extract_dialog_begin_times(fields)
    if len(times) < 2:
        return None, {
            "reason": "меньше двух сообщений с begin_time",
            "message_count": len(dialog),
            "times_count": len(times),
        }

    first_ms = min(times)
    last_ms = max(times)
    duration_ms = last_ms - first_ms
    return duration_ms, {
        "first_begin_ms": first_ms,
        "last_begin_ms": last_ms,
        "message_count": len(dialog),
        "times_count": len(times),
        "formula": f"{last_ms} - {first_ms} = {duration_ms}",
    }


def build_row(item: dict[str, Any]) -> tuple[ConsultationRow | None, str | None]:
    fields = item.get("fields")
    if not isinstance(fields, dict):
        fields = item

    operator = get_operator_name(fields)
    if operator in EXCLUDED_OPERATORS:
        return None, "excluded_operator"

    duration_ms, debug = compute_consultation_duration_ms(fields)
    if duration_ms is None:
        reason = debug.get("reason", "unknown")
        if reason == "нет _dialog":
            return None, "no_dialog"
        return None, "short_dialog"

    doc_id = get_document_id(item, fields)
    if not doc_id:
        return None, "no_id"

    return (
        ConsultationRow(
            document_id=doc_id,
            created_at=parse_created_at(fields),
            operator=operator,
            theme=get_theme(fields),
            duration_ms=duration_ms,
            duration_hms=ms_to_hms(duration_ms),
            message_count=int(debug.get("message_count") or 0),
            first_begin_ms=int(debug["first_begin_ms"]),
            last_begin_ms=int(debug["last_begin_ms"]),
            url=APP_DOCUMENT_URL.format(doc_id=doc_id),
        ),
        None,
    )


def base_filters(date_from: datetime, date_to: datetime) -> list[dict[str, Any]]:
    return [
        {
            "range": {
                "created_date": {
                    "gte": to_api_iso(date_from),
                    "lte": to_api_iso(date_to),
                }
            }
        },
        {"term": {"file.properties.theme": THEME}},
        {
            "bool": {
                "must_not": [
                    {"terms": {"file.properties.operator": list(EXCLUDED_OPERATORS)}}
                ]
            }
        },
    ]


def extract_search_documents(payload: dict[str, Any]) -> list[dict]:
    docs = payload.get("documents")
    if isinstance(docs, list):
        return [d for d in docs if isinstance(d, dict)]
    return []


def post_scroll(client: TouchPointClient, scroll_id: str) -> dict[str, Any]:
    url = f"{client.api_base_url}/projects/search/scroll"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {client.access_token}",
            "Content-Type": "application/json",
        },
        json={"scroll_id": scroll_id, "scroll": SCROLL_TTL},
        timeout=120,
    )
    if resp.status_code == 404:
        return {"documents": [], "scroll_id": None, "__scroll_not_found__": True}
    if resp.status_code >= 400:
        raise TouchPointAPIError(
            f"scroll → {resp.status_code}",
            status_code=resp.status_code,
            body=resp.text[:2000],
        )
    return resp.json()


def parse_expected_count(payload: dict[str, Any]) -> int | None:
    raw = payload.get("count") or payload.get("total")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def iter_documents(
    client: TouchPointClient,
    date_from: datetime,
    date_to: datetime,
    *,
    document_id: str | None = None,
    meta_out: dict[str, Any] | None = None,
) -> Iterator[dict]:
    filters = base_filters(date_from, date_to)
    if document_id:
        filters = [
            {
                "bool": {
                    "should": [
                        {"term": {"_internal_data.id": document_id}},
                        {"term": {"_id": document_id}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        ]

    body: dict[str, Any] = {
        "query": "*",
        "filters": filters,
        "fetch_fields": FETCH_FIELDS,
        "with_id": True,
        "offset": 0,
        "limit": 1 if document_id else SCROLL_PAGE_SIZE,
        "scroll": SCROLL_TTL,
    }

    processed = 0
    first = client.search_documents(PROJECT_ID, body)
    scroll_id = first.get("scroll_id")
    expected_count = parse_expected_count(first)
    if meta_out is not None:
        meta_out["expected_count"] = expected_count
    if expected_count is not None and not document_id:
        log.info("Ожидается обращений по фильтру API: %d", expected_count)

    for item in extract_search_documents(first):
        yield item
        processed += 1
        if document_id or processed >= MAX_DOCS:
            return

    empty_batches = 0
    while scroll_id:
        nxt = post_scroll(client, scroll_id)
        if nxt.get("__scroll_not_found__"):
            log.warning("Scroll-контекст истёк (404) после %d документов", processed)
            break
        scroll_id = nxt.get("scroll_id")
        batch = extract_search_documents(nxt)
        if not batch:
            empty_batches += 1
            if empty_batches >= 2:
                break
            continue
        empty_batches = 0
        for item in batch:
            yield item
            processed += 1
            if processed >= MAX_DOCS:
                log.warning("Достигнут лимит документов: %d", MAX_DOCS)
                return

    if (
        expected_count is not None
        and not document_id
        and processed < expected_count
    ):
        log.error(
            "Выгрузка неполная: получено %d из %d. "
            "Повторите запуск; не используйте sort при scroll.",
            processed,
            expected_count,
        )


def collect_stats(
    client: TouchPointClient,
    date_from: datetime,
    date_to: datetime,
) -> AggregateStats:
    stats = AggregateStats()
    meta: dict[str, Any] = {}
    for item in iter_documents(client, date_from, date_to, meta_out=meta):
        stats.scanned += 1
        row, skip = build_row(item)
        if skip == "excluded_operator":
            stats.skipped_excluded_operator += 1
            continue
        if skip == "no_dialog":
            stats.skipped_no_dialog += 1
            continue
        if skip == "short_dialog":
            stats.skipped_short_dialog += 1
            continue
        if row:
            stats.rows.append(row)
        if stats.scanned % 2000 == 0:
            log.info(
                "Обработано: %d, с длительностью: %d",
                stats.scanned,
                stats.count,
            )
    stats.rows.sort(key=lambda r: (r.created_at, r.operator))
    stats.expected_count = meta.get("expected_count")
    return stats


def print_inspection(client: TouchPointClient, document_id: str) -> int:
    found = False
    for item in iter_documents(
        client,
        parse_date_arg("2000-01-01"),
        parse_date_arg("2099-12-31", end_of_day=True),
        document_id=document_id,
    ):
        found = True
        fields = item.get("fields") or item
        duration_ms, debug = compute_consultation_duration_ms(fields)
        dialog = fields.get("_dialog") or []

        print(f"ID обращения: {get_document_id(item, fields)}")
        print(f"Ссылка: {APP_DOCUMENT_URL.format(doc_id=get_document_id(item, fields))}")
        print(f"Дата: {parse_created_at(fields)}")
        print(f"Оператор: {get_operator_name(fields)}")
        print(f"Тематика: {get_theme(fields)}")
        print()
        print("Расчёт длительности консультации:")
        print("  max(_dialog[].begin_time) - min(_dialog[].begin_time)")
        if duration_ms is not None:
            print(f"  {debug['formula']}")
            print(f"  = {duration_ms} мс = {ms_to_hms(duration_ms)}")
        else:
            print(f"  Не удалось: {debug.get('reason')}")
        print()
        print(f"Сообщений в диалоге: {len(dialog)}")
        print("Хронология:")
        for msg in dialog:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "?")
            begin = msg.get("begin_time")
            text = str(msg.get("text") or "").replace("<br>", " ")
            if len(text) > 120:
                text = text[:117] + "..."
            print(f"  [{begin:>10} мс] {role}: {text}")

    if not found:
        log.error("Обращение %s не найдено", document_id)
        return 1
    return 0


def write_csv(path: Path, stats: AggregateStats) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = (
        "Дата и время обращения",
        "Ф.И.О. оператора",
        "Тематика",
        "Время консультации",
        "Сообщений",
        "Первое begin_time (мс)",
        "Последнее begin_time (мс)",
        "Ссылка на обращение",
    )
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, delimiter=";")
        writer.writeheader()
        for row in stats.rows:
            writer.writerow(
                {
                    columns[0]: row.created_at,
                    columns[1]: row.operator,
                    columns[2]: row.theme,
                    columns[3]: row.duration_hms,
                    columns[4]: row.message_count,
                    columns[5]: row.first_begin_ms,
                    columns[6]: row.last_begin_ms,
                    columns[7]: row.url,
                }
            )


def print_summary(
    stats: AggregateStats,
    date_from: datetime,
    date_to: datetime,
) -> None:
    print()
    print("=" * 60)
    print(f"Проект: {PROJECT_NAME} ({PROJECT_ID})")
    print(f"Тематика: {THEME}")
    print(
        f"Период: {date_from.strftime('%d.%m.%Y')} — "
        f"{date_to.strftime('%d.%m.%Y')} (МСК)"
    )
    print(f"Исключены операторы ({len(EXCLUDED_OPERATORS)}): {', '.join(EXCLUDED_OPERATORS)}")
    print("=" * 60)
    print(f"Просмотрено обращений: {stats.scanned}")
    if stats.expected_count is not None:
        print(f"Ожидалось по API: {stats.expected_count}")
        if stats.scanned < stats.expected_count:
            print(
                f"ВНИМАНИЕ: выгрузка неполная "
                f"({stats.scanned} из {stats.expected_count})"
            )
    print(f"Учтено (с длительностью): {stats.count}")
    print(f"Пропущено без диалога: {stats.skipped_no_dialog}")
    print(f"Пропущено (< 2 сообщений): {stats.skipped_short_dialog}")
    print()
    print(f"Среднее время консультации (все операторы): {ms_to_hms(int(stats.avg_ms))}")
    print(f"  ({stats.avg_ms:.1f} мс, {stats.avg_ms / 1000:.1f} с)")
    print()
    print("По операторам:")
    for op in stats.by_operator():
        print(
            f"  {op.operator}: n={op.count}, "
            f"среднее {ms_to_hms(int(op.avg_ms))} ({op.avg_ms / 1000:.1f} с)"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Среднее время консультации, Запросы (СП), тема «Запрос на бонус»",
    )
    parser.add_argument(
        "--date-from",
        default=DEFAULT_DATE_FROM,
        help="Начало периода YYYY-MM-DD (по умолчанию 2026-01-01)",
    )
    parser.add_argument(
        "--date-to",
        default=DEFAULT_DATE_TO,
        help="Конец периода YYYY-MM-DD включительно (по умолчанию 2026-03-31)",
    )
    parser.add_argument(
        "--document-id",
        default=None,
        help="Проверить расчёт длительности одного обращения по ID",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="CSV с детализацией по обращениям",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)

    try:
        date_from = parse_date_arg(args.date_from)
        date_to = parse_date_arg(args.date_to, end_of_day=True)
    except ValueError:
        log.error("Некорректный формат даты, ожидается YYYY-MM-DD")
        return 1

    if date_from > date_to:
        log.error("date-from позже date-to")
        return 1

    client = TouchPointClient()
    _ = client.access_token

    if args.document_id:
        return print_inspection(client, args.document_id.strip())

    log.info(
        "Сбор статистики: %s — %s, тема «%s»",
        date_from.strftime("%d.%m.%Y"),
        date_to.strftime("%d.%m.%Y"),
        THEME,
    )

    try:
        stats = collect_stats(client, date_from, date_to)
    except TouchPointAPIError as exc:
        log.error("Ошибка TouchPoint API: %s", exc)
        if exc.body:
            log.error("%s", exc.body)
        return 1
    except Exception:
        log.exception("Не удалось выполнить расчёт")
        return 1

    print_summary(stats, date_from, date_to)

    if args.output:
        write_csv(args.output, stats)
        print(f"\nДетализация сохранена: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
