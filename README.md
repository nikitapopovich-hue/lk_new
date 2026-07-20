# ЛК оператора / руководителя (PARI)

Monorepo: **FastAPI** (`backend/`) + **React/Vite** (`frontend/`).

Конфигурация, зависимости Python и документация — **только в корне**:
- `.env` — секреты (из `.env.example`)
- `requirements.txt` — Python-пакеты
- `README.md` — эта инструкция

## Быстрый старт (разработка)

```powershell
copy .env.example .env
# заполните GOOGLE_OAUTH_*, DATABASE_URL и т.д.

npm run install:all
npm run db:up
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:1121  

**Postgres:** если в `.env` указан `DATABASE_URL`, перед `npm run dev` нужна БД:

```powershell
npm run db:up
```

(нужен [Docker Desktop](https://www.docker.com/products/docker-desktop/)). Остановить: `npm run db:down`.

Без Docker: установите PostgreSQL локально или временно закомментируйте `DATABASE_URL` в `.env` (часть функций не будет работать).

Vite читает `VITE_*` из **корневого** `.env` (см. `frontend/vite.config.ts`).

## Production (один процесс на сервере)

```powershell
copy .env.example .env
```

Пример production в `.env`:

```env
APP_ENV=production
SERVE_FRONTEND=true
FRONTEND_URL=https://lk.your-domain.ru
CORS_ORIGINS=https://lk.your-domain.ru
GOOGLE_OAUTH_REDIRECT_URI=https://lk.your-domain.ru/auth/google/callback
VITE_API_BASE_URL=
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/lk_oper_ruk
APP_SECRET_KEY=<длинная случайная строка>
```

```powershell
npm run preview
```

Приложение: http://0.0.0.0:1121 (UI + API).

## Команды

| Команда | Назначение |
|---------|------------|
| `npm run install:all` | venv + `pip install -r requirements.txt` + npm |
| `npm run dev` | API + Vite |
| `npm run build` | Сборка `frontend/dist` |
| `npm run start` | uvicorn (после build) |
| `npm run preview` | build + start |

Обёртки: `scripts/dev.ps1`, `scripts/start.ps1` (и `.sh`).

## Docker

```powershell
copy .env.example .env
docker compose up -d --build
```

Postgres и volume для фото KC поднимаются автоматически.

## Postgres

```env
DATABASE_URL=postgresql+asyncpg://user:password@127.0.0.1:5432/lk_oper_ruk
```

## Google OAuth

Redirect URI в Google Console = `GOOGLE_OAUTH_REDIRECT_URI`:

- dev: `http://127.0.0.1:1121/auth/google/callback`
- prod: `https://<домен>/auth/google/callback`

## Структура

```
lk_oper_ruk/
  .env                 # секреты (не в git)
  .env.example
  requirements.txt
  package.json         # npm run dev / build / start
  backend/             # FastAPI
  frontend/            # React
  scripts/             # install, build, run
  Dockerfile
  docker-compose.yml
```

## Не коммитить

`.env`, `node_modules/`, `frontend/dist/`, `backend/.venv/`, `backend/uploads/`.
