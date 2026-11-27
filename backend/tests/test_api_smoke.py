from __future__ import annotations

import json
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app


DOC = Path(__file__).resolve().parents[1] / "CA_Accounting_Firm_Problem_Validation_Questionnaire.docx"


def test_upload_parse_and_public_get(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path/'test.db'}")
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    # reimport app with new env would be ideal; for smoke, use existing app and ensure endpoint works if DB already created.
    client = TestClient(app)
    with DOC.open("rb") as f:
        r = client.post("/api/questionnaires/upload", files={"file": ("q.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, headers={"X-Admin-Token": "test-token"})
    assert r.status_code == 200, r.text
    data = r.json()["questionnaire"]
    assert data["stats"]["total_questions"] == 42
    slug = data["public_slug"]
    r2 = client.get(f"/api/questionnaires/{slug}")
    assert r2.status_code == 200
    assert r2.json()["questionnaire"]["stats"]["text"] == 7
