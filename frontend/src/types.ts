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

export interface Profile {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: unknown[];
  education: unknown[];
  links: Record<string, string>;
}

export interface JobPosting {
  id: number;
  source: string;
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

export interface Document {
  id: number;
  job_id: number;
  type: DocumentType;
  content: string;
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
