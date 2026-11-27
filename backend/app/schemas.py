from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class FirmField(BaseModel):
    id: str
    label: str
    type: Literal["text", "single", "multi"]
    options: list[dict[str, Any]] = Field(default_factory=list)


class QuestionOption(BaseModel):
    value: str
    label: str
    has_other_text: bool = False


class Question(BaseModel):
    id: str
    number: int
    section: str
    text: str
    type: Literal["single", "multi", "text"]
    options: list[QuestionOption] = Field(default_factory=list)
    allow_other: bool = False
    max_selections: int | None = None
    required: bool = False


class QuestionnaireOut(BaseModel):
    id: str
    title: str
    source_filename: str
    public_slug: str
    public_url: str
    created_at: datetime
    firm_fields: list[FirmField]
    questions: list[Question]
    stats: dict[str, Any]


class UploadResponse(BaseModel):
    questionnaire: QuestionnaireOut


class SuggestAllRequest(BaseModel):
    instruction: str = Field(min_length=1)
    respondent: dict[str, Any] = Field(default_factory=dict)
    current_answers: dict[str, Any] = Field(default_factory=dict)


class SuggestQuestionRequest(BaseModel):
    instruction: str = Field(min_length=1)
    respondent: dict[str, Any] = Field(default_factory=dict)
    current_answers: dict[str, Any] = Field(default_factory=dict)
    question_id: str


class Suggestion(BaseModel):
    question_id: str
    suggested_value: Any
    confidence: Literal["high", "medium", "low"] | None = None
    reason: str | None = None


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]
    model: str
    provider: str


class SubmitRequest(BaseModel):
    respondent: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    ai_instruction: str = ""
    accepted_ai: dict[str, Any] = Field(default_factory=dict)


class SubmitResponse(BaseModel):
    response_id: str
    status: str
    submitted_at: datetime
