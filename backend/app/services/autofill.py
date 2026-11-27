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


SAMPLE_PROFILES = [
    {
        "id": "ankit",
        "label": "Sample 1: Small CA Practice (Cuttack)",
        "instruction": "My name is Ankit Sharma, and I run K. Sharma & Associates, a small CA practice in Cuttack, Odisha. We have a team of 4 people and approximately 180 clients. We primarily handle GST returns, income-tax filing, TDS, accounting and tax audits. We use TallyPrime, Excel and ClearTax. Our biggest challenges are collecting client documents, following up for missing invoices, GST reconciliation and manual data entry. I would like a solution that can organise client documents, extract invoice information, identify GST mismatches and prepare reports for staff review. I prefer an add-on that works with our existing software rather than replacing it. I would be interested in testing a prototype free of charge initially and would consider paying if it saves staff time and reduces errors.",
    },
    {
        "id": "priya",
        "label": "Sample 2: Audit Firm (Bhubaneswar)",
        "instruction": "I am Priya Mehta, an audit partner at Mehta Rao & Co., a CA firm based in Bhubaneswar. We have around 35 employees and serve approximately 450 business clients. Our services include statutory audits, internal audits, tax audits, GST, income tax and financial reporting. We use TallyPrime, Excel, Winman and audit software. Our major challenges are audit documentation, vouching, evidence collection, ledger scrutiny, review notes and tracking missing client documents. We need a system that can read supporting documents, match them with transactions, flag exceptions and link evidence to audit working papers. We require source references, reviewer approvals and a proper audit trail. We prefer integration with our existing systems. We would be open to a free initial prototype pilot using anonymised data.",
    },
    {
        "id": "rohan",
        "label": "Sample 3: Accounting Services (Kolkata)",
        "instruction": "My name is Rohan Das, and I manage LedgerLine Accounting Services in Kolkata. We have 8 employees and approximately 120 clients, mainly small businesses, proprietorships and private limited companies. We provide bookkeeping, accounting, GST support, TDS and payroll services. We use TallyPrime, BUSY, Zoho Books and Excel. Our biggest problems are manual voucher entry, bank reconciliation, invoice processing, ledger classification and monthly closing. I want a tool that can read bank statements and invoices, suggest accounting entries, match transactions and identify duplicates or errors. Staff should review and approve entries before they are posted. We do not want to replace our current accounting software; we want something that integrates with it. We would be willing to test an initial prototype free of charge and consider a paid solution if it provides measurable savings.",
    },
]


