import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { api } from "../api";
import { matchStyle } from "../match";
import type {
  ApplicationStatus,
  Document,
  JobPosting,
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

  const sourceNames = sources.map((source) =>
    source === "adzuna" ? "Adzuna" : source === "jsearch" ? "JSearch" : source,
  );
  const editingDocument = viewingDocumentId == null
    ? null
    : Object.values(docs).flat().find((doc) => doc.id === viewingDocumentId) ?? null;

  useEffect(() => {
    localStorage.setItem("search.query", query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem("search.location", location);
  }, [location]);

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
              <strong id="searching-boards-title">Searching job boards</strong>
              <Spinner size="lg" />
            </div>
            <p className="meta">
              Searching {sourceNames.length > 0 ? sourceNames.join(" and ") : "the selected sources"}.
            </p>
          </div>
        </div>
      )}
      <div className="panel">
        <h2>Search Job Boards</h2>
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
        <button className="btn" onClick={search} disabled={loading || !query}>
          {loading ? <Spinner label="Searching…" /> : "Search"}
        </button>
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

      {jobs.map((job) => {
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
        <div className="job" key={job.id}>
          <div className="title">{job.title}</div>
          <div className="meta">
            {job.company ?? "Unknown company"} · {job.location ?? "—"} ·{" "}
            <a href={job.url} target="_blank" rel="noreferrer">
              view posting
            </a>
          </div>
          <div>
            <span className="badge">{job.source}</span>
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
            <button
              className="btn secondary"
              title="Remove from results"
              onClick={() => dismiss(job.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
        );
      })}
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
