import { useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api";
import { inferJobSource } from "../jobSource";
import { matchStyle } from "../match";
import { rankJobs, resultsPageForJob } from "../searchResults";
import type {
  ApplicationStatus,
  Document,
  JobPosting,
  ManualJobInput,
  Profile,
} from "../types";
import DocumentEditor from "./DocumentEditor";
import Spinner from "./Spinner";

interface Props {
  profile: Profile | null;
  onProfileUpdated: (profile: Profile) => void;
  onOpenApplication: (jobId: number) => void;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const emptyManualJob = (): ManualJobInput => ({
  title: "",
  source: null,
  company: null,
  location: null,
  url: null,
  description: "",
  employment_type: null,
});

function normalizedJobSource(url: string, source: string | null): string | null {
  const inferred = inferJobSource(url);
  if (inferred) return inferred;
  if (!source || source.includes("://") || source.includes("/")) return null;
  return source;
}

function savedResultsPageSize(): number | "all" {
  const saved = localStorage.getItem("search.resultsPageSize");
  return saved === "all" || [5, 10, 25, 50].includes(Number(saved))
    ? saved === "all" ? "all" : Number(saved)
    : 5;
}

function matchKeywords(notes: string | null): {
  matched: string;
  unmatched: string;
} | null {
  const prefix = "Matched: ";
  const separator = ". Missing: ";
  if (!notes?.startsWith(prefix)) return null;
  const separatorIndex = notes.indexOf(separator, prefix.length);
  if (separatorIndex === -1) return null;
  return {
    matched: notes.slice(prefix.length, separatorIndex),
    unmatched: notes.slice(separatorIndex + separator.length).replace(/\.$/, ""),
  };
}

export default function SearchTab({
  profile,
  onProfileUpdated,
  onOpenApplication,
}: Props) {
  const [query, setQuery] = useState(
    () => localStorage.getItem("search.query") ?? "",
  );
  const [location, setLocation] = useState(
    () => localStorage.getItem("search.location") ?? "",
  );
  const [sources, setSources] = useState<string[]>(["adzuna", "jsearch"]);
  const [available, setAvailable] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [resultsPageSize, setResultsPageSize] = useState<number | "all">(savedResultsPageSize);
  const [resultsPage, setResultsPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<{
    jobId: number;
    type: "resume" | "cover" | "track";
  } | null>(null);
  const [docs, setDocs] = useState<Record<number, Document[]>>({});
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [trackedJobIds, setTrackedJobIds] = useState<Set<number>>(new Set());
  const [trackedStatuses, setTrackedStatuses] = useState<
    Record<number, ApplicationStatus>
  >({});
  const [ignoredWords, setIgnoredWords] = useState<Set<string>>(new Set());
  const [selectedUnmatchedWord, setSelectedUnmatchedWord] = useState<{
    jobId: number;
    word: string;
  } | null>(null);
  const [ignoringWord, setIgnoringWord] = useState(false);
  const [addingWord, setAddingWord] = useState(false);
  const [viewingDocumentId, setViewingDocumentId] = useState<number | null>(null);
  const [previewOnOpen, setPreviewOnOpen] = useState(false);
  const [manualJobEditor, setManualJobEditor] = useState<{
    jobId: number | null;
    values: ManualJobInput;
    sourceWasInferred: boolean;
    fieldsExpanded: boolean;
    duplicateJob: JobPosting | null;
  } | null>(null);
  const [savingManualJob, setSavingManualJob] = useState(false);
  const [importingManualJob, setImportingManualJob] = useState(false);
  const [manualJobAction, setManualJobAction] = useState<number | null>(null);
  const [newlySavedJobId, setNewlySavedJobId] = useState<number | null>(null);

  const sourceNames = sources.map((source) =>
    source === "adzuna" ? "Adzuna" : source === "jsearch" ? "JSearch" : source,
  );
  const editingDocument = viewingDocumentId == null
    ? null
    : Object.values(docs).flat().find((doc) => doc.id === viewingDocumentId) ?? null;
  const totalResultPages = resultsPageSize === "all"
    ? 1
    : Math.max(1, Math.ceil(jobs.length / resultsPageSize));
  const displayedJobs = resultsPageSize === "all"
    ? jobs
    : jobs.slice((resultsPage - 1) * resultsPageSize, resultsPage * resultsPageSize);
  const newlySavedJobIsDisplayed = newlySavedJobId != null
    && displayedJobs.some((job) => job.id === newlySavedJobId);
  const resultsPagination = jobs.length > 0 && (
    <div className="search-results-pagination">
      <label>
        Display
        <select
          value={resultsPageSize}
          onChange={(event) => {
            setResultsPageSize(event.target.value === "all" ? "all" : Number(event.target.value));
            setResultsPage(1);
          }}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value="all">All</option>
        </select>
        jobs
      </label>
      <div className="search-results-pages">
        <span className="meta">Page {resultsPage} of {totalResultPages}</span>
        <button className="icon-btn" disabled={resultsPage <= 1} onClick={() => setResultsPage((page) => page - 1)} aria-label="Previous results page" title="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
        <button className="icon-btn" disabled={resultsPage >= totalResultPages} onClick={() => setResultsPage((page) => page + 1)} aria-label="Next results page" title="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );

  useEffect(() => {
    localStorage.setItem("search.query", query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem("search.location", location);
  }, [location]);

  useEffect(() => {
    localStorage.setItem("search.resultsPageSize", String(resultsPageSize));
  }, [resultsPageSize]);

  useEffect(() => {
    setResultsPage((current) => Math.min(current, totalResultPages));
  }, [totalResultPages]);

  useEffect(() => {
    if (newlySavedJobId == null || !newlySavedJobIsDisplayed) return;
    const jobId = newlySavedJobId;
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(`job-${jobId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    const timeout = window.setTimeout(() => {
      setNewlySavedJobId((current) => current === jobId ? null : current);
    }, 3200);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [newlySavedJobId, newlySavedJobIsDisplayed]);

  // Restore cached results (valid for 24h). Results only refresh on Search.
  useEffect(() => {
    const raw = localStorage.getItem("search.results");
    if (!raw) return;
    try {
      const cache = JSON.parse(raw) as { ts: number; jobs: JobPosting[] };
      if (Date.now() - cache.ts < CACHE_TTL_MS) {
        setJobs(cache.jobs);
        setCachedAt(cache.ts);
      } else {
        localStorage.removeItem("search.results");
      }
    } catch {
      localStorage.removeItem("search.results");
    }
  }, []);

  useEffect(() => {
    if (!profile) {
      setIgnoredWords(new Set());
      return;
    }
    api
      .listIgnoredWords(profile.id)
      .then((words) => setIgnoredWords(new Set(words.map((item) => item.word))))
      .catch(() => setIgnoredWords(new Set()));
  }, [profile]);

  useEffect(() => {
    api
      .listManualJobs(profile?.id)
      .then((manualJobs) => {
        setJobs((current) => rankJobs([
          ...current.filter((job) => job.source !== "manual"),
          ...manualJobs,
        ]));
      })
      .catch(() => {
        /* Manual jobs remain available on the next successful load or search. */
      });
  }, [profile?.id]);

  useEffect(() => {
    api
      .sources()
      .then((r) => setAvailable(r.available))
      .catch(() => setAvailable([]));
  }, []);

  useEffect(() => {
    if (jobs.length === 0) return;
    let active = true;
    Promise.allSettled(
      jobs.map(async (job) => [job.id, await api.listDocuments(job.id)] as const),
    )
      .then((results) => {
        const documentsByJob = results
          .filter((result): result is PromiseFulfilledResult<readonly [number, Document[]]> =>
            result.status === "fulfilled",
          )
          .map((result) => result.value);
        if (active) setDocs((current) => ({ ...current, ...Object.fromEntries(documentsByJob) }));
      })
    return () => {
      active = false;
    };
  }, [jobs]);

  // Load which jobs are already tracked so their buttons show as "Tracked".
  useEffect(() => {
    api
      .listApplications()
      .then((apps) => {
        setTrackedJobIds(new Set(apps.map((app) => app.job_id)));
        setTrackedStatuses(
          Object.fromEntries(apps.map((app) => [app.job_id, app.status])),
        );
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const search = async () => {
    setError(null);
    setLoading(true);
    try {
      const results = await api.searchJobs(
        { query, location: location || undefined, sources },
        profile?.id,
      );
      setJobs(results);
      setResultsPage(1);
      const ts = Date.now();
      setCachedAt(ts);
      localStorage.setItem(
        "search.results",
        JSON.stringify({ ts, jobs: results }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (name: string) => {
    setSources((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const generate = async (job: JobPosting, kind: "resume" | "cover") => {
    if (!profile) {
      setError("Create a profile first.");
      return;
    }
    setBusyAction({ jobId: job.id, type: kind });
    setError(null);
    try {
      const doc =
        kind === "resume"
          ? await api.generateResume(job.id, profile.id)
          : await api.generateCoverLetter(job.id, profile.id);
      setDocs((prev) => ({
        ...prev,
        [job.id]: [...(prev[job.id] ?? []), doc],
      }));
      setPreviewOnOpen(false);
      setViewingDocumentId(doc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const track = async (job: JobPosting) => {
    setBusyAction({ jobId: job.id, type: "track" });
    setError(null);
    try {
      const jobDocs = docs[job.id] ?? [];
      const resume = jobDocs.find((d) => d.type === "resume");
      const cover = jobDocs.find((d) => d.type === "cover_letter");
      await api.createApplication({
        job_id: job.id,
        resume_document_id: resume?.id,
        cover_letter_document_id: cover?.id,
        status: "draft",
      });
      setTrackedJobIds((prev) => new Set(prev).add(job.id));
      setTrackedStatuses((prev) => ({ ...prev, [job.id]: "draft" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const dismiss = (jobId: number) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== jobId);
      // Keep the cached results in sync so it stays dismissed on reload.
      if (cachedAt) {
        localStorage.setItem(
          "search.results",
          JSON.stringify({ ts: cachedAt, jobs: next }),
        );
      }
      return next;
    });
  };

  const updateVisibleJobs = (update: (current: JobPosting[]) => JobPosting[]) => {
    setJobs((current) => {
      const next = rankJobs(update(current));
      if (cachedAt) {
        localStorage.setItem(
          "search.results",
          JSON.stringify({ ts: cachedAt, jobs: next }),
        );
      }
      return next;
    });
  };

  const openManualJobEditor = (job?: JobPosting) => {
    setError(null);
    const source = job
      ? normalizedJobSource(job.url, job.manual_source)
      : null;
    setManualJobEditor({
      jobId: job?.id ?? null,
      values: job ? {
        title: job.title,
        source,
        company: job.company,
        location: job.location,
        url: job.url || null,
        description: job.description ?? "",
        employment_type: job.employment_type,
      } : emptyManualJob(),
      sourceWasInferred: Boolean(
        job && source && inferJobSource(job.url) === source,
      ),
      fieldsExpanded: Boolean(job),
      duplicateJob: null,
    });
  };

  const saveManualJob = async () => {
    if (!profile || !manualJobEditor) return;
    const isNewJob = manualJobEditor.jobId == null;
    setSavingManualJob(true);
    setError(null);
    try {
      const saved = manualJobEditor.jobId == null
        ? await api.createManualJob(profile.id, manualJobEditor.values)
        : await api.updateManualJob(
            manualJobEditor.jobId,
            profile.id,
            manualJobEditor.values,
          );
      const updatedJobs = rankJobs([
        ...jobs.filter((job) => job.id !== saved.id),
        saved,
      ]);
      setJobs(updatedJobs);
      if (cachedAt) {
        localStorage.setItem(
          "search.results",
          JSON.stringify({ ts: cachedAt, jobs: updatedJobs }),
        );
      }
      setResultsPage(resultsPageForJob(updatedJobs, saved.id, resultsPageSize));
      if (isNewJob) setNewlySavedJobId(saved.id);
      setManualJobEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingManualJob(false);
    }
  };

  const updateManualJobUrl = (url: string) => {
    setManualJobEditor((current) => {
      if (!current) return null;
      const inferredSource = inferJobSource(url);
      const updateSource = !current.values.source || current.sourceWasInferred;
      return {
        ...current,
        duplicateJob: null,
        sourceWasInferred: updateSource && inferredSource != null,
        values: {
          ...current.values,
          url: url || null,
          source: updateSource ? inferredSource : current.values.source,
        },
      };
    });
  };

  const importManualJobUrl = async (url: string) => {
    if (!url.trim()) return;
    setImportingManualJob(true);
    setError(null);
    setManualJobEditor((current) => current ? { ...current, duplicateJob: null } : null);
    try {
      const imported = await api.importManualJob(url);
      setManualJobEditor((current) => {
        if (!current) return null;
        if (imported.duplicate_job) {
          return {
            ...current,
            duplicateJob: imported.duplicate_job,
            fieldsExpanded: false,
            values: { ...current.values, url: imported.duplicate_job.url },
          };
        }
        const inferredSource = normalizedJobSource(imported.url, imported.source);
        const updateSource = !current.values.source || current.sourceWasInferred;
        return {
          ...current,
          sourceWasInferred: updateSource && inferredSource != null,
          fieldsExpanded: true,
          duplicateJob: null,
          values: {
            title: imported.title ?? current.values.title,
            source: updateSource ? inferredSource : current.values.source,
            company: imported.company ?? current.values.company,
            location: imported.location ?? current.values.location,
            url: imported.url,
            description: imported.description ?? current.values.description,
            employment_type: imported.employment_type ?? current.values.employment_type,
          },
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setManualJobEditor((current) => current ? {
        ...current,
        fieldsExpanded: true,
      } : null);
    } finally {
      setImportingManualJob(false);
    }
  };

  const viewExistingManualJob = (job: JobPosting) => {
    const updatedJobs = rankJobs([
      ...jobs.filter((current) => current.id !== job.id),
      job,
    ]);
    setJobs(updatedJobs);
    if (cachedAt) {
      localStorage.setItem(
        "search.results",
        JSON.stringify({ ts: cachedAt, jobs: updatedJobs }),
      );
    }
    setResultsPage(resultsPageForJob(updatedJobs, job.id, resultsPageSize));
    setNewlySavedJobId(job.id);
    setManualJobEditor(null);
  };

  const archiveManualJob = async (job: JobPosting) => {
    if (!window.confirm(`Archive "${job.title}"?`)) return;
    setManualJobAction(job.id);
    setError(null);
    try {
      await api.updateJobStatus(job.id, "archived");
      updateVisibleJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setManualJobAction(null);
    }
  };

  const deleteManualJob = async (job: JobPosting) => {
    if (!window.confirm(`Permanently delete "${job.title}"? This cannot be undone.`)) return;
    setManualJobAction(job.id);
    setError(null);
    try {
      await api.deleteManualJob(job.id);
      updateVisibleJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setManualJobAction(null);
    }
  };

  const ignoreSelectedWord = async () => {
    if (!profile || !selectedUnmatchedWord) return;
    setIgnoringWord(true);
    try {
      const ignored = await api.ignoreWord(profile.id, selectedUnmatchedWord.word);
      const rescored = await api.rescoreJob(
        selectedUnmatchedWord.jobId,
        profile.id,
      );
      setIgnoredWords((current) => new Set(current).add(ignored.word));
      setJobs((current) => {
        const updated = current.map((job) =>
          job.id === rescored.id ? rescored : job,
        );
        if (cachedAt) {
          localStorage.setItem(
            "search.results",
            JSON.stringify({ ts: cachedAt, jobs: updated }),
          );
        }
        return updated;
      });
      setSelectedUnmatchedWord(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIgnoringWord(false);
    }
  };

  const addSelectedWordToResume = async () => {
    if (!profile || !selectedUnmatchedWord) return;
    setAddingWord(true);
    try {
      const word = selectedUnmatchedWord.word;
      const skills = profile.skills.some(
        (skill) => skill.toLowerCase() === word.toLowerCase(),
      )
        ? profile.skills
        : [...profile.skills, word];
      const updatedProfile = await api.updateProfile(profile.id, {
        ...profile,
        skills,
      });
      const rescored = await api.rescoreJob(
        selectedUnmatchedWord.jobId,
        updatedProfile.id,
      );
      onProfileUpdated(updatedProfile);
      setJobs((current) => {
        const updated = current.map((job) =>
          job.id === rescored.id ? rescored : job,
        );
        if (cachedAt) {
          localStorage.setItem(
            "search.results",
            JSON.stringify({ ts: cachedAt, jobs: updated }),
          );
        }
        return updated;
      });
      setSelectedUnmatchedWord(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingWord(false);
    }
  };

  const toggleDocumentPreview = (documentId: number) => {
    if (viewingDocumentId === documentId) {
      setPreviewOnOpen(false);
      setViewingDocumentId(null);
      return;
    }
    setPreviewOnOpen(true);
    setViewingDocumentId(documentId);
  };

  return (
    <div>
      {manualJobEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !savingManualJob && !importingManualJob && setManualJobEditor(null)}
        >
          <div
            className="modal manual-job-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-job-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="manual-job-title">
                {manualJobEditor.jobId == null ? "Add Job" : "Edit Job"}
              </strong>
            </div>
            <div className="manual-job-fields">
              <div className="manual-job-wide">
                <label htmlFor="manual-job-url">Posting URL</label>
                <div className="manual-job-url-row">
                  <input
                    id="manual-job-url"
                    type="url"
                    autoFocus
                    placeholder="Paste a LinkedIn, Indeed, Dice, or other job URL"
                    value={manualJobEditor.values.url ?? ""}
                    onChange={(event) => updateManualJobUrl(event.target.value)}
                    onPaste={(event) => {
                      const pastedUrl = event.clipboardData.getData("text").trim();
                      if (!pastedUrl) return;
                      event.preventDefault();
                      updateManualJobUrl(pastedUrl);
                      void importManualJobUrl(pastedUrl);
                    }}
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={importingManualJob || !manualJobEditor.values.url?.trim()}
                    onClick={() => void importManualJobUrl(manualJobEditor.values.url ?? "")}
                  >
                    {importingManualJob ? <Spinner label="Reading..." /> : "Fill with AI"}
                  </button>
                </div>
              </div>
              {manualJobEditor.duplicateJob && (
                <div className="manual-job-duplicate manual-job-wide" role="status">
                  <div>
                    <strong>It looks like you have already added this job.</strong>
                    <p className="meta">
                      {manualJobEditor.duplicateJob.title} at {manualJobEditor.duplicateJob.company ?? "Unknown company"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => viewExistingManualJob(manualJobEditor.duplicateJob!)}
                  >
                    View existing job
                  </button>
                </div>
              )}
              {manualJobEditor.fieldsExpanded && (
                <>
                  <div>
                    <label htmlFor="manual-job-role">Job title</label>
                    <input
                      id="manual-job-role"
                      value={manualJobEditor.values.title}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        values: { ...current.values, title: event.target.value },
                      }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-job-company">Company</label>
                    <input
                      id="manual-job-company"
                      value={manualJobEditor.values.company ?? ""}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        values: { ...current.values, company: event.target.value || null },
                      }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-job-source">Source</label>
                    <input
                      id="manual-job-source"
                      placeholder="LinkedIn, Indeed, Dice, company website..."
                      value={manualJobEditor.values.source ?? ""}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        sourceWasInferred: false,
                        values: { ...current.values, source: event.target.value || null },
                      }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-job-location">Location</label>
                    <input
                      id="manual-job-location"
                      value={manualJobEditor.values.location ?? ""}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        values: { ...current.values, location: event.target.value || null },
                      }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-job-type">Employment type</label>
                    <input
                      id="manual-job-type"
                      placeholder="Full-time, contract, part-time..."
                      value={manualJobEditor.values.employment_type ?? ""}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        values: { ...current.values, employment_type: event.target.value || null },
                      }))}
                    />
                  </div>
                  <div className="manual-job-wide">
                    <label htmlFor="manual-job-description">Job description</label>
                    <textarea
                      id="manual-job-description"
                      value={manualJobEditor.values.description}
                      onChange={(event) => setManualJobEditor((current) => current && ({
                        ...current,
                        values: { ...current.values, description: event.target.value },
                      }))}
                    />
                  </div>
                </>
              )}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="actions manual-job-dialog-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={savingManualJob || importingManualJob}
                onClick={() => setManualJobEditor(null)}
              >
                Cancel
              </button>
              {manualJobEditor.fieldsExpanded && (
                <button
                  type="button"
                  className="btn"
                  disabled={savingManualJob || importingManualJob || !manualJobEditor.values.title.trim() || !manualJobEditor.values.description.trim()}
                  onClick={() => void saveManualJob()}
                >
                  {savingManualJob ? <Spinner label="Saving..." /> : "Save job"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedUnmatchedWord && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() =>
            !ignoringWord && !addingWord && setSelectedUnmatchedWord(null)
          }
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ignore-keyword-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="ignore-keyword-title">Keyword action</strong>
            </div>
            <p className="meta">
              Add <strong>{selectedUnmatchedWord.word}</strong> to your resume
              skills, or ignore it for future job match scores.
            </p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn secondary"
                disabled={ignoringWord || addingWord}
                onClick={() => setSelectedUnmatchedWord(null)}
              >
                Cancel
              </button>
              <button
                className="btn secondary"
                disabled={ignoringWord || addingWord}
                onClick={addSelectedWordToResume}
              >
                {addingWord ? "Adding..." : "Add Keyword"}
              </button>
              <button
                className="btn"
                disabled={ignoringWord || addingWord}
                onClick={ignoreSelectedWord}
              >
                {ignoringWord ? "Ignoring..." : "Ignore"}
              </button>
            </div>
          </div>
        </div>
      )}
      {loading && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="searching-boards-title"
            aria-live="polite"
          >
            <div className="modal-header">
              <strong id="searching-boards-title">Searching Jobs</strong>
              <Spinner size="lg" />
            </div>
            <p className="meta">
              Searching {sourceNames.length > 0 ? sourceNames.join(" and ") : "the selected sources"}.
            </p>
          </div>
        </div>
      )}
      <div className="panel">
        <h2>Search Jobs</h2>
        <p className="meta">
          We search multiple locations to find you the perfect career match for you.
        </p>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Role / keywords</label>
            <div className="input-clear">
              <input
                value={query}
                placeholder="e.g. senior python engineer"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="clear-btn"
                  aria-label="Clear role / keywords"
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div>
            <label>Location</label>
            <div className="input-clear">
              <input
                value={location}
                placeholder="e.g. Remote, Chicago"
                onChange={(e) => setLocation(e.target.value)}
              />
              {location && (
                <button
                  type="button"
                  className="clear-btn"
                  aria-label="Clear location"
                  onClick={() => setLocation("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
        <label>Sources</label>
        <div style={{ display: "flex", gap: 16, margin: "4px 0 12px" }}>
          {["adzuna", "jsearch"].map((s) => (
            <label
              key={s}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={sources.includes(s)}
                onChange={() => toggleSource(s)}
              />
              {s}
              {!available.includes(s) && (
                <span className="meta">(no API key)</span>
              )}
            </label>
          ))}
        </div>
        <div className="search-submit-row">
          <button className="btn" onClick={search} disabled={loading || !query}>
            {loading ? <Spinner label="Searching…" /> : "Search"}
          </button>
          <button
            type="button"
            className="btn manual-job-add"
            disabled={!profile}
            title={profile ? "Add Job" : "Create a profile before adding a job"}
            onClick={() => openManualJobEditor()}
          >
            <Plus size={17} aria-hidden="true" />
            Add Job
          </button>
        </div>
        {cachedAt && !loading && (
          <span className="meta" style={{ marginLeft: 10 }}>
            Showing cached results from {new Date(cachedAt).toLocaleString()} ·
            click Search to refresh
          </span>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {loading && jobs.length === 0 && (
        <div className="panel">
          <Spinner size="lg" label="Searching job boards…" block />
        </div>
      )}

      {resultsPagination}

      {displayedJobs.map((job) => {
        const jobDocuments = docs[job.id] ?? [];
        const resumeDocument = [...jobDocuments]
          .reverse()
          .find((document) => document.type === "resume");
        const coverLetterDocument = [...jobDocuments]
          .reverse()
          .find((document) => document.type === "cover_letter");
        const keywords = matchKeywords(job.match_notes);
        const isJobBusy = busyAction?.jobId === job.id;
        const isGeneratingResume =
          isJobBusy && busyAction?.type === "resume";
        const isGeneratingCover = isJobBusy && busyAction?.type === "cover";
        const isTracking = isJobBusy && busyAction?.type === "track";
        const unmatchedWords = keywords
          ? keywords.unmatched === "none"
            ? []
            : keywords.unmatched.split(", ").filter((word) => !ignoredWords.has(word))
          : [];
        return (
        <div
          id={`job-${job.id}`}
          className={`job${job.source === "manual" ? " manual-job" : ""}${job.id === newlySavedJobId ? " newly-saved-job" : ""}`}
          key={job.id}
        >
          <div className="title">{job.title}</div>
          <div className="meta">
            {job.company ?? "Unknown company"} · {job.location ?? "—"}
            {job.url && (
              <> ·{" "}<a href={job.url} target="_blank" rel="noreferrer">
                view posting
              </a></>
            )}
          </div>
          <div>
            <span className="badge">
              {job.source === "manual"
                ? normalizedJobSource(job.url, job.manual_source) ?? "Manual"
                : job.source}
            </span>
            {job.match_score != null && (
              <span className="badge score" style={matchStyle(job.match_score)}>
                match {job.match_score}
              </span>
            )}
            <span className="badge">{job.status}</span>
          </div>
          {keywords ? (
            <div className="meta" style={{ margin: "8px 0" }}>
              <div>
                Matched keywords: {keywords.matched}
              </div>
              <div>
                Unmatched keywords: {unmatchedWords.length > 0 ? (
                  unmatchedWords.map((word, index) => (
                    <span key={word}>
                      {index > 0 && ", "}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          setSelectedUnmatchedWord({ jobId: job.id, word })
                        }
                      >
                        {word}
                      </button>
                    </span>
                  ))
                ) : (
                  "none"
                )}
              </div>
            </div>
          ) : (
            job.match_notes && <p className="meta">{job.match_notes}</p>
          )}
          <div className="actions">
            <div className="generation-action">
              <button
                className="btn secondary"
                disabled={isJobBusy}
                onClick={() => generate(job, "resume")}
              >
                {isGeneratingResume ? (
                  <Spinner label="Generating…" />
                ) : (
                  "Generate resume"
                )}
              </button>
              {resumeDocument && (
                <button
                  className="icon-btn"
                  aria-label={viewingDocumentId === resumeDocument.id ? "Hide resume preview" : "Show resume preview"}
                  title={viewingDocumentId === resumeDocument.id ? "Hide resume preview" : "Show resume preview"}
                  aria-pressed={viewingDocumentId === resumeDocument.id}
                  onClick={() => toggleDocumentPreview(resumeDocument.id)}
                >
                  <Eye size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="generation-action">
              <button
                className="btn secondary"
                disabled={isJobBusy}
                onClick={() => generate(job, "cover")}
              >
                {isGeneratingCover ? (
                  <Spinner label="Generating…" />
                ) : (
                  "Generate cover letter"
                )}
              </button>
              {coverLetterDocument && (
                <button
                  className="icon-btn"
                  aria-label={viewingDocumentId === coverLetterDocument.id ? "Hide cover letter preview" : "Show cover letter preview"}
                  title={viewingDocumentId === coverLetterDocument.id ? "Hide cover letter preview" : "Show cover letter preview"}
                  aria-pressed={viewingDocumentId === coverLetterDocument.id}
                  onClick={() => toggleDocumentPreview(coverLetterDocument.id)}
                >
                  <Eye size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            {trackedJobIds.has(job.id) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="btn"
                  style={{ background: "var(--accent-2)", color: "#fff" }}
                  onClick={() => onOpenApplication(job.id)}
                >
                  ✓ Tracked
                </button>
                <span className="badge">
                  {trackedStatuses[job.id] ?? "draft"}
                </span>
              </div>
            ) : (
              <button
                className="btn"
                disabled={isJobBusy}
                onClick={() => track(job)}
              >
                {isTracking ? <Spinner label="Tracking…" /> : "Track application"}
              </button>
            )}
            {job.source === "manual" ? (
              <div className="manual-job-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${job.title}`}
                  title="Edit manual job"
                  disabled={manualJobAction === job.id}
                  onClick={() => openManualJobEditor(job)}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Archive ${job.title}`}
                  title="Archive manual job"
                  disabled={manualJobAction === job.id}
                  onClick={() => void archiveManualJob(job)}
                >
                  <Archive size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Delete ${job.title}`}
                  title="Delete manual job"
                  disabled={manualJobAction === job.id}
                  onClick={() => void deleteManualJob(job)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                className="btn secondary"
                title="Remove from results"
                onClick={() => dismiss(job.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
        );
      })}
      {resultsPagination}
      {viewingDocumentId != null && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setPreviewOnOpen(false);
            setViewingDocumentId(null);
          }}
        >
          <div
            className="modal document-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="document-editor-title">
                {editingDocument?.type === "resume" ? "Resume editor" : "Cover letter editor"}
              </strong>
              <button
                className="modal-close-btn"
                aria-label="Close preview"
                title="Close preview"
                onClick={() => {
                  setPreviewOnOpen(false);
                  setViewingDocumentId(null);
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {editingDocument && (
              <DocumentEditor
                compact
                doc={editingDocument}
                profileId={profile?.id}
                initialPreview={previewOnOpen}
                onChange={(updated) =>
                  setDocs((current) => Object.fromEntries(
                    Object.entries(current).map(([jobId, documents]) => [
                      jobId,
                      documents.map((document) =>
                        document.id === updated.id ? updated : document,
                      ),
                    ]),
                  ))
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
