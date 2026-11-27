from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response
from sqlalchemy import inspect, text

from .config import settings
from .db import Base, engine
from .routers.questionnaires import router as questionnaire_router
from .routers.auth import router as auth_router

app = FastAPI(title=settings.app_name)


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    _local = {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080"}

    def _allowed(self, origin: str) -> bool:
        if not origin:
            return False
        if origin in self._local:
            return True
        if settings.frontend_origin and origin == settings.frontend_origin.rstrip('/'):
            return True
        if settings.public_base_url and origin == settings.public_base_url.rstrip('/'):
            return True
        if not settings.frontend_origin and not settings.public_base_url:
            return origin.startswith('http://') or origin.startswith('https://')
        return False

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get('origin', '')
        if request.method == 'OPTIONS' and self._allowed(origin):
            resp = Response(status_code=204)
        else:
            resp = await call_next(request)
        if self._allowed(origin):
            resp.headers['Access-Control-Allow-Origin'] = origin
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
            resp.headers['Vary'] = 'Origin'
            req_headers = request.headers.get('access-control-request-headers')
            resp.headers['Access-Control-Allow-Headers'] = req_headers or '*'
            resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        return resp


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site='lax',
    https_only=(settings.public_base_url or settings.frontend_origin).startswith('https://'),
)
app.add_middleware(DynamicCORSMiddleware)

app.include_router(auth_router)
app.include_router(questionnaire_router)


@app.on_event("startup")
def on_startup() -> None:
    Path("backend/data").mkdir(parents=True, exist_ok=True)
    Path("backend/uploads").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = [c["name"] for c in inspect(conn).get_columns("questionnaires")]
        if "share_token" not in cols:
            conn.execute(text("ALTER TABLE questionnaires ADD COLUMN share_token VARCHAR(64)"))
        rows = conn.execute(text("SELECT id, share_token FROM questionnaires")).fetchall()
        for row in rows:
            if not row.share_token:
                conn.execute(text("UPDATE questionnaires SET share_token=:t WHERE id=:id"), {"t": secrets.token_urlsafe(16), "id": row.id})
        resp_cols = [c["name"] for c in inspect(conn).get_columns("responses")]
        if "respondent_key" not in resp_cols:
            conn.execute(text("ALTER TABLE responses ADD COLUMN respondent_key VARCHAR(128) DEFAULT ''"))

    # Print useful URLs on startup (visible in docker compose logs / termux logs)
    base = (settings.public_base_url or settings.frontend_origin or "http://localhost:8080").rstrip("/")
    google_cb = f"{base}/api/auth/callback/google"
    lines = [
        "",
        "=" * 60,
        "Questly is running",
        f"Admin Dashboard:        {base}/",
        f"API Health:             {base}/api/health",
        f"Public form:            {base}/q/<slug>  (after DOCX upload)",
        f"Anonymous form:         {base}/q/<slug>?auth=open",
        f"Dashboard:              {base}/dashboard/<slug>",
        f"Google OAuth Redirect:  {google_cb}",
        "Add the Google OAuth Redirect URI above in Google Cloud Console > Credentials.",
        "If using quick tunnel, replace base with current https://<tunnel>.trycloudflare.com and add that callback URI in Google Console.",
        "=" * 60,
        "",
    ]
    msg = "\n".join(lines)
    print(msg, flush=True)


@app.get("/api/health")
def health():
    return {"ok": True}
