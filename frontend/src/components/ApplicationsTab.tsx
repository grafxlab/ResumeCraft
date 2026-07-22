import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { matchStyle } from "../match";
import type { Application, ApplicationStatus } from "../types";
import DocumentViewer from "./DocumentViewer";

const STATUSES: ApplicationStatus[] = [
  "draft",
  "sent",
  "interview",
  "offer",
  "rejected",
  "no_response",
];

interface Props {
  focusJobId: number | null;
  profileId: number | undefined;
  onFocusHandled: () => void;
}

export default function ApplicationsTab({
  focusJobId,
  profileId,
  onFocusHandled,
}: Props) {
  const [apps, setApps] = useState<Application[]>([]);
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
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const load = async () => {
    setError(null);
    try {
      setApps(await api.listApplications());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
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
                  {s}
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
        <div
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
            {fmt(app.created_at)}
          </div>

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
                    {s}
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
              </div>
            </div>
            {app.status !== "draft" && (
              <div>
                <label>Documents</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn secondary"
                    disabled={!app.resume_document_id}
                    onClick={() =>
                      app.resume_document_id &&
                      setViewingDocId(app.resume_document_id)
                    }
                  >
                    Preview resume
                  </button>
                  <button
                    className="btn secondary"
                    disabled={
                      !app.resume_document_id || regeneratingDocumentId !== null
                    }
                    onClick={() =>
                      app.resume_document_id && regenerateDocument(app.resume_document_id)
                    }
                  >
                    {regeneratingDocumentId === app.resume_document_id
                      ? "Regenerating resume..."
                      : "Regenerate resume"}
                  </button>
                  <button
                    className="btn secondary"
                    disabled={!app.cover_letter_document_id}
                    onClick={() =>
                      app.cover_letter_document_id &&
                      setViewingDocId(app.cover_letter_document_id)
                    }
                  >
                    Preview cover letter
                  </button>
                  <button
                    className="btn secondary"
                    disabled={
                      !app.cover_letter_document_id || regeneratingDocumentId !== null
                    }
                    onClick={() =>
                      app.cover_letter_document_id &&
                      regenerateDocument(app.cover_letter_document_id)
                    }
                  >
                    {regeneratingDocumentId === app.cover_letter_document_id
                      ? "Regenerating cover letter..."
                      : "Regenerate cover letter"}
                  </button>
                </div>
              </div>
            )}
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
      ))}

      {viewingDocId != null && (
        <DocumentViewer
          documentId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
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
