from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import inspect, text

from .config import settings
from .db import Base, engine
from .routers.questionnaires import router as questionnaire_router
from .routers.auth import router as auth_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=settings.public_base_url.startswith("https://"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)

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


@app.get("/api/health")
def health():
    return {"ok": True}
