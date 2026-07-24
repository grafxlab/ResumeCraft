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
  role: "user" | "admin";
  plan: "trial" | "essential" | "pro" | "power";
}

export interface AdminUser extends AuthUser {
  created_at: string;
  updated_at: string;
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
  signature_data_url: string | null;
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

export interface AIUsageData {
  days: number;
  pricing_configured: boolean;
  totals: {
    requests: number;
    failures: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number | null;
    average_duration_ms: number | null;
  };
  users: Array<{
    user_id: number | null;
    email: string | null;
    requests: number;
    failures: number;
    total_tokens: number;
    estimated_cost_usd: number | null;
    average_duration_ms: number | null;
  }>;
  operations: Array<{
    operation: string;
    requests: number;
    total_tokens: number;
    estimated_cost_usd: number | null;
    average_duration_ms: number | null;
  }>;
  recent: Array<{
    id: number;
    user_id: number | null;
    provider: string;
    model: string;
    operation: string;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    estimated_cost_usd: number | null;
    duration_ms: number | null;
    successful: boolean;
    error: string | null;
    created_at: string;
  }>;
}

export interface AIModelsData {
  active_provider: string;
  providers: Array<{
    id: "anthropic" | "openai";
    name: string;
    configured: boolean;
    selected_model: string;
    pricing_source: string;
    price_unit: string;
    models: Array<{
      id: string;
      name: string;
      input_price: number;
      cached_input_price?: number | null;
      output_price: number;
      note?: string;
    }>;
  }>;
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
  salary_period: string | null;
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
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  salary_period: string | null;
}

export interface ManualJobScore {
  match_score: number;
  match_notes: string;
}

export interface ManualJobImport {
  title: string | null;
  source: string | null;
  company: string | null;
  location: string | null;
  url: string;
  description: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  salary_period: string | null;
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
    match_notes: string | null;
    salary_min: number | null;
    salary_max: number | null;
    currency: string | null;
    salary_period: string | null;
  };
}
