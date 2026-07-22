from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobStatus(str, enum.Enum):
    NEW = "new"
    MATCHED = "matched"
    GENERATED = "generated"
    APPLIED = "applied"
    ARCHIVED = "archived"


class DocumentType(str, enum.Enum):
    RESUME = "resume"
    COVER_LETTER = "cover_letter"


class ApplicationStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"
    NO_RESPONSE = "no_response"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    is_email_verified: Mapped[bool] = mapped_column(default=False)
    google_subject: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True
    )

    resume_templates: Mapped[list[ResumeTemplate]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ResumeTemplate(Base, TimestampMixin):
    __tablename__ = "resume_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    document_type: Mapped[str] = mapped_column(String(20), default="resume", index=True)
    content: Mapped[str] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="resume_templates")


class Profile(Base, TimestampMixin):
    """The user's master profile — the single source of truth for tailoring."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text)
    additional_information: Mapped[str | None] = mapped_column(Text)
    # Structured data used to build tailored documents.
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    experience: Mapped[list] = mapped_column(JSONB, default=list)
    education: Mapped[list] = mapped_column(JSONB, default=list)
    links: Mapped[dict] = mapped_column(JSONB, default=dict)
    resume_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("resume_templates.id", ondelete="SET NULL"), index=True
    )
    cover_letter_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("resume_templates.id", ondelete="SET NULL"), index=True
    )

    resume_template: Mapped[ResumeTemplate | None] = relationship(
        foreign_keys=[resume_template_id]
    )
    cover_letter_template: Mapped[ResumeTemplate | None] = relationship(
        foreign_keys=[cover_letter_template_id]
    )


class IgnoredWord(Base, TimestampMixin):
    __tablename__ = "ignored_words"
    __table_args__ = (
        UniqueConstraint("profile_id", "word", name="uq_ignored_word_profile"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    word: Mapped[str] = mapped_column(String(100))

    profile: Mapped[Profile] = relationship()


class JobPosting(Base, TimestampMixin):
    __tablename__ = "job_postings"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_source_external_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(50), index=True)
    external_id: Mapped[str] = mapped_column(String(255), index=True)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(500))
    company: Mapped[str | None] = mapped_column(String(300), index=True)
    location: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(10))
    employment_type: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(200))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    match_score: Mapped[float | None] = mapped_column(Float, index=True)
    match_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), default=JobStatus.NEW, index=True
    )

    documents: Mapped[list[Document]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    application: Mapped[Application | None] = relationship(
        back_populates="job", cascade="all, delete-orphan", uselist=False
    )


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("job_postings.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), index=True)
    content: Mapped[str] = mapped_column(Text)
    template_content: Mapped[str | None] = mapped_column(Text)
    rendered_html: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(Text)
    approved: Mapped[bool] = mapped_column(default=False)

    job: Mapped[JobPosting] = relationship(back_populates="documents")


class Application(Base, TimestampMixin):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("job_postings.id", ondelete="CASCADE"), unique=True, index=True
    )
    resume_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    cover_letter_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL")
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus), default=ApplicationStatus.DRAFT, index=True
    )
    date_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    date_response: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_type: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(default=False, index=True)

    job: Mapped[JobPosting] = relationship(back_populates="application")
