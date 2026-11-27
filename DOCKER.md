# Docker

## Run

```powershell
cd C:\Users\Tapas\Documents\projects\formfill
Copy-Item .env.example .env
docker compose up --build -d
```

## URLs

- Frontend/Admin: http://localhost:8080
- Backend health: http://localhost:8000/api/health
- Public form: http://localhost:8080/q/{slug}

## Notes

- Frontend proxies `/api` to backend via Nginx.
- SQLite DB and uploads persist in Docker volumes (`backend_data`, `backend_uploads`).
- Default admin token is `changeme` (set `ADMIN_TOKEN` in `.env`).
- For Ollama on host machine, keep `OLLAMA_BASE_URL=http://host.docker.internal:11434`.
- For external sharing, set `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` to your public URL and expose port 8080.

## Stop

```powershell
docker compose down
```
