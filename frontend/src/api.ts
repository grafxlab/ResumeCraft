import type {
  Application,
  AdminTableData,
  AdminTableSummary,
  ApplicationStatus,
  AuthSession,
  AuthUser,
  Document,
  IgnoredWord,
  JobPosting,
  Profile,
  ResumeTemplate,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth.token");
  const resp = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  // Administration
  listAdminTables: () => request<AdminTableSummary[]>("/admin/tables"),
  getAdminTable: (
    name: string,
    params: {
      page: number;
      page_size: number;
      search?: string;
      sort_by?: string;
      sort_dir: "asc" | "desc";
    },
  ) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value != null && value !== "") as [string, string][],
    );
    return request<AdminTableData>(`/admin/tables/${encodeURIComponent(name)}?${query}`);
  },
  updateAdminRow: (table: string, id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/admin/tables/${encodeURIComponent(table)}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAdminRow: async (table: string, id: number): Promise<void> => {
    const response = await fetch(`${BASE}/admin/tables/${encodeURIComponent(table)}/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) throw new Error(`Delete failed (${response.status})`);
  },

  // Authentication
  signUp: (email: string, password: string) =>
    request<{ message: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  confirmEmail: (token: string) => request<AuthSession>(`/auth/confirm?token=${encodeURIComponent(token)}`),
  login: (email: string, password: string) =>
    request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  currentUser: () => request<AuthUser>("/auth/me"),
  signOut: async (): Promise<void> => {
    const resp = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: {
        ...(localStorage.getItem("auth.token")
          ? { Authorization: `Bearer ${localStorage.getItem("auth.token")}` }
          : {}),
      },
    });
    if (!resp.ok && resp.status !== 204) throw new Error(`Sign out failed (${resp.status})`);
  },
  googleLoginUrl: () => `${BASE}/auth/google/login`,

  // Profiles
  listProfiles: () => request<Profile[]>("/profiles"),
  createProfile: (data: Partial<Profile>) =>
    request<Profile>("/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProfile: (id: number, data: Partial<Profile>) =>
    request<Profile>(`/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateProfileTemplate: (
    id: number,
    template_id: number | null,
    document_type: "resume" | "cover_letter",
  ) =>
    request<Profile>(`/profiles/${id}/resume-template`, {
      method: "PATCH",
      body: JSON.stringify({ template_id, document_type }),
    }),
  listIgnoredWords: (profileId: number) =>
    request<IgnoredWord[]>(`/profiles/${profileId}/ignored-words`),
  ignoreWord: (profileId: number, word: string) =>
    request<IgnoredWord>(`/profiles/${profileId}/ignored-words`, {
      method: "POST",
      body: JSON.stringify({ word }),
    }),
  unignoreWord: async (profileId: number, word: string): Promise<void> => {
    const resp = await fetch(
      `${BASE}/profiles/${profileId}/ignored-words/${encodeURIComponent(word)}`,
      { method: "DELETE" },
    );
    if (!resp.ok && resp.status !== 204) {
      throw new Error(`Unable to un-ignore word (${resp.status})`);
    }
  },
  parseResume: async (file: File): Promise<Partial<Profile>> => {
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch(`${BASE}/profiles/parse-resume`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      let detail = resp.statusText;
      try {
        detail = (await resp.json()).detail ?? detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return resp.json() as Promise<Partial<Profile>>;
  },

  // Jobs
  sources: () => request<{ available: string[] }>("/jobs/sources"),
  searchJobs: (
    body: {
      query: string;
      location?: string;
      results_per_source?: number;
      sources?: string[];
    },
    profileId?: number,
  ) =>
    request<JobPosting[]>(
      `/jobs/search${profileId ? `?profile_id=${profileId}` : ""}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listJobs: (params?: { status?: string; min_score?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.min_score != null) q.set("min_score", String(params.min_score));
    const qs = q.toString();
    return request<JobPosting[]>(`/jobs${qs ? `?${qs}` : ""}`);
  },
  rescoreJob: (jobId: number, profileId: number) =>
    request<JobPosting>(`/jobs/${jobId}/rescore?profile_id=${profileId}`, {
      method: "POST",
    }),

  // Resume templates
  listResumeTemplates: (documentType?: "resume" | "cover_letter") =>
    request<ResumeTemplate[]>(
      `/resume-templates${documentType ? `?document_type=${documentType}` : ""}`,
    ),
  createResumeTemplate: (
    name: string,
    content: string,
    document_type: "resume" | "cover_letter",
  ) =>
    request<ResumeTemplate>("/resume-templates", {
      method: "POST",
      body: JSON.stringify({ name, content, document_type }),
    }),
  deleteResumeTemplate: async (id: number): Promise<void> => {
    const resp = await fetch(`${BASE}/resume-templates/${id}`, {
      method: "DELETE",
      headers: {
        ...(localStorage.getItem("auth.token")
          ? { Authorization: `Bearer ${localStorage.getItem("auth.token")}` }
          : {}),
      },
    });
    if (!resp.ok && resp.status !== 204) {
      throw new Error(`Unable to delete template (${resp.status})`);
    }
  },

  // Documents
  generateResume: (
    job_id: number,
    profile_id: number,
    resume_template_id?: number,
    instructions?: string,
  ) =>
    request<Document>("/documents/resume", {
      method: "POST",
      body: JSON.stringify({ job_id, profile_id, resume_template_id, instructions }),
    }),
  generateCoverLetter: (
    job_id: number,
    profile_id: number,
    instructions?: string,
  ) =>
    request<Document>("/documents/cover-letter", {
      method: "POST",
      body: JSON.stringify({ job_id, profile_id, instructions }),
    }),
  updateDocument: (
    id: number,
    data: { content?: string; approved?: boolean; profile_id?: number },
  ) =>
    request<Document>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  previewDocument: (id: number, profile_id: number, content?: string) =>
    request<{ rendered_html: string }>(`/documents/${id}/preview`, {
      method: "POST",
      body: JSON.stringify({ profile_id, content }),
    }),
  regenerateDocument: (
    id: number,
    profile_id: number,
    instructions?: string,
  ) =>
    request<Document>(`/documents/${id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ profile_id, instructions }),
    }),
  listDocuments: (jobId?: number) =>
    request<Document[]>(`/documents${jobId ? `?job_id=${jobId}` : ""}`),
  getDocument: (id: number) => request<Document>(`/documents/${id}`),
  downloadDocumentPdf: async (id: number): Promise<Blob> => {
    const resp = await fetch(`${BASE}/documents/${id}/pdf`);
    if (!resp.ok) {
      throw new Error(`PDF generation failed (${resp.status})`);
    }
    return resp.blob();
  },

  // Applications
  listApplications: () => request<Application[]>("/applications"),
  createApplication: (data: {
    job_id: number;
    resume_document_id?: number;
    cover_letter_document_id?: number;
    status?: ApplicationStatus;
    notes?: string;
  }) =>
    request<Application>("/applications", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateApplication: (id: number, data: Partial<Application>) =>
    request<Application>(`/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteApplication: async (id: number): Promise<void> => {
    const resp = await fetch(`${BASE}/applications/${id}`, {
      method: "DELETE",
    });
    if (!resp.ok && resp.status !== 204) {
      throw new Error(`Delete failed (${resp.status})`);
    }
  },
};
