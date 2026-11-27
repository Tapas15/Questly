# AI-Powered Word Questionnaire

Simple, responsive app for uploading a Word questionnaire, extracting questions, sharing a public form link, generating AI suggestions, collecting responses, and downloading them.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Python FastAPI
- Word parsing: `python-docx`
- DB: SQLite by default, PostgreSQL supported via `DATABASE_URL`
- AI: Ollama or configurable OpenAI-compatible API (Kilo/OpenAI-style `/chat/completions`)

## What it supports

- Upload `.docx` questionnaire and extract questions/options/descriptive fields
- Verified against included `CA_Accounting_Firm_Problem_Validation_Questionnaire.docx` (42 questions: 35 choice, 7 descriptive)
- **SSO login (Google/Microsoft)**: optional OAuth sign-in on public form; signed-in identity attached to submitted response. Configure `GOOGLE_*` / `MICROSOFT_*` env vars; set `AUTH_REQUIRED_FOR_SUBMIT=true` to require sign-in.
- **Dynamic sample prefill**: each load/regenerate creates a different questionnaire-based sample draft covering all 42 questions; “Fill example from my input” adapts sample choices/text to the instruction box. Users can edit/select before submit.
- Public respondent form URL: `/q/{slug}`
- Firm/respondent detail fields (optional, at end of form)
- MCQ radio/checkbox rendering, `Other` text inputs, max-selection limits
- Top AI instruction box: “Tell AI what you want to fill in this questionnaire”
- Per-descriptive-question AI help button
- Accept/reject/edit AI suggestions; manual edits preserved
- Submit response + confirmation
- Admin dashboard: response cards, MCQ + descriptive answer view, CSV/XLSX export
- Shareable read-only view: `/s/{share_token}` shows respondent MCQ selections and descriptive answers
- Delete questionnaire (admin)

## Project structure

```text
backend/         FastAPI app, parser, DB models, AI/export services
frontend/        React+TS app
deploy-termux.sh Termux end-to-end install/deploy script
docker-compose.yml
CA_Accounting_Firm_Problem_Validation_Questionnaire.docx
```

## Quick start (Docker)

```powershell
cd C:\Users\Tapas\Documents\projects\formfill
Copy-Item .env.example .env
# edit .env as needed
docker compose up --build -d
```

- Frontend/Admin: http://localhost:8080
- Backend health: http://localhost:8000/api/health
- Public form: http://localhost:8080/q/{slug}
- Share view (MCQ+descriptive): http://localhost:8080/s/{share_token}

Stop: `docker compose down`

## Local dev setup

### 1. Backend

```powershell
cd C:\Users\Tapas\Documents\projects\formfill
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
$env:PYTHONPATH='.'
.\.venv\Scripts\python -m uvicorn backend.app.main:app --reload --port 8000
```

### 2. Frontend

```powershell
cd C:\Users\Tapas\Documents\projects\formfill\frontend
npm install
npm run dev
```

## Termux deployment (Android)

`deploy-termux.sh` performs end-to-end install and deployment in Termux.

```bash
pkg install git -y
# copy/clone this project into Termux
cd formfill
chmod +x deploy-termux.sh
./deploy-termux.sh
```

The script:
- updates/upgrades Termux packages
- installs `python nodejs-lts git openssl clang make pkg-config libffi`
- creates `.venv`, installs backend requirements
- creates `.env` if missing and sets local defaults
- builds frontend (`npm install && npm run build`)
- creates `start-termux.sh` and `stop-termux.sh`
- starts backend (`uvicorn`, port 8000) and frontend static server (`python -m http.server`, port 8080)

After deploy:
- Admin/local: `http://localhost:8080`
- LAN: `http://<phone-ip>:8080`
- Logs: `.run/backend.log`, `.run/frontend.log`
- Stop: `./stop-termux.sh`
- Start again: `./start-termux.sh`

For external access, use a tunnel/reverse proxy and set `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` in `.env`.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./backend/data/app.db` | Use PostgreSQL URL for Postgres |
| `ADMIN_TOKEN` | `changeme` | Required for admin APIs/exports/delete |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin; set to deployed frontend URL |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Used for generated share links |
| `LLM_PROVIDER` | `ollama` | `ollama` or `openai_compatible` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server; Docker: `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model |
| `LLM_API_KEY` | empty | OpenAI-compatible/Kilo API key |
| `LLM_BASE_URL` | empty | e.g. `https://api.kilo.ai/api/gateway` |
| `SESSION_SECRET` | `change-this-session-secret` | Session cookie signing secret; set a strong random value in prod |
| `AUTH_REQUIRED_FOR_SUBMIT` | `false` | When `true`, respondent must sign in before submit |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Enable Google SSO |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | empty | Enable Microsoft SSO |
| `MICROSOFT_TENANT` | `common` | Microsoft tenant (`common`, `organizations`, or tenant id) |

## AI safety behavior

- Uses only respondent instruction/context.
- Selects MCQ options only when supported.
- Generates descriptive answers only when supported.
- Leaves unknown answers blank.
- Never invents company details.
- Invalid/unmatched MCQ option values are discarded server-side.

## Verification

```powershell
$env:PYTHONPATH='.'
.\.venv\Scripts\python -c "from backend.tests.test_parser import test_parse_questionnaire_counts; test_parse_questionnaire_counts(); print('ok')"
cd frontend; npm run build
```
