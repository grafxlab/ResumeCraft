import type {
  Application,
  ApplicationStatus,
  Document,
  JobPosting,
  Profile,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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

  // Documents
  generateResume: (job_id: number, profile_id: number, instructions?: string) =>
    request<Document>("/documents/resume", {
      method: "POST",
      body: JSON.stringify({ job_id, profile_id, instructions }),
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
    data: { content?: string; approved?: boolean },
  ) =>
    request<Document>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
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
