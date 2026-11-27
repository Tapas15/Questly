from __future__ import annotations

import json
import random
import hashlib
from typing import Any

from .llm import generate_json


SYSTEM_PROMPT = """You assist respondents in filling a questionnaire.
Rules:
- Use only the respondent instruction and provided respondent/context fields.
- Never invent company details, names, numbers, clients, contacts, certifications, revenue, or facts.
- For MCQ single-choice: suggest an option value only when clearly supported by instruction/context; otherwise null.
- For MCQ multi-choice: suggest only option values clearly supported; otherwise [].
- For descriptive/text: draft a concise professional answer only when supported; otherwise "".
- If unknown or unsupported, leave blank/null/[].
- Return strict JSON only.

Output format:
{
  "suggestions": [
    {"question_id":"q1","suggested_value":"option_value_or_text_or_array_or_null","confidence":"high|medium|low","reason":"short reason"}
  ]
}
"""


def _question_brief(q: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": q["id"],
        "number": q["number"],
        "section": q.get("section"),
        "text": q["text"],
        "type": q["type"],
        "options": [{"value": o["value"], "label": o["label"], "has_other_text": o.get("has_other_text", False)} for o in q.get("options", [])],
        "allow_other": q.get("allow_other", False),
        "max_selections": q.get("max_selections"),
    }


async def suggest_answers(
    *,
    instruction: str,
    respondent: dict[str, Any],
    current_answers: dict[str, Any],
    questions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str, str]:
    user = json.dumps({
        "instruction": instruction,
        "respondent": respondent,
        "current_answers": current_answers,
        "questions": [_question_brief(q) for q in questions],
    }, ensure_ascii=False)

    data, provider, model = await generate_json(SYSTEM_PROMPT, user)
    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []
    cleaned = []
    q_by_id = {q["id"]: q for q in questions}
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        qid = s.get("question_id")
        if qid not in q_by_id:
            continue
        cleaned.append(_sanitize_suggestion(q_by_id[qid], s))
    # ensure all requested questions present
    seen = {s["question_id"] for s in cleaned}
    for q in questions:
        if q["id"] not in seen:
            cleaned.append(_blank_for(q))
    return cleaned, provider, model


def _blank_for(q: dict[str, Any]) -> dict[str, Any]:
    if q["type"] == "multi":
        val: Any = []
    elif q["type"] == "single":
        val = None
    else:
        val = ""
    return {"question_id": q["id"], "suggested_value": val, "confidence": "low", "reason": "Insufficient support in instruction."}


def _sanitize_suggestion(q: dict[str, Any], s: dict[str, Any]) -> dict[str, Any]:
    qtype = q["type"]
    options = {o["value"] for o in q.get("options", [])}
    allow_other = q.get("allow_other", False)
    val = s.get("suggested_value")
    reason = str(s.get("reason") or "")[:300]
    confidence = s.get("confidence") if s.get("confidence") in {"high", "medium", "low"} else "low"

    if qtype == "single":
        if isinstance(val, dict):
            sel = val.get("value")
            other = str(val.get("other_text") or "").strip()
            if sel in options:
                if _is_other(q, sel):
                    return {"question_id": q["id"], "suggested_value": {"value": sel, "other_text": other if allow_other else ""}, "confidence": confidence, "reason": reason}
                return {"question_id": q["id"], "suggested_value": sel, "confidence": confidence, "reason": reason}
            return _blank_for(q)
        if isinstance(val, str) and val in options:
            return {"question_id": q["id"], "suggested_value": val, "confidence": confidence, "reason": reason}
        return _blank_for(q)

    if qtype == "multi":
        max_sel = q.get("max_selections")
        selected: list[str] = []
        other_text = ""
        if isinstance(val, dict):
            raw = val.get("values", [])
            other_text = str(val.get("other_text") or "").strip()
        elif isinstance(val, list):
            raw = val
        else:
            raw = []
        for item in raw:
            if isinstance(item, str) and item in options and item not in selected:
                selected.append(item)
        if max_sel:
            selected = selected[:max_sel]
        if any(_is_other(q, v) for v in selected) and allow_other and other_text:
            return {"question_id": q["id"], "suggested_value": {"values": selected, "other_text": other_text}, "confidence": confidence, "reason": reason}
        return {"question_id": q["id"], "suggested_value": selected, "confidence": confidence, "reason": reason}

    # text
    if isinstance(val, str):
        text = val.strip()
        if len(text) > 2000:
            text = text[:2000].strip()
        return {"question_id": q["id"], "suggested_value": text, "confidence": confidence, "reason": reason}
    return _blank_for(q)


def build_sample_prefill(questions: list[dict[str, Any]], firm_fields: list[dict[str, Any]], seed: str | None = None) -> dict[str, Any]:
    """Build a varied sample draft covering every question, based on questionnaire content.
    If seed is provided, same seed gives same draft; different seeds produce different selections/text.
    """
    rng = random.Random(seed or str(random.random()))
    answers: dict[str, Any] = {}
    for q in questions:
        qtype = q.get("type")
        opts = q.get("options", [])
        non_other = [o for o in opts if not str(o.get("label", "")).lower().startswith("other")]
        pool = non_other or opts
        if qtype == "single":
            answers[q["id"]] = rng.choice(pool)["value"] if pool else None
        elif qtype == "multi":
            max_sel = int(q.get("max_selections") or min(3, len(pool) or 1))
            max_sel = max(1, min(max_sel, len(pool) or 1))
            min_sel = 1 if len(pool) <= 1 else 2
            count = min(max_sel, rng.randint(min_sel, max(min_sel, min(3, max_sel))))
            pick = rng.sample(pool, count) if pool else []
            answers[q["id"]] = [o["value"] for o in pick]
        else:
            qtext = str(q.get("text", "")).strip()
            short = qtext.split(". ", 1)[-1] if ". " in qtext[:6] else qtext
            short = short.rstrip("?").strip()
            templates = [
                f"Sample response: In our firm, {short.lower()}. This varies by client and engagement; we can share specifics during a follow-up call.",
                f"Example: {short}. We handle this through a mix of standard process and case-by-case review depending on complexity.",
                f"Draft answer (edit as needed): {short}. Our current approach is practical and evolving as we adopt better tools and controls.",
                f"Placeholder response: Regarding {short.lower()}, we follow an internal workflow and document exceptions. Please replace with your firm's actual practice.",
            ]
            answers[q["id"]] = rng.choice(templates)
    respondent = {f["id"]: "" for f in firm_fields}
    instruction = "Sample draft auto-filled from questionnaire. Edit answers to match your firm's real details before submitting."
    return {"instruction": instruction, "answers": answers, "respondent": respondent}


def _is_other(q: dict[str, Any], value: str) -> bool:
    for o in q.get("options", []):
        if o.get("value") == value:
            label = (o.get("label") or "").lower()
            return bool(o.get("has_other_text")) or label.startswith("other")
    return False