def build_prefill_from_instruction(questions: list[dict[str, Any]], firm_fields: list[dict[str, Any]], instruction: str) -> dict[str, Any]:
    """Heuristic prefill: selects MCQ options and fills descriptive answers based on instruction text."""
    text = instruction.lower()
    answers: dict[str, Any] = {}
    for q in questions:
        qtype = q.get("type")
        opts = q.get("options", [])
        non_other = [o for o in opts if not str(o.get("label", "")).lower().startswith("other")]
        pool = non_other or opts
        if qtype == "single":
            picked = None
            for o in pool:
                label = str(o.get("label", "")).lower()
                keywords = [w for w in label.replace("/", " ").replace(",", " ").split() if len(w) > 3 and w not in {"with","than","that","this","from","have","your","firm","client","clients","would","prefer"}]
                if keywords and any(k in text for k in keywords):
                    picked = o["value"]; break
            joined = " ".join(str(o.get("label","")).lower() for o in pool)
            if not picked:
                if "1-3" in joined and any(x in text for x in ["team of 4", "4 people", "3 people", "2 people"]):
                    picked = next((o["value"] for o in pool if "1" in o["label"] and "3" in o["label"]), None)
                if "4-10" in joined and any(x in text for x in ["8 employees", "10 employees", "5 employees"]):
                    picked = next((o["value"] for o in pool if "4" in o["label"] and "10" in o["label"]), None)
                if "11-25" in joined and any(x in text for x in ["35 employees", "20 employees", "15 employees"]):
                    picked = next((o["value"] for o in pool if "11" in o["label"] or "25" in o["label"]), None)
                if "50-200" in joined and any(x in text for x in ["180 clients", "120 clients", "150 clients"]):
                    picked = next((o["value"] for o in pool if "50" in o["label"] and "200" in o["label"]), None)
                if "201-500" in joined and any(x in text for x in ["450 business clients", "300 clients", "400 clients"]):
                    picked = next((o["value"] for o in pool if "201" in o["label"] or "500" in o["label"]), None)
                if "yes" in joined and "prototype" in text and ("pilot" in str(q.get("text","")).lower() or "test" in str(q.get("text","")).lower() or "interested" in str(q.get("text","")).lower()):
                    picked = next((o["value"] for o in pool if o["label"].lower().strip().startswith("yes")), picked)
                if ("add-on" in joined or "integrate" in joined) and ("add-on" in text or "integrat" in text or "not replace" in text):
                    picked = next((o["value"] for o in pool if "add" in o["label"].lower() or "integrat" in o["label"].lower() or "existing" in o["label"].lower()), picked)
            answers[q["id"]] = picked or (pool[0]["value"] if pool else None)
        elif qtype == "multi":
            max_sel = int(q.get("max_selections") or len(pool))
            selected = []
            qtext = str(q.get("text","")).lower()
            for o in pool:
                label = str(o.get("label","")).lower()
                label_words = [w for w in label.replace("/"," ").replace(","," ").replace("("," ").replace(")"," ").split() if len(w) > 3]
                if any(w in text for w in label_words):
                    selected.append(o["value"])
            if "service" in qtext:
                for kw, lab_kw in [("gst","gst"),("income-tax","income"),("income tax","income"),("tds","tds"),("accounting","account"),("audit","audit"),("bookkeeping","bookkeep"),("payroll","payroll"),("financial reporting","report")]:
                    if kw in text:
                        for o in pool:
                            if lab_kw in o["label"].lower() and o["value"] not in selected:
                                selected.append(o["value"])
            if "software" in qtext or "tool" in qtext:
                for kw, lab_kw in [("tallyprime","tally"),("tally","tally"),("excel","excel"),("cleartax","clear"),("winman","winman"),("busy","busy"),("zoho","zoho")]:
                    if kw in text:
                        for o in pool:
                            if lab_kw in o["label"].lower() and o["value"] not in selected:
                                selected.append(o["value"])
            if "challenge" in qtext or "problem" in qtext:
                for kw, lab_kw in [("document","document"),("reconcil","reconcil"),("manual","manual"),("missing","missing"),("follow","follow"),("data entry","entry"),("vouching","vouch"),("evidence","evidence"),("ledger","ledger"),("review notes","review"),("bank","bank"),("invoice","invoice"),("duplicate","duplicate"),("closing","closing"),("classification","classif")]:
                    if kw in text:
                        for o in pool:
                            if lab_kw in o["label"].lower() and o["value"] not in selected:
                                selected.append(o["value"])
            seen = set(); deduped=[]
            for v in selected:
                if v not in seen: seen.add(v); deduped.append(v)
            if not deduped: deduped = [o["value"] for o in pool[:min(2, max_sel)]]
            answers[q["id"]] = deduped[:max_sel]
        else:
            qtext = str(q.get("text","")).strip()
            short = qtext.split(". ", 1)[-1] if ". " in qtext[:6] else qtext
            short = short.rstrip("?").strip()
            answers[q["id"]] = f"Based on the provided profile: {instruction.strip()[:280]}{'...' if len(instruction.strip())>280 else ''}\n\nRegarding \"{short}\": This response reflects our firm's current practice and requirements as described above. We would be happy to provide further details during a follow-up discussion."
    respondent: dict[str, Any] = {}
    name_match = None
    for pat in ["my name is ", "i am "]:
        if pat in text:
            rest = instruction[text.index(pat)+len(pat):]
            name_match = rest.split(",")[0].split(" and ")[0].strip().rstrip(".")
            if len(name_match) > 60: name_match = None
            break
    for f in firm_fields:
        fid = f.get("id",""); fl = str(f.get("label","")).lower()
        if "name" in fl and name_match:
            respondent[fid] = name_match
        elif "firm" in fl or "practice" in fl:
            for nm in ["K. Sharma & Associates","Mehta Rao & Co.","LedgerLine Accounting Services"]:
                if nm.lower() in text: respondent[fid] = nm; break
            else: respondent[fid] = ""
        elif "city" in fl or "location" in fl:
            for city in ["Cuttack, Odisha","Bhubaneswar","Kolkata"]:
                if city.lower().split(",")[0] in text: respondent[fid] = city; break
            else: respondent[fid] = ""
        else:
            respondent[fid] = ""
    return {"instruction": instruction, "answers": answers, "respondent": respondent}

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

