# ResumeCraft

Scans job boards (Adzuna + JSearch/RapidAPI), matches postings against your
master profile, generates tailored resumes and cover letters with an LLM,
exports them to PDF, and tracks every application in a PostgreSQL database.

Copyright 2026 GL2

## Technology stack

### Backend (`backend/`)

| Technology | Purpose |
|------------|---------|
| **Python 3.14** | Language runtime. |
| **FastAPI** | Async REST API framework. |
| **Uvicorn** | ASGI server that runs the app. |
| **SQLAlchemy 2.0 (async)** | ORM / data-access layer via the async engine. |
| **asyncpg** | Async PostgreSQL driver. |
| **greenlet** | Required by SQLAlchemy's async engine. |
| **Pydantic v2 / pydantic-settings** | Schemas and env-based configuration. |
| **httpx** | Async HTTP client for job-board APIs. |
| **OpenAI / Anthropic SDKs** | LLM providers for generation & resume parsing (`LLM_PROVIDER`). |
| **markdown + xhtml2pdf** | Render generated Markdown to PDF (pure Python, no system libs). |
| **pypdf + python-docx** | Extract text from uploaded PDF/DOCX resumes. |
| **python-multipart** | File-upload support for resume import. |
| **Alembic** | Installed for future migrations (tables currently via `create_all`). |

### Frontend (`frontend/`)

| Technology | Purpose |
|------------|---------|
| **React 18 + TypeScript** | UI library and static typing. |
| **Vite 5** | Dev server (HMR) and production bundler. |
| **marked** | Render document Markdown to HTML for in-app preview. |
| **Fetch API** | Communicates with the backend REST endpoints. |
| **Plain CSS** (`src/index.css`) | Dark-theme styling, no CSS framework. |

### Data & infrastructure

| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary datastore (profiles, jobs, documents, applications). |
| **Adzuna API** | Job postings (app id + key). |
| **JSearch via RapidAPI** | Aggregated postings (`/search-v2`; needs a subscription + key). |
| **Docker Compose** | Optional local PostgreSQL container. |

## Project layout

```
backend/            FastAPI service
  app/
    api/routes/      jobs, profiles, documents, applications
    services/        sources/ (adzuna, jsearch), matcher, generator,
                     llm, pdf, resume_parser
    models.py        SQLAlchemy tables
    schemas.py       Pydantic schemas
frontend/           React dashboard
  src/components/    SearchTab, ApplicationsTab, ProfileTab,
                     DocumentEditor, DocumentViewer, InfoPages, Spinner
docker-compose.yml  Postgres for local dev
```

## Prerequisites

- Python 3.11+ and Node 18+
- A running PostgreSQL instance (use the included `docker-compose.yml`, or your
  own Postgres). Docker is not required if you already have Postgres.

## 1. Start Postgres

With Docker:

```bash
docker compose up -d db
```

Or point `DATABASE_URL` at any existing Postgres instance.

## Quick start

From the repository root, run:

```bash
chmod +x start.sh  # only needed once
./start.sh
```

The script starts the Docker PostgreSQL container, installs missing backend and
frontend dependencies, starts both development servers, and opens the app at
http://localhost:5173. Press `Ctrl-C` in that terminal to stop the frontend and
backend servers. The database container continues running; stop it separately
with `docker compose stop db` when you no longer need it.

## 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in your API keys
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

### Required environment variables (`backend/.env`)

- `DATABASE_URL` — e.g. `postgresql+asyncpg://jobs:jobs@localhost:5432/jobs`
- `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` — from https://developer.adzuna.com/
- `RAPIDAPI_KEY` — from the JSearch API on RapidAPI
- `LLM_PROVIDER` (`openai` or `anthropic`) plus the matching API key

Sources without credentials are automatically skipped, so you can start with
just one.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173 (proxies `/api` to the backend on port 8000).

## Staging deployment

The repository includes a Render Blueprint in `render.yaml`, a production
backend container in `backend/Dockerfile`, and GitHub Actions validation in
`.github/workflows/ci.yml`.

1. Create a separate managed PostgreSQL database for staging, such as Neon.
2. In Render, create a Blueprint from this repository and select `render.yaml`.
3. Set the backend's `DATABASE_URL`, API provider keys, and a staging-only
  `AUTH_SECRET_KEY` in Render's secret environment variables.
4. Deploy the static site, then set the backend `CORS_ORIGINS` and
  `FRONTEND_URL` to its Render URL.
5. Set the static site's `VITE_API_BASE` to the backend URL with `/api`, for
  example `https://resumecraft-staging-api.onrender.com/api`.
6. Redeploy both services and confirm `https://<backend>/api/health` returns
  `{ "status": "ok" }`.

`VITE_API_BASE` is optional for local development: the frontend falls back to
the Vite `/api` proxy when it is not set.

## Workflow

1. **Profile** tab — enter your experience, skills, and education once. This is
   the only source used to generate documents.
2. **Search & Generate** tab — search the boards; results are stored and scored
   against your profile. Generate a tailored resume and cover letter per posting.
3. **Applications** tab — track status, date sent, and response for each job.

## How matching works

`services/matcher.py` uses a dependency-free keyword-overlap heuristic to score
each posting 0–100 against your profile. Swap it for embeddings or LLM ranking
by replacing `score_job`.

## Notes & responsible use

- Documents are generated **only** from facts in your profile — the prompts
  instruct the LLM never to fabricate experience. Always review output before
  sending.
- Prefer official APIs (as used here) over scraping to respect each board's
  Terms of Service and rate limits.
- `init_db()` auto-creates tables for convenience. For production, use Alembic
  migrations (Alembic is already installed).
