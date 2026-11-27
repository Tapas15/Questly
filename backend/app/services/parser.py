from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from docx import Document


QUESTION_RE = re.compile(r"^(\d{1,2})\.\s+(.*)")
OPTION_RE = re.compile(r"^[☐\-\*]\s*(.*)")
BLANK_RE = re.compile(r"_[_\s]{3,}")


@dataclass
class Option:
    value: str
    label: str
    has_other_text: bool = False


@dataclass
class Question:
    id: str
    number: int
    section: str
    text: str
    type: str  # single | multi | text
    options: list[Option]
    allow_other: bool
    max_selections: int | None
    required: bool = False


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def _slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return value or "field"


def _is_question(text: str) -> bool:
    return bool(QUESTION_RE.match(text))


def parse_questionnaire(path: str | Path) -> dict[str, Any]:
    doc = Document(str(path))
    paragraphs = [_clean(p.text) for p in doc.paragraphs]
    paragraphs = [p for p in paragraphs if p]

    firm_fields = _extract_firm_fields(paragraphs)
    sections = _extract_sections_and_questions(paragraphs)

    questions = [q for s in sections for q in s["questions"]]
    return {
        "title": "CA & Accounting Firm Problem-Validation Questionnaire",
        "source_file": Path(path).name,
        "firm_fields": firm_fields,
        "sections": sections,
        "questions": questions,
        "stats": {
            "total_questions": len(questions),
            "single": sum(1 for q in questions if q["type"] == "single"),
            "multi": sum(1 for q in questions if q["type"] == "multi"),
            "text": sum(1 for q in questions if q["type"] == "text"),
        },
    }


def _extract_firm_fields(paragraphs: list[str]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(field: dict[str, Any]) -> None:
        if field["id"] in seen:
            return
        seen.add(field["id"])
        fields.append(field)

    for text in paragraphs:
        if _is_question(text):
            break
        if "☐" in text and ":" not in text:
            # standalone checkboxes in details section handled below
            pass
        if ":" in text and not text.lower().startswith("section"):
            label, rest = text.split(":", 1)
            label = _clean(label)
            if not label or len(label) > 80:
                continue
            if label.lower().startswith("purpose"):
                continue
            if "☐" in rest:
                options = [Option(value=_slug(o), label=o) for o in _extract_options_from_line(text)]
                add({
                    "id": _slug(label),
                    "label": label,
                    "type": "single",
                    "options": [asdict(o) for o in options],
                })
                continue
            if BLANK_RE.search(text) or rest.strip() == "":
                add({"id": _slug(label), "label": label, "type": "text"})

    # explicit known optional detail fields that appear as checkbox lines
    for text in paragraphs:
        if text.startswith("Years of experience in the profession:"):
            opts = _extract_options_from_line(text)
            fields = [f for f in fields if f["id"] != _slug("Years of experience in the profession")]
            fields.append({
                "id": "years_of_experience",
                "label": "Years of experience in the profession",
                "type": "single",
                "options": [asdict(Option(value=_slug(o), label=o)) for o in opts],
            })
        if text.startswith("May I mention your firm's name"):
            opts = _extract_options_from_line(text)
            fields = [f for f in fields if f["id"] != _slug("May I mention your firm's name when discussing the research or pilot with others?")]
            fields.append({
                "id": "mention_firm_name_permission",
                "label": "May I mention your firm's name when discussing the research or pilot with others?",
                "type": "single",
                "options": [asdict(Option(value=_slug(o), label=o)) for o in opts],
            })
        if text.startswith("Open to a short follow-up discussion?"):
            opts = _extract_options_from_line(text)
            fields.append({
                "id": "open_to_followup",
                "label": "Open to a short follow-up discussion?",
                "type": "single",
                "options": [asdict(Option(value=_slug(o), label=o)) for o in opts],
            })
        if text.startswith("Preferred next step:"):
            opts = _extract_options_from_line(text)
            fields.append({
                "id": "preferred_next_step",
                "label": "Preferred next step",
                "type": "single",
                "options": [asdict(Option(value=_slug(o), label=o)) for o in opts],
            })

    # dedupe while preserving order
    deduped = []
    seen = set()
    for f in fields:
        if f["id"] in seen:
            continue
        seen.add(f["id"])
        deduped.append(f)
    return deduped


def _extract_options_from_line(text: str) -> list[str]:
    # split checkbox options in a single line
    parts = re.split(r"☐", text)
    opts = []
    for part in parts[1:]:
        opt = _clean(part)
        opt = re.sub(r":$", "", opt).strip()
        if opt:
            opts.append(opt)
    return opts


def _extract_sections_and_questions(paragraphs: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_section = "General"
    i = 0
    while i < len(paragraphs):
        text = paragraphs[i]
        if text.startswith("Section ") and "—" in text:
            current_section = text
            i += 1
            continue
        if text.startswith("Section ") and " " in text and len(text) < 80:
            # handles "Section G - ..." or similar
            current_section = text
            i += 1
            continue
        m = QUESTION_RE.match(text)
        if not m:
            i += 1
            continue

        number = int(m.group(1))
        qtext = _clean(text)
        i += 1
        options: list[Option] = []
        while i < len(paragraphs):
            nxt = paragraphs[i]
            if _is_question(nxt):
                break
            if nxt.startswith("Section "):
                break
            if nxt.startswith("Thank you"):
                break
            if nxt.startswith("Optional follow-up"):
                break
            if nxt.startswith("☐"):
                label = _clean(nxt.lstrip("☐").strip())
                has_other = "other" in label.lower() or BLANK_RE.search(label) is not None
                clean_label = BLANK_RE.sub("", label).replace(":", "").strip()
                clean_label = re.sub(r"\s*/\s*$", "", clean_label).strip()
                options.append(Option(value=_slug(clean_label)[:60] or f"option_{len(options)+1}", label=clean_label, has_other_text=has_other))
                i += 1
                continue
            if BLANK_RE.search(nxt):
                # descriptive answer lines; ignore
                i += 1
                continue
            # extra descriptive prompt lines belong to text questions - append
            if not options and number >= 36:
                qtext = f"{qtext} {_clean(nxt)}"
            i += 1

        qtype = "text"
        max_selections = None
        allow_other = any(o.has_other_text for o in options)
        low = qtext.lower()
        if options:
            multi = any(k in low for k in ["select all", "choose up to", "select up to"])
            if "select up to five" in low:
                max_selections = 5
            if "choose up to three" in low:
                max_selections = 3
            qtype = "multi" if multi else "single"

        question = Question(
            id=f"q{number}",
            number=number,
            section=current_section,
            text=qtext,
            type=qtype,
            options=options,
            allow_other=allow_other,
            max_selections=max_selections,
        )
        if not sections or sections[-1]["name"] != current_section:
            sections.append({"name": current_section, "questions": []})
        sections[-1]["questions"].append(question)

    # convert dataclasses for JSON serialization
    for s in sections:
        s["questions"] = [asdict(q) for q in s["questions"]]
        for q in s["questions"]:
            q["options"] = [asdict(o) if not isinstance(o, dict) else o for o in q["options"]]

    return sections
