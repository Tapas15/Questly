# AI Word Questionnaire

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688.svg)](backend/)
[![React](https://img.shields.io/badge/React-frontend-61dafb.svg)](frontend/)

Free, open-source, AI-powered questionnaire app. Upload a `.docx` questionnaire, auto-extract questions, share public links, collect responses with optional Google sign-in, generate AI-assisted drafts, and view a beautiful response dashboard.

> **MIT Licensed — free for everyone to use, modify, and deploy.**

## UI Preview

| Admin Control Center | Respondent Form | Response Dashboard |
|---|---|---|
| ![Admin dashboard](docs/screenshots/admin.png) | ![Respondent form](docs/screenshots/form.png) | ![Analytics dashboard](docs/screenshots/dashboard.png) |

### UI/UX Highlights

- **Clean premium layout** — card-based sections, clear spacing, and readable typography for long questionnaires.
- **Guided respondent flow** — sample draft selector, AI autofill, manual edit/accept/reject, and final review before submit.
- **Dual access modes** — authenticated Google link for verified identity, anonymous link for open collection with name/firm/ID capture.
- **Admin operations** — upload DOCX, copy share links, load responses, export CSV/XLSX, delete questionnaires.
- **Insights dashboard** — aggregate MCQ distribution bars, descriptive response review, individual vs all-response view.
- **Responsive design** — usable on desktop and mobile screens.

## Features

- **DOCX upload & parsing** — extracts single-choice, multi-choice, and descriptive questions (`python-docx`).
- **Public respondent links** — share `/q/{slug}`; authenticated (Google required) or anonymous (`?auth=open`) mode.
- **Google SSO (optional)** — verified respondent identity; anonymous submissions get a stable anonymous ID and optional name/firm.
- **Single response per user** — same Google user or anonymous browser can reopen and update their response.
- **AI autofill** — Ollama or OpenAI-compatible provider; suggestions only from user context, no invented facts.
- **Sample drafts** — 3 built-in profile samples + random draft; auto-fills all 42 questions for review/edit.
- **Admin dashboard** — upload, manage, copy links, load responses, export CSV/XLSX.
- **Response dashboard** — aggregate MCQ distribution charts, descriptive answer review, individual/aggregate toggle.
- **Share view** — read-only `/s/{share_token}` with MCQ + descriptive answers.
- **Docker + Termux** — one-command Docker deploy; Termux script for Android.

## Quick Start (Docker, recommended)

### Prerequisites
- Docker Desktop / Docker Engine + Docker Compose

### Run
```bash
git clone https://github.com/Tapas15/Questly.git
cd Questly
cp .env.example .env
# edit .env (set ADMIN_TOKEN, PUBLIC_BASE_URL, FRONTEND_ORIGIN; optional Google/LLM)
docker compose up --build -d
```

Open:
- Admin: `http://localhost:8080`
- API health: `http://localhost:8000/api/health`

Stop:
```bash
docker compose down
```

## Local Development

### Backend
```powershell
cd Questly
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
$env:PYTHONPATH='.'
.\.venv\Scripts\python -m uvicorn backend.app.main:app --reload --port 8000
```

### Frontend
```powershell
cd Questly\frontend
npm install
npm run dev
```
Dev UI: `http://localhost:5173` (proxies `/api` to backend).

## Termux (Android)

```bash
pkg install git -y
git clone https://github.com/Tapas15/Questly.git
cd Questly
chmod +x deploy-termux.sh
./deploy-termux.sh
```

Script installs deps, builds frontend, creates `.env` if missing, and starts backend/frontend.  
Manage: `./start-termux.sh` / `./stop-termux.sh`  
Logs: `.run/backend.log`, `.run/frontend.log`

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./backend/data/app.db` | SQLite default; set PostgreSQL URL for Postgres. |
| `ADMIN_TOKEN` | `changeme` | Admin API token for upload/export/delete/responses. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin / deployed frontend URL. |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Public base URL used in generated links. |
| `LLM_PROVIDER` | `ollama` | `ollama` or `openai_compatible`. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint. Docker: `http://host.docker.internal:11434`. |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model. |
| `LLM_API_KEY` | empty | API key for OpenAI-compatible provider. |
| `LLM_BASE_URL` | empty | e.g. `https://api.kilo.ai/api/gateway`. |
| `LLM_MODEL` | `gpt-4o-mini` | Model id for compatible provider. |
| `SESSION_SECRET` | `change-this-session-secret` | Strong random secret for auth sessions. |
| `AUTH_REQUIRED_FOR_SUBMIT` | `false` | Require sign-in before submit. |
| `AUTH_REQUIRED_PROVIDER` | `google` | `google`, `microsoft`, or `any`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google OAuth credentials. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | empty | Microsoft OAuth credentials. |
| `MICROSOFT_TENANT` | `common` | Microsoft tenant. |

## Google Sign-In Setup (public authenticated link)

1. Set in `.env`:
   ```env
   PUBLIC_BASE_URL=https://your-domain
   FRONTEND_ORIGIN=https://your-domain
   SESSION_SECRET=<strong-random-secret>
   AUTH_REQUIRED_FOR_SUBMIT=true
   AUTH_REQUIRED_PROVIDER=google
   GOOGLE_CLIENT_ID=<client-id>
   GOOGLE_CLIENT_SECRET=<client-secret>
   ```
2. In Google Cloud Console → APIs & Services → Credentials → OAuth client (Web app), add redirect URI:
   ```
   https://your-domain/api/auth/callback/google
   ```
3. Redeploy: `docker compose up --build -d`
4. Share Admin’s **Authenticated link**. Respondents sign in with Google before submit; identity is attached to response.

> Cloudflare quick tunnels change URL on restart. Update `PUBLIC_BASE_URL`, `FRONTEND_ORIGIN`, and Google redirect URI when URL changes. Use a named tunnel/custom domain for stable public sharing.

## Usage

1. Open Admin (`/`), enter `ADMIN_TOKEN`.
2. Upload `.docx` questionnaire.
3. Copy links from Admin:
   - **Authenticated link**: `/q/{slug}` — Google sign-in required.
   - **Anonymous link**: `/q/{slug}?auth=open` — no sign-in; name/firm requested for identification.
   - **Share view**: `/s/{share_token}` — read-only MCQ+descriptive summary.
4. Respondent fills/edits answers; can use sample drafts or AI suggestions; submits. Same user can reopen and update their response.
5. Admin loads responses, exports CSV/XLSX, or opens **Dashboard** (`/dashboard/{slug}`) for aggregate/individual insights.

## API (main)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/questionnaires/upload` | Admin | Upload/parse DOCX |
| GET | `/api/questionnaires` | Admin | List questionnaires |
| GET | `/api/questionnaires/{slug}` | Public | Get questionnaire + sample prefill |
| GET | `/api/questionnaires/{slug}/sample?profile=` | Public | Random or profile sample draft |
| POST | `/api/questionnaires/{slug}/suggest-all` | Public | AI suggestions for all questions |
| POST | `/api/questionnaires/{slug}/submit?auth=required|optional` | Public/session | Submit or update own response |
| GET | `/api/questionnaires/{slug}/my-response` | Session | Get current user's existing response |
| GET | `/api/questionnaires/{slug}/responses` | Admin | List responses |
| GET | `/api/questionnaires/{slug}/responses.csv|xlsx` | Admin | Export |
| GET | `/api/share/{token}` | Public | Read-only share view |
| GET | `/api/auth/providers` `/login/*` `/callback/*` `/me` `/logout` | Public | OAuth/session auth |

## Security & Privacy Notes

- Do not commit `.env` or real API keys. `.gitignore` excludes `.env`, data, uploads, logs.
- Set strong `ADMIN_TOKEN` and `SESSION_SECRET` in production.
- Google/Microsoft OAuth secrets must be kept server-side.
- Anonymous responses are identified by cookie-based anon ID and optional name/firm; not identity-proof.
- AI suggestions are sanitized server-side; invalid MCQ values discarded; no invented facts instructed.

## Development

```bash
# backend parser smoke test
$env:PYTHONPATH='.'; python -c "from backend.tests.test_parser import test_parse_questionnaire_counts; test_parse_questionnaire_counts(); print('ok')"

# frontend build
cd frontend && npm run build
```

## License

[MIT](LICENSE) — free for everyone to use, modify, distribute, and commercialize, with attribution and no warranty.
