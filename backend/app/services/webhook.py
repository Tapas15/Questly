from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)


def _format_answer(question: dict[str, Any], value: Any) -> str:
    if value is None:
        return ""
    opts = {o.get("value"): o.get("label") for o in question.get("options", [])}
    if isinstance(value, dict):
        if "values" in value:
            vals = [opts.get(v, str(v)) for v in (value.get("values") or [])]
            other = str(value.get("other_text") or "").strip()
            if other:
                vals.append(f"Other: {other}")
            return "; ".join(vals)
        if "value" in value:
            base = opts.get(value.get("value"), str(value.get("value") or ""))
            other = str(value.get("other_text") or "").strip()
            return f"{base}; Other: {other}" if other else base
    if isinstance(value, list):
        return "; ".join(opts.get(v, str(v)) for v in value)
    if isinstance(value, str) and question.get("type") in {"single", "multi"}:
        return opts.get(value, value)
    return str(value)


def build_response_payload(*, questionnaire: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    questions = questionnaire.get("questions", [])
    respondent = response.get("respondent") or {}
    answers = response.get("answers") or {}
    auth = respondent.get("_auth") or {}
    anon = respondent.get("_anon") or {}
    identity = "Google verified" if auth else "Anonymous"
    display_name = auth.get("name") or respondent.get("_display_name") or respondent.get("your_name_optional") or anon.get("display_name") or ""
    email = auth.get("email") or respondent.get("primary_contact_email_phone_optional") or ""
    firm = respondent.get("_firm_name") or respondent.get("firm_practice_name") or anon.get("firm_name") or ""

    q_rows = []
    flat: dict[str, Any] = {}
    for q in questions:
        answer = _format_answer(q, answers.get(q.get("id")))
        q_rows.append({
            "question_id": q.get("id"),
            "number": q.get("number"),
            "section": q.get("section"),
            "text": q.get("text"),
            "type": q.get("type"),
            "answer": answer,
        })
        flat[f"Q{q.get('number')}"] = answer

    return {
        "event": "response.submitted",
        "response_id": response.get("id"),
        "submitted_at": str(response.get("submitted_at") or ""),
        "status": response.get("status"),
        "updated": bool(response.get("updated", False)),
        "questionnaire": {
            "id": questionnaire.get("id"),
            "title": questionnaire.get("title"),
            "public_slug": questionnaire.get("public_slug"),
        },
        "respondent": {
            "identity": identity,
            "name": display_name,
            "email": email,
            "firm": firm,
            "city": respondent.get("office_location_city_state") or "",
            "role": respondent.get("your_designation_role") or "",
            "contact": respondent.get("primary_contact_email_phone_optional") or "",
            "auth": auth,
            "anon": anon,
        },
        "ai_instruction": response.get("ai_instruction") or "",
        "questions": q_rows,
        "answers_flat": flat,
        "raw_answers": answers,
    }


def send_response_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    url = (settings.response_webhook_url or "").strip()
    if not settings.response_webhook_enabled or not url:
        return {"sent": False, "reason": "disabled_or_unconfigured"}
    headers = {"Content-Type": "application/json"}
    secret = (settings.response_webhook_secret or "").strip()
    if secret:
        headers["X-Webhook-Secret"] = secret
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            res = client.post(url, json=payload, headers=headers)
        ok = 200 <= res.status_code < 300
        if not ok:
            log.warning("webhook failed status=%s body=%s", res.status_code, res.text[:300])
        return {"sent": ok, "status_code": res.status_code, "body": res.text[:300]}
    except Exception as e:
        log.exception("webhook error")
        return {"sent": False, "error": str(e)}
