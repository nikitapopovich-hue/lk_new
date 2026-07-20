#!/usr/bin/env python3
"""
Время до первого ответа оператора после ответа бота Dialtech — проект Чаты (СП).

Проект: 1063259310391304192
Период по умолчанию: прошлая календарная неделя (пн–вс, МСК).

Логика (_dialog + file.properties):
  1. Живой оператор: file.properties.operator != Dialtech и operator_message_count >= 1.
  2. Последние N сообщений role=operator (N = operator_message_count) — оператор.
  3. Все предыдущие operator-сообщения — Dialtech (может быть 1, 2, 3 и более).
  4. Время = begin(1-й оператор) - begin(последний Dialtech).
  5. Только Dialtech (operator=Dialtech, count=0) — не попадает в выгрузку.

Пример 247946367: Dialtech на шагах 3,4,6; оператор на 8 — пауза от
последнего Dialtech (85718000) до первого оператора (85755000).

Примеры:
    python export_dialtech_response_time.py
    python export_dialtech_response_time.py --output dialtech_response_last_week.csv
    python export_dialtech_response_time.py --document-id 247946391
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from zoneinfo import ZoneInfo

import requests

from touchpoint_client import TouchPointAPIError, TouchPointClient

PROJECT_ID = "1063259310391304192"
PROJECT_NAME = "Чаты (СП)"
DIALTECH_LABEL = "Dialtech"
APP_DOCUMENT_URL = (
    "https://app.v20.touchpoint-analytics.ru/projects/"
    f"{PROJECT_ID}/documents/{{doc_id}}"
)

SCROLL_PAGE_SIZE = 500
SCROLL_TTL = "2m"
MAX_DOCS = 200_000
MSK = ZoneInfo("Europe/Moscow")

FETCH_FIELDS = [
    "created_date",
    "file.properties",
    "file.properties.operator",
    "file.properties.operator_message_count",
    "silence",
    "silence.intervals",
    "_dialog",
]

CSV_COLUMNS = (
    "Дата",
    "Ф.И.О. оператора",
    "Время до первого ответа",
    "Ссылка на обращение в РА",
)

log = logging.getLogger("dialtech_response")


@dataclass
class ResponseRow:
    created_at: str
    operator: str
    wait_hms: str
    wait_ms: int
    document_id: str
    url: str


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def safe_console(text: str) -> str:
    return text.encode("cp1251", errors="replace").decode("cp1251")


def ms_to_hms(ms: int) -> str:
    total_sec = max(0, ms) // 1000
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    seconds = total_sec % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def last_calendar_week(reference: date | None = None) -> tuple[datetime, datetime]:
    """Прошлая неделя: понедельник 00:00 — воскресенье 23:59:59 (МСК)."""
    ref = reference or datetime.now(MSK).date()
    this_monday = ref - timedelta(days=ref.weekday())
    last_monday = this_monday - timedelta(days=7)
    last_sunday = this_monday - timedelta(days=1)
    start = datetime(
        last_monday.year,
        last_monday.month,
        last_monday.day,
        0,
        0,
        0,
        tzinfo=MSK,
    )
    end = datetime(
        last_sunday.year,
        last_sunday.month,
        last_sunday.day,
        23,
        59,
        59,
        tzinfo=MSK,
    )
    return start, end


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


def get_human_operator_message_count(fields: dict[str, Any]) -> int:
    raw = get_nested(fields, "file.properties.operator_message_count")
    try:
        return max(0, int(raw or 0))
    except (TypeError, ValueError):
        return 0


def has_human_operator(fields: dict[str, Any]) -> bool:
    name = get_nested(fields, "file.properties.operator")
    if not name or str(name).strip() == DIALTECH_LABEL:
        return False
    return get_human_operator_message_count(fields) > 0


def get_operator_name(fields: dict[str, Any]) -> str:
    value = get_nested(fields, "file.properties.operator")
    if value:
        name = str(value).strip()
        if name and name != DIALTECH_LABEL:
            return name
    return "—"


def get_document_id(item: dict[str, Any], fields: dict[str, Any]) -> str | None:
    for candidate in (
        item.get("id"),
        get_nested(fields, "_internal_data.id"),
        get_nested(fields, "file.properties.chat_id"),
    ):
        if candidate:
            return str(candidate)
    return None


def sorted_intervals(fields: dict[str, Any]) -> list[dict[str, Any]]:
    silence = fields.get("silence")
    if not isinstance(silence, dict):
        return []
    raw = silence.get("intervals")
    if not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for iv in raw:
        if not isinstance(iv, dict):
            continue
        if iv.get("begin") is None:
            continue
        result.append(iv)
    result.sort(key=lambda x: int(x["begin"]))
    return result


def operator_dialog_messages(fields: dict[str, Any]) -> list[dict[str, Any]]:
    dialog = fields.get("_dialog")
    if not isinstance(dialog, list):
        return []
    messages = [
        m
        for m in dialog
        if isinstance(m, dict)
        and m.get("role") == "operator"
        and m.get("begin_time") is not None
    ]
    messages.sort(key=lambda m: int(m["begin_time"]))
    return messages


def split_dialtech_and_human_messages(
    fields: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """
    Разделяет operator-сообщения _dialog на Dialtech и живого оператора.

    Последние N сообщений role=operator (N = operator_message_count) — оператор,
    все предыдущие — Dialtech.
    """
    operator_msgs = operator_dialog_messages(fields)
    human_count = get_human_operator_message_count(fields)
    meta: dict[str, Any] = {
        "operator_messages_total": len(operator_msgs),
        "human_message_count": human_count,
    }

    if human_count <= 0:
        return [], [], {**meta, "reason": "operator_message_count = 0 (только Dialtech)"}

    if len(operator_msgs) <= human_count:
        return [], [], {
            **meta,
            "reason": (
                f"в _dialog {len(operator_msgs)} operator-сообщ., "
                f"нужно больше {human_count} (есть Dialtech + оператор)"
            ),
        }

    dialtech_msgs = operator_msgs[:-human_count]
    human_msgs = operator_msgs[-human_count:]
    return dialtech_msgs, human_msgs, meta


def find_human_response_wait_ms(
    fields: dict[str, Any],
) -> tuple[int | None, dict[str, Any]]:
    """
    Пауза до первого ответа живого оператора после первого ответа Dialtech.
    """
    if not has_human_operator(fields):
        return None, {"reason": "нет живого оператора (только Dialtech или не назначен)"}

    dialtech_msgs, human_msgs, split_meta = split_dialtech_and_human_messages(fields)
    if not dialtech_msgs or not human_msgs:
        return None, split_meta

    t_dialtech_last = int(dialtech_msgs[-1]["begin_time"])
    t_human = int(human_msgs[0]["begin_time"])
    wait_ms = t_human - t_dialtech_last
    if wait_ms < 0:
        return None, {**split_meta, "reason": "отрицательная пауза в _dialog"}

    return wait_ms, {
        "method": "_dialog",
        "dialtech_messages": len(dialtech_msgs),
        "human_messages": len(human_msgs),
        "dialtech_first": dialtech_msgs[0],
        "dialtech_last": dialtech_msgs[-1],
        "human_message": human_msgs[0],
        "formula": (
            f"begin(1-й оператор) - begin(последний Dialtech) = "
            f"{t_human} - {t_dialtech_last} = {wait_ms} мс "
            f"(Dialtech: {len(dialtech_msgs)} сообщ., оператор: {split_meta['human_message_count']})"
        ),
        **split_meta,
    }


def build_row(item: dict[str, Any]) -> tuple[ResponseRow | None, str | None]:
    fields = item.get("fields")
    if not isinstance(fields, dict):
        fields = item

    if not has_human_operator(fields):
        return None, "no_operator"

    wait_ms, _debug = find_human_response_wait_ms(fields)
    if wait_ms is None:
        return None, "no_wait"

    operator = get_operator_name(fields)
    if operator == "—":
        return None, "no_operator"

    doc_id = get_document_id(item, fields)
    if not doc_id:
        return None, "no_id"

    return (
        ResponseRow(
            created_at=parse_created_at(fields),
            operator=operator,
            wait_hms=ms_to_hms(wait_ms),
            wait_ms=wait_ms,
            document_id=doc_id,
            url=APP_DOCUMENT_URL.format(doc_id=doc_id),
        ),
        None,
    )


def parse_expected_count(payload: dict[str, Any]) -> int | None:
    raw = payload.get("count") or payload.get("total")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


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


def iter_documents(
    client: TouchPointClient,
    date_from: datetime,
    date_to: datetime,
    *,
    document_id: str | None = None,
    meta_out: dict[str, Any] | None = None,
) -> Iterator[dict]:
    if document_id:
        filters: list[dict[str, Any]] = [
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
    else:
        filters = [
            {
                "range": {
                    "created_date": {
                        "gte": to_api_iso(date_from),
                        "lte": to_api_iso(date_to),
                    }
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
            "Выгрузка неполная: получено %d из %d",
            processed,
            expected_count,
        )


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
        wait_ms, debug = find_human_response_wait_ms(fields)
        doc_id = get_document_id(item, fields)

        print(f"ID обращения: {doc_id}")
        print(f"Ссылка: {APP_DOCUMENT_URL.format(doc_id=doc_id)}")
        print(f"Дата: {parse_created_at(fields)}")
        print(f"Ф.И.О. оператора: {get_operator_name(fields)}")
        print()
        print("Расчёт времени до первого ответа оператора после Dialtech:")
        print(
            "  begin(1-й оператор) - begin(последний Dialtech); "
            "Dialtech = все operator-сообщ. кроме последних N"
        )
        if wait_ms is not None:
            print(f"  метод: {debug.get('method')}")
            print(f"  {debug.get('formula')}")
            print(f"  = {wait_ms} мс = {ms_to_hms(wait_ms)}")
        else:
            print(f"  Не удалось: {debug.get('reason')}")
        print()
        dialtech_msgs, human_msgs, _ = split_dialtech_and_human_messages(fields)
        print(f"operator_message_count: {get_human_operator_message_count(fields)}")
        print(f"Dialtech-сообщений: {len(dialtech_msgs)}, операторских: {len(human_msgs)}")
        print("Хронология _dialog (operator / client / system):")
        dialog = fields.get("_dialog") or []
        human_count = get_human_operator_message_count(fields)
        op_total = sum(1 for m in dialog if m.get("role") == "operator")
        op_idx = 0
        for i, msg in enumerate(dialog, 1):
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "?")
            label = ""
            if role == "operator":
                op_idx += 1
                if op_idx <= op_total - human_count:
                    label = " [Dialtech]"
                else:
                    label = " [оператор]"
            text = safe_console(str(msg.get("text") or "").replace("<br>", " "))
            if len(text) > 80:
                text = text[:77] + "..."
            print(f"  {i}) [{msg.get('begin_time')} мс] {role}{label}: {text}")
        print()
        print("Интервалы silence (по begin):")
        for i, iv in enumerate(sorted_intervals(fields)):
            mark = ""
            if debug.get("wait_interval") is iv:
                mark = "  <-- (fallback)"
            print(
                f"  [{i}] {iv.get('channel_from')}->{iv.get('channel_to')} "
                f"dur={iv.get('duration')} мс begin={iv.get('begin')} end={iv.get('end')}{mark}"
            )

    if not found:
        log.error("Обращение %s не найдено", document_id)
        return 1
    return 0


def export_period(
    client: TouchPointClient,
    date_from: datetime,
    date_to: datetime,
    output: Path,
) -> tuple[int, int, int | None]:
    rows: list[ResponseRow] = []
    skipped = 0
    scanned = 0
    meta: dict[str, Any] = {}

    for item in iter_documents(client, date_from, date_to, meta_out=meta):
        scanned += 1
        row, skip = build_row(item)
        if skip:
            skipped += 1
            continue
        if row:
            rows.append(row)
        if scanned % 2000 == 0:
            log.info("Обработано: %d, в выгрузку: %d", scanned, len(rows))

    rows.sort(key=lambda r: (r.created_at, r.operator))

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS, delimiter=";")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    CSV_COLUMNS[0]: row.created_at,
                    CSV_COLUMNS[1]: row.operator,
                    CSV_COLUMNS[2]: row.wait_hms,
                    CSV_COLUMNS[3]: row.url,
                }
            )

    log.info(
        "Готово: просмотрено %d, пропущено %d, в CSV %d -> %s",
        scanned,
        skipped,
        len(rows),
        output,
    )
    return len(rows), scanned, meta.get("expected_count")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Время до первого ответа оператора после Dialtech, Чаты (СП)",
    )
    parser.add_argument(
        "--date-from",
        default=None,
        help="Начало периода YYYY-MM-DD (по умолчанию пн прошлой недели)",
    )
    parser.add_argument(
        "--date-to",
        default=None,
        help="Конец периода YYYY-MM-DD включительно (по умолчанию вс прошлой недели)",
    )
    parser.add_argument(
        "--document-id",
        default=None,
        help="Проверить расчёт по одному обращению",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Путь к CSV (по умолчанию dialtech_response_YYYY-MM-DD_YYYY-MM-DD.csv)",
    )
    parser.add_argument(
        "--json-file",
        type=Path,
        default=None,
        help="Проверить расчёт по локальному JSON-файлу (без API)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args()


def inspect_json_file(path: Path) -> int:
    fields = json.loads(path.read_text(encoding="utf-8"))
    wait_ms, debug = find_human_response_wait_ms(fields)
    print(f"Файл: {path}")
    print(f"Оператор: {get_operator_name(fields)}")
    if wait_ms is not None:
        print(f"Время до первого ответа: {ms_to_hms(wait_ms)} ({wait_ms} мс)")
        print(debug.get("formula"))
    else:
        print(f"Ошибка: {debug.get('reason')}")
    print()
    dialtech_msgs, human_msgs, _ = split_dialtech_and_human_messages(fields)
    print(f"operator_message_count: {get_human_operator_message_count(fields)}")
    for msg in dialtech_msgs:
        text = safe_console(str(msg.get("text") or "").replace("<br>", " "))[:80]
        print(f"  Dialtech [{msg.get('begin_time')}]: {text}")
    for msg in human_msgs:
        text = safe_console(str(msg.get("text") or "").replace("<br>", " "))[:80]
        print(f"  оператор [{msg.get('begin_time')}]: {text}")
    print()
    for i, iv in enumerate(sorted_intervals(fields)):
        mark = "  <-- (fallback)" if debug.get("wait_interval") is iv else ""
        print(
            f"  [{i}] {iv.get('channel_from')}->{iv.get('channel_to')} "
            f"dur={iv.get('duration')} мс{mark}"
        )
    return 0 if wait_ms is not None else 1


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)

    if args.json_file:
        return inspect_json_file(args.json_file)

    client = TouchPointClient()
    _ = client.access_token

    if args.document_id:
        return print_inspection(client, args.document_id.strip())

    if args.date_from and args.date_to:
        try:
            date_from = parse_date_arg(args.date_from)
            date_to = parse_date_arg(args.date_to, end_of_day=True)
        except ValueError:
            log.error("Некорректный формат даты, ожидается YYYY-MM-DD")
            return 1
    else:
        date_from, date_to = last_calendar_week()

    if date_from > date_to:
        log.error("date-from позже date-to")
        return 1

    output = args.output or Path(__file__).resolve().parent / (
        f"dialtech_response_{date_from.strftime('%Y-%m-%d')}_"
        f"{date_to.strftime('%Y-%m-%d')}.csv"
    )

    log.info(
        "Проект %s (%s), период %s — %s (МСК)",
        PROJECT_NAME,
        PROJECT_ID,
        date_from.strftime("%d.%m.%Y"),
        date_to.strftime("%d.%m.%Y"),
    )

    try:
        count, scanned, expected = export_period(client, date_from, date_to, output)
    except TouchPointAPIError as exc:
        log.error("Ошибка TouchPoint API: %s", exc)
        if exc.body:
            log.error("%s", exc.body)
        return 1
    except Exception:
        log.exception("Не удалось выполнить выгрузку")
        return 1

    print(f"Сохранено строк: {count}")
    print(f"Просмотрено обращений: {scanned}")
    if expected is not None:
        print(f"Ожидалось по API: {expected}")
    print(f"Файл: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
