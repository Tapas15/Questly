from pathlib import Path

from backend.app.services.parser import parse_questionnaire


def test_parse_questionnaire_counts():
    path = Path(__file__).resolve().parents[2] / "CA_Accounting_Firm_Problem_Validation_Questionnaire.docx"
    data = parse_questionnaire(path)
    stats = data["stats"]
    assert stats["total_questions"] == 42
    assert stats["single"] == 19
    assert stats["multi"] == 16
    assert stats["text"] == 7
    assert len(data["questions"]) == 42
    assert any(f["id"] == "firm_practice_name" for f in data["firm_fields"])
