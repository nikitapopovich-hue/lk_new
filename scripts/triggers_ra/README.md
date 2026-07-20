# CLI-утилиты Тригеров РА

Скрипты перенесены из проекта `triger` для операционных выгрузок CSV:

- `export_chat_close_pauses.py` — паузы закрытия чатов VIP
- `export_dialtech_response_time.py` — время ответа оператора после Dialtech (СП)
- `avg_consultation_time.py` — среднее время консультаций (СП)

Сейчас они рассчитаны на запуск **из исходного репозитория triger** (свои `touchpoint_client` / `.env`).

Основной UI дашборда доступен в ЛК: **Триггеры → Тригеры РА** (`/triggers/ra`).
