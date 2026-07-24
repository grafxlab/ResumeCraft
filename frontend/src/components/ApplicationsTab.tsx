import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { api } from "../api";
import { matchStyle } from "../match";
import { formatSalary } from "../salary";
import type { Application, ApplicationStatus, Document, Profile } from "../types";
import DocumentViewer from "./DocumentViewer";

const STATUSES: ApplicationStatus[] = [
  "draft",
  "sent",
  "interview",
  "offer",
  "rejected",
  "no_response",
];

const statusLabel = (status: ApplicationStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

interface Props {
  focusJobId: number | null;
  profile: Profile | null;
  onProfileUpdated: (profile: Profile) => void;
  onFocusHandled: () => void;
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

export default function ApplicationsTab({
  focusJobId,
  profile,
  onProfileUpdated,
  onFocusHandled,
}: Props) {
  const [apps, setApps] = useState<Application[]>([]);
  const [documentsByJob, setDocumentsByJob] = useState<Record<number, Document[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showActive, setShowActive] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focusedOnlyId, setFocusedOnlyId] = useState<number | null>(null);
  const [regeneratingDocumentId, setRegeneratingDocumentId] = useState<
    number | null
  >(null);
  const [generatingDocument, setGeneratingDocument] = useState<{
    applicationId: number;
    type: "resume" | "cover_letter";
  } | null>(null);
  const [ignoredWords, setIgnoredWords] = useState<Set<string>>(new Set());
  const [selectedUnmatchedWord, setSelectedUnmatchedWord] = useState<{
    jobId: number;
    word: string;
  } | null>(null);
  const [ignoringWord, setIgnoringWord] = useState(false);
  const [addingWord, setAddingWord] = useState(false);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const profileId = profile?.id;

  const load = async () => {
    setError(null);
    try {
      const applications = await api.listApplications();
      setApps(applications);
      const documentResults = await Promise.allSettled(
        applications.map(async (app) => [
          app.job_id,
          await api.listDocuments(app.job_id),
        ] as const),
      );
      const resolvedDocuments = documentResults
        .filter((result): result is PromiseFulfilledResult<readonly [number, Document[]]> =>
          result.status === "fulfilled",
        )
        .map((result) => result.value);
      setDocumentsByJob(Object.fromEntries(resolvedDocuments));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    load();
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

  // When navigated here from a "Tracked" button, reveal and highlight the app.
  useEffect(() => {
    if (focusJobId == null || apps.length === 0) return;
    const target = apps.find((a) => a.job_id === focusJobId);
    if (!target) return;

    // Show only the focused item; the active/archived boxes appear unchecked.
    setStatusFilter("all");
    setFocusedOnlyId(target.id);

    setHighlightId(target.id);
    const t = setTimeout(() => {
      cardRefs.current[target.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
    const clear = setTimeout(() => setHighlightId(null), 2500);
    onFocusHandled();
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [focusJobId, apps]);

  const update = async (
    app: Application,
    patch: Partial<Application>,
  ): Promise<void> => {
    try {
      const updated = await api.updateApplication(app.id, patch);
      setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const fmtTracked = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(date);
  };
  const fmtDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString() : "—";

  const visibleApps = apps.filter((a) => {
    // After arriving via a "Tracked" click, show only that one application.
    if (focusedOnlyId != null) return a.id === focusedOnlyId;
    if (a.archived ? !showArchived : !showActive) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    return true;
  });

  // When focused on a single item, the checkboxes render unchecked; clicking
  // one exits focus mode and shows that group appropriately.
  const toggleActive = (checked: boolean) => {
    if (focusedOnlyId != null) {
      setFocusedOnlyId(null);
      setShowActive(true);
      setShowArchived(false);
    } else {
      setShowActive(checked);
    }
  };

  const toggleArchived = (checked: boolean) => {
    if (focusedOnlyId != null) {
      setFocusedOnlyId(null);
      setShowArchived(true);
      setShowActive(false);
    } else {
      setShowArchived(checked);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteApplication(confirmDelete.id);
      setApps((prev) => prev.filter((a) => a.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const regenerateDocument = async (documentId: number) => {
    if (!profileId) {
      setError("No active profile.");
      return;
    }
    setRegeneratingDocumentId(documentId);
    setError(null);
    try {
      const updated = await api.regenerateDocument(documentId, profileId);
      setViewingDocId(updated.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeneratingDocumentId(null);
    }
  };

  const generateDocument = async (
    app: Application,
    type: "resume" | "cover_letter",
  ) => {
    if (!profileId) {
      setError("No active profile.");
      return;
    }
    setGeneratingDocument({ applicationId: app.id, type });
    setError(null);
    try {
      const document = type === "resume"
        ? await api.generateResume(app.job_id, profileId)
        : await api.generateCoverLetter(app.job_id, profileId);
      const updated = await api.updateApplication(app.id, {
        ...(type === "resume"
          ? { resume_document_id: document.id }
          : { cover_letter_document_id: document.id }),
      });
      setApps((current) => current.map((item) => item.id === app.id ? updated : item));
      setDocumentsByJob((current) => ({
        ...current,
        [app.job_id]: [document, ...(current[app.job_id] ?? []).filter((item) => item.id !== document.id)],
      }));
      setViewingDocId(document.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingDocument(null);
    }
  };

  const rescoreApplicationJob = async (jobId: number, activeProfile: Profile) => {
    const rescored = await api.rescoreJob(jobId, activeProfile.id);
    setApps((current) => current.map((app) => (
      app.job_id === rescored.id ? { ...app, job: { ...app.job, ...rescored } } : app
    )));
  };

  const ignoreSelectedWord = async () => {
    if (!profile || !selectedUnmatchedWord) return;
    setIgnoringWord(true);
    setError(null);
    try {
      const ignored = await api.ignoreWord(profile.id, selectedUnmatchedWord.word);
      setIgnoredWords((current) => new Set(current).add(ignored.word));
      await rescoreApplicationJob(selectedUnmatchedWord.jobId, profile);
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
    setError(null);
    try {
      const word = selectedUnmatchedWord.word;
      const skills = profile.skills.some(
        (skill) => skill.toLowerCase() === word.toLowerCase(),
      )
        ? profile.skills
        : [...profile.skills, word];
      const updatedProfile = await api.updateProfile(profile.id, { ...profile, skills });
      onProfileUpdated(updatedProfile);
      await rescoreApplicationJob(selectedUnmatchedWord.jobId, updatedProfile);
      setSelectedUnmatchedWord(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingWord(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <h2>Application Tracker</h2>
        <div
          className="row"
          style={{ alignItems: "center", gap: 20, marginTop: 4 }}
        >
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}
          >
            <input
              type="checkbox"
              checked={focusedOnlyId != null ? false : showActive}
              onChange={(e) => toggleActive(e.target.checked)}
            />
            Active
          </label>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}
          >
            <input
              type="checkbox"
              checked={focusedOnlyId != null ? false : showArchived}
              onChange={(e) => toggleArchived(e.target.checked)}
            />
            Archived
          </label>
          <div style={{ maxWidth: 200 }}>
            <select
              value={focusedOnlyId != null ? "all" : statusFilter}
              onChange={(e) => {
                setFocusedOnlyId(null);
                setStatusFilter(e.target.value as ApplicationStatus | "all");
              }}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                    {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {apps.length === 0 && (
          <p className="meta">
            No applications yet. Track one from the Search tab.
          </p>
        )}
        {apps.length > 0 && visibleApps.length === 0 && (
          <p className="meta">No applications match the current filters.</p>
        )}
      </div>

      {visibleApps.map((app) => (
        (() => {
          const jobDocuments = documentsByJob[app.job_id] ?? [];
          const resumeDocumentId = [...jobDocuments]
            .reverse()
            .find((document) => document.type === "resume")?.id
            ?? app.resume_document_id;
          const coverLetterDocumentId = [...jobDocuments]
            .reverse()
            .find((document) => document.type === "cover_letter")?.id
            ?? app.cover_letter_document_id;
          const keywords = matchKeywords(app.job.match_notes);
          const unmatchedWords = keywords && keywords.unmatched !== "none"
            ? keywords.unmatched.split(", ").filter((word) => !ignoredWords.has(word))
            : [];
          return <div
          className="panel"
          key={app.id}
          ref={(el) => {
            cardRefs.current[app.id] = el;
          }}
          style={
            highlightId === app.id
              ? { boxShadow: "0 0 0 2px var(--accent)", transition: "box-shadow 0.3s" }
              : undefined
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="title" style={{ fontWeight: 600 }}>
                {app.job.title}
                {app.archived && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    archived
                  </span>
                )}
              </div>
              <div className="meta">{app.job.company ?? "Unknown company"}</div>
              {formatSalary(app.job) && <div className="meta">{formatSalary(app.job)}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              {app.job.match_score != null && (
                <span
                  className="badge score"
                  style={matchStyle(app.job.match_score)}
                >
                  match {app.job.match_score}
                </span>
              )}
              <span className="badge">{app.job.source}</span>
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  gap: 6,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn secondary"
                  style={{ padding: "4px 10px" }}
                  onClick={() => update(app, { archived: !app.archived })}
                >
                  {app.archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  className="btn secondary icon-btn"
                  title="Delete application"
                  aria-label="Delete application"
                  onClick={() => setConfirmDelete(app)}
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>

          <div className="meta" style={{ margin: "6px 0" }}>
            <a href={app.job.url} target="_blank" rel="noreferrer">
              View original posting ↗
            </a>
            {app.job.location ? ` · ${app.job.location}` : ""} · Tracked{" "}
            {fmtTracked(app.created_at)}
          </div>
          {keywords ? (
            <div className="meta" style={{ margin: "8px 0" }}>
              <div><strong>Matched Keywords:</strong> {keywords.matched}</div>
              <div style={{ marginTop: 6 }}>
                <strong>Unmatched Keywords:</strong>{" "}
                {unmatchedWords.length > 0 ? unmatchedWords.map((word, index) => (
                  <span key={word}>
                    {index > 0 && ", "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setSelectedUnmatchedWord({ jobId: app.job_id, word })}
                    >
                      {word}
                    </button>
                  </span>
                )) : "none"}
              </div>
            </div>
          ) : (
            app.job.match_notes && <p className="meta">{app.job.match_notes}</p>
          )}

          <div className="row" style={{ alignItems: "flex-end", marginTop: 6 }}>
            <div style={{ maxWidth: 180 }}>
              <label>Status</label>
              <select
                value={app.status}
                onChange={(e) =>
                  update(app, {
                    status: e.target.value as ApplicationStatus,
                    date_sent:
                      e.target.value === "sent" && !app.date_sent
                        ? new Date().toISOString()
                        : app.date_sent,
                  })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: 220 }}>
              <label>Response date</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="meta">{fmtDateTime(app.date_response)}</span>
                <button
                  className="btn secondary"
                  style={{ padding: "4px 8px" }}
                  onClick={() =>
                    update(app, { date_response: new Date().toISOString() })
                  }
                >
                  Set
                </button>
                <button
                  className="btn secondary"
                  style={{ padding: "4px 8px" }}
                  disabled={!app.date_response}
                  onClick={() => update(app, { date_response: null })}
                >
                  Reset
                </button>
              </div>
            </div>
            <div>
              <label>Documents</label>
              <div className="application-document-actions">
                <div className="application-document-group">
                  <span className="application-document-label">Resume</span>
                  {resumeDocumentId == null ? (
                    <button
                      className="btn secondary"
                      title="Create a New Resume"
                      disabled={generatingDocument !== null || regeneratingDocumentId !== null}
                      onClick={() => generateDocument(app, "resume")}
                    >
                      {generatingDocument?.applicationId === app.id && generatingDocument.type === "resume"
                        ? "Generating..."
                        : "Generate"}
                    </button>
                  ) : (
                    <div className="generation-action">
                    <button
                      className="icon-btn"
                      aria-label="View Resume"
                      title="View Resume"
                      onClick={() => setViewingDocId(resumeDocumentId)}
                    >
                      <Eye size={17} aria-hidden="true" />
                    </button>
                      <button
                        className="btn secondary"
                        title="Regenerate Resume"
                        disabled={regeneratingDocumentId !== null}
                        onClick={() => regenerateDocument(resumeDocumentId)}
                      >
                        {regeneratingDocumentId === resumeDocumentId
                          ? "Regenerating..."
                          : "Regenerate"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="application-document-group">
                  <span className="application-document-label">Cover Letter</span>
                  {coverLetterDocumentId == null ? (
                    <button
                      className="btn secondary"
                      title="Create a New Cover Letter"
                      disabled={generatingDocument !== null || regeneratingDocumentId !== null}
                      onClick={() => generateDocument(app, "cover_letter")}
                    >
                      {generatingDocument?.applicationId === app.id && generatingDocument.type === "cover_letter"
                        ? "Generating..."
                        : "Generate"}
                    </button>
                  ) : (
                    <div className="generation-action">
                    <button
                      className="icon-btn"
                      aria-label="View Cover Letter"
                      title="View Cover Letter"
                      onClick={() => setViewingDocId(coverLetterDocumentId)}
                    >
                      <Eye size={17} aria-hidden="true" />
                    </button>
                      <button
                        className="btn secondary"
                        title="Regenerate Cover Letter"
                        disabled={regeneratingDocumentId !== null}
                        onClick={() => regenerateDocument(coverLetterDocumentId)}
                      >
                        {regeneratingDocumentId === coverLetterDocumentId
                          ? "Regenerating..."
                          : "Regenerate"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <label>Notes</label>
          <textarea
            defaultValue={app.notes ?? ""}
            style={{ minHeight: 60 }}
            onBlur={(e) => {
              if (e.target.value !== (app.notes ?? "")) {
                update(app, { notes: e.target.value });
              }
            }}
          />
        </div>
        })()
      ))}

      {viewingDocId != null && (
        <DocumentViewer
          documentId={viewingDocId}
          profileId={profileId}
          onClose={() => setViewingDocId(null)}
        />
      )}

      {selectedUnmatchedWord && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !ignoringWord && !addingWord && setSelectedUnmatchedWord(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-keyword-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="application-keyword-action-title">Keyword Action</strong>
            </div>
            <p className="meta">
              Add <strong>{selectedUnmatchedWord.word}</strong> to your resume skills, or ignore it for future job match scores.
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

      {confirmDelete && (
        <div
          className="modal-backdrop"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="modal"
            style={{ width: "min(440px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <strong>Delete application?</strong>
            </div>
            <p className="meta">
              This will permanently remove the tracked application for{" "}
              <strong>{confirmDelete.job.title}</strong>
              {confirmDelete.job.company ? ` at ${confirmDelete.job.company}` : ""}.
              This cannot be undone. The job posting and any generated documents
              are not deleted.
            </p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn secondary"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: "#ef4444", color: "#fff" }}
                disabled={deleting}
                onClick={remove}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
