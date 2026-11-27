from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth = OAuth()
if settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
if settings.microsoft_client_id and settings.microsoft_client_secret:
    tenant = settings.microsoft_tenant or "common"
    oauth.register(
        name="microsoft",
        client_id=settings.microsoft_client_id,
        client_secret=settings.microsoft_client_secret,
        server_metadata_url=f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile User.Read"},
    )


def _providers() -> list[dict[str, Any]]:
    out = []
    if settings.google_client_id and settings.google_client_secret:
        out.append({"id": "google", "label": "Google"})
    if settings.microsoft_client_id and settings.microsoft_client_secret:
        out.append({"id": "microsoft", "label": "Microsoft"})
    return out


def _user_out(u: User | None) -> dict[str, Any] | None:
    if not u:
        return None
    return {"id": u.id, "provider": u.provider, "email": u.email, "name": u.name, "picture": u.picture}


def get_current_user(request: Request, db: Session) -> User | None:
    uid = request.session.get("user_id")
    if not uid:
        return None
    return db.get(User, uid)


@router.get("/providers")
def providers():
    provs = _providers()
    required = settings.auth_required_provider if settings.auth_required_for_submit else "none"
    if settings.auth_required_for_submit and settings.auth_required_provider != "any":
        provs = [p for p in provs if p["id"] == settings.auth_required_provider]
    return {"providers": provs, "auth_required_for_submit": settings.auth_required_for_submit, "required_provider": required}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    return {"user": _user_out(get_current_user(request, db))}


@router.get("/login/{provider}")
async def login(provider: str, request: Request, next: str = "/"):
    allowed = {p["id"] for p in _providers()}
    if settings.auth_required_for_submit and settings.auth_required_provider != "any":
        allowed = {settings.auth_required_provider} & allowed
    if provider not in allowed:
        raise HTTPException(status_code=404, detail=f"{provider.title()} login is not configured. Set {provider.upper()}_CLIENT_ID and {provider.upper()}_CLIENT_SECRET in .env.")
    request.session["auth_next"] = next if next.startswith("/") else "/"
    redirect_uri = str(request.url_for("auth_callback", provider=provider))
    # behind reverse proxy/tunnel, prefer public base
    if settings.public_base_url:
        base = settings.public_base_url.rstrip("/")
        redirect_uri = f"{base}/api/auth/callback/{provider}"
    client = oauth.create_client(provider)
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/callback/{provider}", name="auth_callback")
async def auth_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    if provider not in {p["id"] for p in _providers()}:
        raise HTTPException(status_code=404, detail="Auth provider not configured")
    client = oauth.create_client(provider)
    try:
        token = await client.authorize_access_token(request)
    except OAuthError as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e.error}")
    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = await client.userinfo(token=token)
        except Exception:
            userinfo = {}
    # Microsoft may use oid/sub; Google uses sub
    sub = str(userinfo.get("sub") or userinfo.get("oid") or userinfo.get("id") or "")
    email = str(userinfo.get("email") or userinfo.get("preferred_username") or "")
    name = str(userinfo.get("name") or userinfo.get("given_name") or email or "User")
    picture = str(userinfo.get("picture") or "")
    if not sub:
        raise HTTPException(status_code=400, detail="Could not identify user from provider")

    user = db.scalar(select(User).where(User.provider == provider, User.provider_sub == sub))
    now = utcnow()
    if not user:
        user = User(provider=provider, provider_sub=sub, email=email, name=name, picture=picture, last_login_at=now)
        db.add(user)
    else:
        user.email = email or user.email
        user.name = name or user.name
        user.picture = picture or user.picture
        user.last_login_at = now
    db.commit()
    db.refresh(user)

    request.session["user_id"] = user.id
    nxt = request.session.pop("auth_next", "/")
    target = nxt if nxt.startswith("/") else "/"
    return RedirectResponse(url=f"{settings.frontend_origin.rstrip('/')}{target}")


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}
