import type {
  Application,
  AdminTableData,
  AdminTableSummary,
  AdminUser,
  AIModelsData,
  AIUsageData,
  ApplicationStatus,
  AuthSession,
  AuthUser,
  Document,
  IgnoredWord,
  JobPosting,
  ManualJobImport,
  ManualJobInput,
  ManualJobScore,
  Profile,
  ResumeTemplate,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/$/, "");

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
  listAdminUsers: () => request<AdminUser[]>("/admin/users"),
  updateAdminUser: (id: number, data: Pick<AdminUser, "role" | "plan">) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  listAdminTables: () => request<AdminTableSummary[]>("/admin/tables"),
  getDatabaseInfo: () =>
    request<{ host: string; port: number | null; database: string | null }>("/admin/database-info"),
  getAIUsage: (days: number) => request<AIUsageData>(`/admin/ai-usage?days=${days}`),
  getAIModels: () => request<AIModelsData>("/admin/ai-models"),
  selectAIModel: (provider: "anthropic" | "openai", model: string) =>
    request<{ active_provider: string; selected_model: string }>("/admin/ai-models/selection", {
      method: "PUT",
      body: JSON.stringify({ provider, model }),
    }),
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
  resendConfirmation: (email: string) =>
    request<{ message: string }>("/auth/resend-confirmation", {
      method: "POST",
      body: JSON.stringify({ email }),
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
  updateAdditionalInformation: (id: number, items: Profile["additional_information_items"]) =>
    request<Profile>(`/profiles/${id}/additional-information`, {
      method: "PATCH",
      body: JSON.stringify({ additional_information_items: items }),
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
  uploadSignature: async (id: number, file: File): Promise<Profile> => {
    const token = localStorage.getItem("auth.token");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${BASE}/profiles/${id}/signature`, {
      method: "PUT",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? "Unable to upload signature");
    }
    return response.json() as Promise<Profile>;
  },
  deleteSignature: (id: number) =>
    request<Profile>(`/profiles/${id}/signature`, { method: "DELETE" }),
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
  listManualJobs: (profileId?: number) =>
    request<JobPosting[]>(`/jobs/manual${profileId ? `?profile_id=${profileId}` : ""}`),
  createManualJob: (profileId: number, data: ManualJobInput) =>
    request<JobPosting>(`/jobs/manual?profile_id=${profileId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  importManualJob: (url: string) =>
    request<ManualJobImport>("/jobs/manual/import", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  previewManualJobScore: (profileId: number, data: ManualJobInput) =>
    request<ManualJobScore>(`/jobs/manual/preview-score?profile_id=${profileId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateManualJob: (jobId: number, profileId: number, data: ManualJobInput) =>
    request<JobPosting>(`/jobs/${jobId}/manual?profile_id=${profileId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateJobStatus: (jobId: number, status: JobPosting["status"]) =>
    request<JobPosting>(`/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteManualJob: async (jobId: number): Promise<void> => {
    const response = await fetch(`${BASE}/jobs/${jobId}/manual`, {
      method: "DELETE",
      headers: {
        ...(localStorage.getItem("auth.token")
          ? { Authorization: `Bearer ${localStorage.getItem("auth.token")}` }
          : {}),
      },
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Unable to delete manual job (${response.status})`);
    }
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
  replaceResumeTemplate: (
    id: number,
    name: string,
    content: string,
    document_type: "resume" | "cover_letter",
  ) =>
    request<ResumeTemplate>(`/resume-templates/${id}`, {
      method: "PUT",
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
  downloadDocumentPdf: async (
    id: number,
    profileId?: number,
  ): Promise<{ blob: Blob; filename: string }> => {
    const query = profileId != null ? `?profile_id=${profileId}` : "";
    const resp = await fetch(`${BASE}/documents/${id}/pdf${query}`);
    if (!resp.ok) {
      let detail = `PDF generation failed (${resp.status})`;
      try {
        const body = await resp.json();
        detail = body.detail ?? detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    const disposition = resp.headers.get("Content-Disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/i)?.[1]
      ?? `document_${id}.pdf`;
    return { blob: await resp.blob(), filename };
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
