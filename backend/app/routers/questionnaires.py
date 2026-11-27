from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Questionnaire, Response as ResponseModel, User
from ..schemas import SuggestAllRequest, SuggestQuestionRequest, SuggestResponse, SubmitRequest, SubmitResponse, UploadResponse
from ..services.autofill import suggest_answers
from ..services.export import to_csv, to_xlsx
from ..services.llm import LLMError
from ..services.parser import parse_questionnaire

router = APIRouter(prefix="/api", tags=["api"])


def _require_admin(x_admin_token: str | None) -> None:
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


def _public_url(slug: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/q/{slug}"


def _q_out(q: Questionnaire) -> dict[str, Any]:
    schema = json.loads(q.schema_json)
    return {
        "id": q.id,
        "title": q.title,
        "source_filename": q.source_filename,
        "public_slug": q.public_slug,
        "share_token": q.share_token,
        "public_url": _public_url(q.public_slug),
        "share_url": f"{settings.public_base_url.rstrip('/')}/s/{q.share_token}",
        "created_at": q.created_at,
        "firm_fields": schema.get("firm_fields", []),
        "questions": schema.get("questions", []),
        "stats": schema.get("stats", {}),
    }


def _get_session_user(request: Request, db: Session) -> User | None:
    uid = request.session.get("user_id")
    if not uid:
        return None
    return db.get(User, uid)


@router.post("/questionnaires/upload", response_model=UploadResponse)
async def upload_questionnaire(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_admin_token: str | None = Header(default=None),
):
    _require_admin(x_admin_token)
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Upload a .docx file")

    upload_dir = Path("backend/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{secrets.token_hex(8)}_{Path(file.filename).name}"
    content = await file.read()
    dest.write_bytes(content)

    schema = parse_questionnaire(dest)
    if schema.get("stats", {}).get("total_questions") != 42:
        raise HTTPException(status_code=400, detail=f"Expected 42 questions, found {schema.get('stats',{}).get('total_questions')}")

    slug = secrets.token_urlsafe(8)
    q = Questionnaire(
        title=schema.get("title") or "Questionnaire",
        source_filename=file.filename,
        public_slug=slug,
        schema_json=json.dumps(schema, ensure_ascii=False),
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return {"questionnaire": _q_out(q)}


@router.get("/questionnaires/{slug}")
def get_questionnaire(slug: str, db: Session = Depends(get_db)):
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    out = _q_out(q)
    try:
        from ..services.autofill import build_sample_prefill
        # random seed so each fetch gives a different sample draft
        import uuid
        out["sample_prefill"] = build_sample_prefill(schema.get("questions", []), schema.get("firm_fields", []), seed=str(uuid.uuid4()))
    except Exception:
        out["sample_prefill"] = {"instruction": "", "answers": {}, "respondent": {}}
    return {"questionnaire": out}


@router.get("/questionnaires/{slug}/sample")
def get_questionnaire_sample(slug: str, profile: str | None = None, db: Session = Depends(get_db)):
    """Return a sample draft. If profile=ankit|priya|rohan, return that profile's filled draft."""
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    questions = schema.get("questions", [])
    firm_fields = schema.get("firm_fields", [])
    from ..services.autofill import build_sample_prefill, build_prefill_from_instruction, SAMPLE_PROFILES
    if profile:
        p = next((x for x in SAMPLE_PROFILES if x["id"] == profile), None)
        if p:
            prefill = build_prefill_from_instruction(questions, firm_fields, p["instruction"])
            prefill["profile_id"] = p["id"]
            prefill["profile_label"] = p["label"]
            return {"sample_prefill": prefill, "profiles": SAMPLE_PROFILES}
    import uuid
    prefill = build_sample_prefill(questions, firm_fields, seed=str(uuid.uuid4()))
    return {"sample_prefill": prefill, "profiles": SAMPLE_PROFILES}


@router.get("/share/{token}")
def get_shared(token: str, db: Session = Depends(get_db)):
    q = db.scalar(select(Questionnaire).where(Questionnaire.share_token == token))
    if not q:
        raise HTTPException(status_code=404, detail="Share link not found")
    schema = json.loads(q.schema_json)
    responses = db.scalars(select(ResponseModel).where(ResponseModel.questionnaire_id == q.id).order_by(ResponseModel.submitted_at.desc())).all()
    questions = schema.get("questions", [])
    firm_fields = schema.get("firm_fields", [])

    out_responses = []
    for r in responses:
        payload = json.loads(r.answers_json)
        respondent = json.loads(r.respondent_json)
        answers = payload.get("answers", {})
        mcq = []
        for qu in questions:
            if qu["type"] not in ("single", "multi"):
                continue
            val = answers.get(qu["id"])
            labels = _answer_labels(qu, val)
            if labels:
                mcq.append({"question_id": qu["id"], "number": qu["number"], "text": qu["text"], "labels": labels})
        out_responses.append({
            "id": r.id,
            "submitted_at": r.submitted_at,
            "respondent": {f["id"]: respondent.get(f["id"]) for f in firm_fields},
            "mcq_answers": mcq,
            "descriptive_answers": [
                {"question_id": qu["id"], "number": qu["number"], "text": qu["text"], "answer": answers.get(qu["id"], "")}
                for qu in questions if qu["type"] == "text" and str(answers.get(qu["id"], "")).strip()
            ],
        })

    return {
        "questionnaire": {
            "title": q.title,
            "public_url": _public_url(q.public_slug),
            "created_at": q.created_at,
            "stats": schema.get("stats", {}),
            "firm_fields": firm_fields,
            "questions": [qu for qu in questions if qu["type"] in ("single", "multi")],
        },
        "responses": out_responses,
    }


def _answer_labels(question: dict[str, Any], value: Any) -> list[str]:
    opts = {o["value"]: o["label"] for o in question.get("options", [])}
    labels: list[str] = []
    if question["type"] == "single":
        if isinstance(value, dict):
            v = value.get("value")
            other = str(value.get("other_text") or "").strip()
            if v in opts:
                labels.append(opts[v] + (f" (Other: {other})" if other else ""))
        elif isinstance(value, str) and value in opts:
            labels.append(opts[value])
    elif question["type"] == "multi":
        vals = value.get("values", []) if isinstance(value, dict) else (value if isinstance(value, list) else [])
        other = str(value.get("other_text") or "").strip() if isinstance(value, dict) else ""
        for v in vals:
            if v in opts:
                labels.append(opts[v])
        if other and any(o.get("has_other_text") for o in question.get("options", []) if o["value"] in vals):
            labels[-1] = labels[-1] + f" (Other: {other})" if labels else f"Other: {other}"
    return labels


@router.get("/questionnaires")
def list_questionnaires(db: Session = Depends(get_db), x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    qs = db.scalars(select(Questionnaire).order_by(Questionnaire.created_at.desc())).all()
    return {"questionnaires": [_q_out(q) for q in qs]}


@router.delete("/questionnaires/{slug}")
def delete_questionnaire(slug: str, db: Session = Depends(get_db), x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    db.delete(q)
    db.commit()
    return {"ok": True}


@router.post("/questionnaires/{slug}/suggest-all", response_model=SuggestResponse)
async def suggest_all(slug: str, req: SuggestAllRequest, db: Session = Depends(get_db)):
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    try:
        suggestions, provider, model = await suggest_answers(
            instruction=req.instruction,
            respondent=req.respondent,
            current_answers=req.current_answers,
            questions=schema.get("questions", []),
        )
    except LLMError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"suggestions": suggestions, "provider": provider, "model": model}


@router.post("/questionnaires/{slug}/suggest-question", response_model=SuggestResponse)
async def suggest_question(slug: str, req: SuggestQuestionRequest, db: Session = Depends(get_db)):
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    question = next((x for x in schema.get("questions", []) if x["id"] == req.question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    try:
        suggestions, provider, model = await suggest_answers(
            instruction=req.instruction,
            respondent=req.respondent,
            current_answers=req.current_answers,
            questions=[question],
        )
    except LLMError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"suggestions": suggestions, "provider": provider, "model": model}


@router.post("/questionnaires/{slug}/submit", response_model=SubmitResponse)
def submit(slug: str, req: SubmitRequest, request: Request, db: Session = Depends(get_db), auth: str | None = None):
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    user = _get_session_user(request, db)
    require_auth = auth == "required" or (auth != "optional" and settings.auth_required_for_submit)
    if require_auth and not user:
        raise HTTPException(status_code=401, detail="Please sign in with Google to submit your response.")
    if require_auth and settings.auth_required_provider != "any" and user and user.provider != settings.auth_required_provider:
        raise HTTPException(status_code=401, detail=f"Please sign in with {settings.auth_required_provider.title()} to submit your response.")
    respondent = req.respondent
    identity = {"mode": "anonymous", "label": "Anonymous"}
    if user:
        identity = {"mode": "authenticated", "provider": user.provider, "email": user.email, "name": user.name, "user_id": user.id, "label": user.email or user.name or "Authenticated user"}
        respondent = {**req.respondent, "_auth": identity}
    else:
        anon_id = request.cookies.get("anon_id") or secrets.token_hex(8)
        identity = {"mode": "anonymous", "anon_id": anon_id, "label": f"Anonymous ({anon_id[:8]})"}
        respondent = {**req.respondent, "_anon": identity}
    resp = ResponseModel(
        questionnaire_id=q.id,
        respondent_json=json.dumps(respondent, ensure_ascii=False),
        answers_json=json.dumps({
            "answers": req.answers,
            "accepted_ai": req.accepted_ai,
        }, ensure_ascii=False),
        ai_instruction=req.ai_instruction,
        status="submitted",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(resp)
    db.commit()
    db.refresh(resp)
    result = {"response_id": resp.id, "status": resp.status, "submitted_at": resp.submitted_at}
    from fastapi.responses import JSONResponse
    jr = JSONResponse(result)
    if not user:
        jr.set_cookie("anon_id", identity["anon_id"], max_age=60*60*24*365, httponly=False, samesite="lax")
    return jr


@router.get("/questionnaires/{slug}/responses")
def list_responses(slug: str, db: Session = Depends(get_db), x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    resps = db.scalars(select(ResponseModel).where(ResponseModel.questionnaire_id == q.id).order_by(ResponseModel.submitted_at.desc())).all()
    out = []
    for r in resps:
        payload = json.loads(r.answers_json)
        out.append({
            "id": r.id,
            "submitted_at": r.submitted_at,
            "status": r.status,
            "ai_instruction": r.ai_instruction,
            "respondent": json.loads(r.respondent_json),
            "answers": payload.get("answers", {}),
            "accepted_ai": payload.get("accepted_ai", {}),
        })
    return {"responses": out}


@router.get("/questionnaires/{slug}/responses.csv")
def export_csv(slug: str, db: Session = Depends(get_db), x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    responses = list_responses(slug, db, x_admin_token)["responses"]
    csv_text = to_csv(schema, responses)
    return PlainTextResponse(csv_text, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{slug}-responses.csv"'})


@router.get("/questionnaires/{slug}/responses.xlsx")
def export_xlsx(slug: str, db: Session = Depends(get_db), x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    q = db.scalar(select(Questionnaire).where(Questionnaire.public_slug == slug))
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    schema = json.loads(q.schema_json)
    responses = list_responses(slug, db, x_admin_token)["responses"]
    data = to_xlsx(schema, responses)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{slug}-responses.xlsx"'},
    )
