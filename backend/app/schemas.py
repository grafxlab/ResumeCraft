from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ApplicationStatus, DocumentType, JobStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Authentication ───────────────────────────────────────
class SignUpRequest(BaseModel):
    email: str
    password: str


class ResendConfirmationRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthUserOut(BaseModel):
    id: int
    email: str
    is_email_verified: bool
    role: str
    plan: str


class AdminUserOut(ORMModel):
    id: int
    email: str
    is_email_verified: bool
    role: str
    plan: str
    created_at: datetime
    updated_at: datetime


class AdminUserUpdate(BaseModel):
    role: str | None = None
    plan: str | None = None


class AuthSessionOut(BaseModel):
    token: str
    session_id: str
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
    master_resume_text: str | None = None
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


class ProfileAdditionalInformationUpdate(BaseModel):
    additional_information_items: list[dict[str, str]]


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


class ManualJobUpsert(BaseModel):
    title: str
    source: str | None = None
    company: str | None = None
    location: str | None = None
    url: str | None = None
    description: str
    employment_type: str | None = None
    salary_min: float | None = Field(default=None, ge=0)
    salary_max: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=10)
    salary_period: Literal["hour", "day", "week", "month", "year"] | None = None

    @model_validator(mode="after")
    def validate_salary_range(self) -> ManualJobUpsert:
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("Salary minimum cannot exceed salary maximum")
        return self


class ManualJobImportRequest(BaseModel):
    url: str


class JobPostingOut(ORMModel):
    id: int
    source: str
    manual_source: str | None
    external_id: str
    url: str
    title: str
    company: str | None
    location: str | None
    description: str | None
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    salary_period: str | None
    employment_type: str | None
    category: str | None
    posted_at: datetime | None
    match_score: float | None
    match_notes: str | None
    status: JobStatus
    created_at: datetime


class ManualJobImportOut(BaseModel):
    title: str | None = None
    source: str | None = None
    company: str | None = None
    location: str | None = None
    url: str
    description: str | None = None
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = None
    salary_period: Literal["hour", "day", "week", "month", "year"] | None = None
    duplicate_job: JobPostingOut | None = None


class ManualJobScoreOut(BaseModel):
    match_score: float
    match_notes: str


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
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    salary_period: str | None


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
