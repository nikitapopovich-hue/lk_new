#!/usr/bin/env python3
"""
Выгрузка пауз «оператор → система» (время до закрытия чата) по проекту Чаты (VIP).

Проект: 1078144709999730688
Интервал в JSON: silence.intervals[], где channel_from=operator и channel_to=system.

Пример запуска (июнь 2026):
    python export_chat_close_pauses.py
    python export_chat_close_pauses.py --year 2026 --month 6
    python export_chat_close_pauses.py --year 2026 --month 6 --output report_june.csv
"""

from __future__ import annotations

import argparse
import calendar
import csv
import logging
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from zoneinfo import ZoneInfo

import requests

from touchpoint_client import TouchPointAPIError, TouchPointClient

PROJECT_ID = "1078144709999730688"
PROJECT_NAME = "Чаты (VIP)"
APP_DOCUMENT_URL = (
    "https://app.v20.touchpoint-analytics.ru/projects/"
    f"{PROJECT_ID}/documents/{{doc_id}}"
)

SCROLL_PAGE_SIZE = 500
SCROLL_TTL = "2m"
MAX_DOCS = 100_000
MSK = ZoneInfo("Europe/Moscow")

FETCH_FIELDS = [
    "created_date",
    "title",
    "file",
    "file.properties",
    "file.properties.operator",
    "file.properties.record_start_time",
    "silence",
    "silence.intervals",
    "operator",
    "_internal_data",
    "_internal_data.id",
]

CSV_COLUMNS = (
    "Дата и время обращения",
    "Ф.И.О. оператора",
    "Время на закрытие чата",
    "Ссылка на обращение",
)

log = logging.getLogger("chat_close_export")


@dataclass
class ClosePauseRow:
    created_at: str
    operator: str
    pause_hms: str
    pause_ms: int
    document_id: str
    url: str


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    last_day = calendar.monthrange(year, month)[1]
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=MSK)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=MSK)
    return start, end


def to_api_iso(dt: datetime) -> str:
    utc = dt.astimezone(timezone.utc).replace(microsecond=0)
    return utc.isoformat().replace("+00:00", "Z")


def ms_to_hms(ms: int) -> str:
    total_sec = max(0, ms) // 1000
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    seconds = total_sec % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def extract_search_documents(payload: dict[str, Any]) -> list[dict]:
    docs = payload.get("documents")
    if isinstance(docs, list):
        return [d for d in docs if isinstance(d, dict)]
    return []


def get_nested(data: dict, path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def parse_created_at(fields: dict[str, Any]) -> str:
    raw = fields.get("created_date")
    if not raw:
        raw = get_nested(fields, "file.properties.record_start_time")
    if not raw:
        return "—"

    text = str(raw).strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
    ):
        try:
            if text.endswith("Z"):
                dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(text[:19], fmt.replace("Z", ""))
                dt = dt.replace(tzinfo=MSK)
            return dt.astimezone(MSK).strftime("%d.%m.%Y %H:%M:%S")
        except ValueError:
            continue
    return text


def get_operator_name(fields: dict[str, Any]) -> str:
    for key in ("file.properties.operator",):
        value = get_nested(fields, key)
        if value:
            return str(value).strip()
    props = (fields.get("file") or {}).get("properties") or {}
    if props.get("operator"):
        return str(props["operator"]).strip()
    return "—"


def get_document_id(item: dict[str, Any], fields: dict[str, Any]) -> str | None:
    for candidate in (
        item.get("id"),
        fields.get("id"),
        get_nested(fields, "_internal_data.id"),
    ):
        if candidate:
            return str(candidate)
    return None


def find_operator_system_pause_ms(fields: dict[str, Any]) -> int:
    """Максимальная пауза operator→system (мс) среди silence/operator intervals."""
    best = 0
    for block_key in ("silence", "operator"):
        block = fields.get(block_key)
        if not isinstance(block, dict):
            continue
        intervals = block.get("intervals")
        if not isinstance(intervals, list):
            continue
        for interval in intervals:
            if not isinstance(interval, dict):
                continue
            if interval.get("channel_from") != "operator":
                continue
            if interval.get("channel_to") != "system":
                continue
            try:
                duration = int(interval.get("duration") or 0)
            except (TypeError, ValueError):
                duration = 0
            if duration > best:
                best = duration
    return best


