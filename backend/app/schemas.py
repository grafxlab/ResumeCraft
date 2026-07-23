from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import ApplicationStatus, DocumentType, JobStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Authentication ───────────────────────────────────────
class SignUpRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthUserOut(BaseModel):
    id: int
    email: str
    is_email_verified: bool


class AuthSessionOut(BaseModel):
    token: str
    user: AuthUserOut


class MessageOut(BaseModel):
    message: str


class ResumeTemplateCreate(BaseModel):
    name: str
    content: str
    document_type: str = "resume"


class ResumeTemplateOut(ORMModel):
    id: int
    name: str
    document_type: str
    content: str
    created_at: datetime
    updated_at: datetime


# ── Profile ──────────────────────────────────────────────
class ProfileBase(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    additional_information: str | None = None
    additional_information_items: list[dict[str, str]] = []
    profile_link_items: list[dict[str, str]] = []
    skills: list = []
    experience: list = []
    education: list = []
    links: dict = {}
    resume_template_id: int | None = None
    cover_letter_template_id: int | None = None


class ProfileCreate(ProfileBase):
    pass


class ProfileTemplateUpdate(BaseModel):
    template_id: int | None = None
    document_type: str


class ProfileOut(ORMModel, ProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime


class IgnoredWordCreate(BaseModel):
    word: str


class IgnoredWordOut(ORMModel):
    id: int
    profile_id: int
    word: str
    created_at: datetime


# ── Job postings ─────────────────────────────────────────
class JobSearchRequest(BaseModel):
    query: str
    location: str | None = None
    results_per_source: int = 20
    sources: list[str] = ["adzuna", "jsearch"]


class JobPostingOut(ORMModel):
    id: int
    source: str
    external_id: str
    url: str
    title: str
    company: str | None
    location: str | None
    description: str | None
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    employment_type: str | None
    category: str | None
    posted_at: datetime | None
    match_score: float | None
    match_notes: str | None
    status: JobStatus
    created_at: datetime


class JobStatusUpdate(BaseModel):
    status: JobStatus


# ── Documents ────────────────────────────────────────────
class GenerateRequest(BaseModel):
    job_id: int
    profile_id: int
    resume_template_id: int | None = None
    instructions: str | None = None


class RegenerateRequest(BaseModel):
    profile_id: int
    resume_template_id: int | None = None
    instructions: str | None = None


class DocumentUpdate(BaseModel):
    content: str | None = None
    approved: bool | None = None
    profile_id: int | None = None


class DocumentPreviewRequest(BaseModel):
    profile_id: int
    content: str | None = None


class DocumentPreviewOut(BaseModel):
    rendered_html: str


class DocumentOut(ORMModel):
    id: int
    job_id: int
    type: DocumentType
    content: str
    rendered_html: str | None
    file_path: str | None
    approved: bool
    created_at: datetime


# ── Applications ─────────────────────────────────────────
class ApplicationCreate(BaseModel):
    job_id: int
    resume_document_id: int | None = None
    cover_letter_document_id: int | None = None
    status: ApplicationStatus = ApplicationStatus.DRAFT
    date_sent: datetime | None = None
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    status: ApplicationStatus | None = None
    date_sent: datetime | None = None
    date_response: datetime | None = None
    response_type: str | None = None
    notes: str | None = None
    archived: bool | None = None


class ApplicationOut(ORMModel):
    id: int
    job_id: int
    resume_document_id: int | None
    cover_letter_document_id: int | None
    status: ApplicationStatus
    date_sent: datetime | None
    date_response: datetime | None
    response_type: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ApplicationJobInfo(BaseModel):
    id: int
    title: str
    company: str | None
    location: str | None
    url: str
    source: str
    match_score: float | None


class ApplicationDetailOut(BaseModel):
    id: int
    job_id: int
    status: ApplicationStatus
    date_sent: datetime | None
    date_response: datetime | None
    response_type: str | None
    notes: str | None
    archived: bool
    created_at: datetime
    updated_at: datetime
    job: ApplicationJobInfo
    resume_document_id: int | None
    cover_letter_document_id: int | None
