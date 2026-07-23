export type JobStatus =
  | "new"
  | "matched"
  | "generated"
  | "applied"
  | "archived";

export type DocumentType = "resume" | "cover_letter";

export type ApplicationStatus =
  | "draft"
  | "sent"
  | "interview"
  | "offer"
  | "rejected"
  | "no_response";

export interface AuthUser {
  id: number;
  email: string;
  is_email_verified: boolean;
}

export interface AuthSession {
  token: string;
  session_id: string;
  user: AuthUser;
}

export interface Profile {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  master_resume_text: string | null;
  additional_information: string | null;
  additional_information_items: TextLinkItem[];
  profile_link_items: TextLinkItem[];
  skills: string[];
  experience: unknown[];
  education: unknown[];
  links: Record<string, string>;
  resume_template_id: number | null;
  cover_letter_template_id: number | null;
}

export interface TextLinkItem {
  text: string;
  link: string;
  kind?: "linkedin" | "website";
}

export interface AdminTableSummary {
  name: string;
  columns: string[];
  row_count: number;
}

export interface AdminTableData {
  table: string;
  columns: string[];
  primary_key: string[];
  foreign_keys: string[];
  rows: Record<string, unknown>[];
  page: number;
  page_size: number;
  total: number;
}

export interface IgnoredWord {
  id: number;
  profile_id: number;
  word: string;
  created_at: string;
}

export interface ResumeTemplate {
  id: number;
  name: string;
  document_type: "resume" | "cover_letter";
  content: string;
  created_at: string;
  updated_at: string;
}

export interface JobPosting {
  id: number;
  source: string;
  manual_source: string | null;
  external_id: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  employment_type: string | null;
  category: string | null;
  posted_at: string | null;
  match_score: number | null;
  match_notes: string | null;
  status: JobStatus;
  created_at: string;
}

export interface ManualJobInput {
  title: string;
  source: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string;
  employment_type: string | null;
}

export interface ManualJobImport {
  title: string | null;
  source: string | null;
  company: string | null;
  location: string | null;
  url: string;
  description: string | null;
  employment_type: string | null;
  duplicate_job: JobPosting | null;
}

export interface Document {
  id: number;
  job_id: number;
  type: DocumentType;
  content: string;
  rendered_html: string | null;
  file_path: string | null;
  approved: boolean;
  created_at: string;
}

export interface Application {
  id: number;
  job_id: number;
  resume_document_id: number | null;
  cover_letter_document_id: number | null;
  status: ApplicationStatus;
  date_sent: string | null;
  date_response: string | null;
  response_type: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  job: {
    id: number;
    title: string;
    company: string | null;
    location: string | null;
    url: string;
    source: string;
    match_score: number | null;
  };
}
