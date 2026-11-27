from __future__ import annotations

import csv
import io
import json
from typing import Any

from openpyxl import Workbook


def responses_to_rows(schema: dict[str, Any], responses: list[dict[str, Any]]) -> tuple[list[str], list[list[Any]]]:
    firm_fields = schema.get("firm_fields", [])
    questions = schema.get("questions", [])
    headers = ["response_id", "submitted_at", "status", "ai_instruction"]
    headers += [f"firm:{f['id']}" for f in firm_fields]
    headers += [f"q{q['number']}" for q in questions]

    rows: list[list[Any]] = []
    for r in responses:
        respondent = r.get("respondent", {})
        answers = r.get("answers", {})
        row = [r.get("id"), r.get("submitted_at"), r.get("status"), r.get("ai_instruction", "")]
        for f in firm_fields:
            row.append(_stringify(respondent.get(f["id"])))
        for q in questions:
            row.append(_stringify(answers.get(q["id"])))
        rows.append(row)
    return headers, rows


def to_csv(schema: dict[str, Any], responses: list[dict[str, Any]]) -> str:
    headers, rows = responses_to_rows(schema, responses)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue()


def to_xlsx(schema: dict[str, Any], responses: list[dict[str, Any]]) -> bytes:
    headers, rows = responses_to_rows(schema, responses)
    wb = Workbook()
    ws = wb.active
    ws.title = "Responses"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        if "values" in value:
            vals = ", ".join(map(str, value.get("values", [])))
            other = str(value.get("other_text") or "").strip()
            return f"{vals}; Other: {other}".strip("; ")
        if "value" in value:
            other = str(value.get("other_text") or "").strip()
            base = str(value.get("value") or "")
            return f"{base}; Other: {other}" if other else base
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return ", ".join(map(str, value))
    return str(value)
