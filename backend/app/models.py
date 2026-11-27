import uuid
import secrets
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Questionnaire(Base):
    __tablename__ = "questionnaires"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255))
    source_filename: Mapped[str] = mapped_column(String(255))
    public_slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    share_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, default=lambda: secrets.token_urlsafe(16))
    schema_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    responses: Mapped[list["Response"]] = relationship(back_populates="questionnaire", cascade="all, delete-orphan")


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    questionnaire_id: Mapped[str] = mapped_column(ForeignKey("questionnaires.id", ondelete="CASCADE"), index=True)
    respondent_json: Mapped[str] = mapped_column(Text, default="{}")
    answers_json: Mapped[str] = mapped_column(Text, default="{}")
    ai_instruction: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="submitted")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    questionnaire: Mapped[Questionnaire] = relationship(back_populates="responses")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    provider_sub: Mapped[str] = mapped_column(String(255), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True, default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    picture: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