def build_row(item: dict[str, Any]) -> ClosePauseRow | None:
    fields = item.get("fields")
    if not isinstance(fields, dict):
        fields = item

    pause_ms = find_operator_system_pause_ms(fields)
    if pause_ms <= 0:
        return None

    doc_id = get_document_id(item, fields)
    if not doc_id:
        return None

    return ClosePauseRow(
        created_at=parse_created_at(fields),
        operator=get_operator_name(fields),
        pause_hms=ms_to_hms(pause_ms),
        pause_ms=pause_ms,
        document_id=doc_id,
        url=APP_DOCUMENT_URL.format(doc_id=doc_id),
    )


def post_search(
    client: TouchPointClient,
    body: dict[str, Any],
) -> dict[str, Any]:
    return client.search_documents(PROJECT_ID, body)


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


def iter_project_documents(
    client: TouchPointClient,
    start: datetime,
    end: datetime,
) -> Iterator[dict]:
    body = {
        "query": "*",
        "filters": [
            {
                "range": {
                    "created_date": {
                        "gte": to_api_iso(start),
                        "lte": to_api_iso(end),
                    }
                }
            }
        ],
        "fetch_fields": FETCH_FIELDS,
        "with_id": True,
        "with_title": True,
        "with_snippet": False,
        "with_url": True,
        "sort": [{"created_date": "asc"}],
        "offset": 0,
        "limit": SCROLL_PAGE_SIZE,
        "scroll": SCROLL_TTL,
    }

    processed = 0
    first = post_search(client, body)
    scroll_id = first.get("scroll_id")

    for item in extract_search_documents(first):
        yield item
        processed += 1
        if processed >= MAX_DOCS:
            log.warning("Достигнут лимит документов: %d", MAX_DOCS)
            return

    empty_batches = 0
    while scroll_id:
        nxt = post_scroll(client, scroll_id)
        if nxt.get("__scroll_not_found__"):
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


def export_month(year: int, month: int, output: Path) -> int:
    start, end = month_bounds(year, month)
    log.info(
        "Проект %s (%s), период %s — %s (МСК)",
        PROJECT_NAME,
        PROJECT_ID,
        start.strftime("%d.%m.%Y"),
        end.strftime("%d.%m.%Y"),
    )

    client = TouchPointClient()
    _ = client.access_token

    rows: list[ClosePauseRow] = []
    scanned = 0

    for item in iter_project_documents(client, start, end):
        scanned += 1
        row = build_row(item)
        if row:
            rows.append(row)
        if scanned % 1000 == 0:
            log.info("Обработано документов: %d, найдено пауз: %d", scanned, len(rows))

    rows.sort(key=lambda r: (r.created_at, r.operator))

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=CSV_COLUMNS,
            delimiter=";",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    CSV_COLUMNS[0]: row.created_at,
                    CSV_COLUMNS[1]: row.operator,
                    CSV_COLUMNS[2]: row.pause_hms,
                    CSV_COLUMNS[3]: row.url,
                }
            )

    log.info(
        "Готово: просмотрено %d обращений, в таблицу %d строк → %s",
        scanned,
        len(rows),
        output,
    )
    return len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Выгрузка времени паузы operator→system (закрытие чата), Чаты VIP",
    )
    parser.add_argument("--year", type=int, default=2026, help="Год (по умолчанию 2026)")
    parser.add_argument("--month", type=int, default=6, help="Месяц 1-12 (по умолчанию 6)")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Путь к CSV (по умолчанию chat_close_pauses_YYYY-MM.csv)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Подробный лог")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)

    if not 1 <= args.month <= 12:
        log.error("Некорректный месяц: %d", args.month)
        return 1

    output = args.output or Path(__file__).resolve().parent / (
        f"chat_close_pauses_{args.year:04d}-{args.month:02d}.csv"
    )

    try:
        count = export_month(args.year, args.month, output)
    except TouchPointAPIError as exc:
        log.error("Ошибка TouchPoint API: %s", exc)
        if exc.body:
            log.error("%s", exc.body)
        return 1
    except Exception:
        log.exception("Не удалось выполнить выгрузку")
        return 1

    print(f"Сохранено строк: {count}")
    print(f"Файл: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
