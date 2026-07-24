import { useEffect, useState } from "react";
import { api } from "../api";
import { matchStyle } from "../match";
import { renderMarkdown } from "../pdf";
import type { Document } from "../types";
import Spinner from "./Spinner";

interface Props {
  doc: Document;
  profileId: number | undefined;
  onChange: (doc: Document) => void;
  matchScore?: number | null;
  compact?: boolean;
  initialPreview?: boolean;
}

export default function DocumentEditor({
  doc,
  profileId,
  onChange,
  matchScore,
  compact = false,
  initialPreview = false,
}: Props) {
  const [content, setContent] = useState(doc.content);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<"save" | "approve" | "regen" | "pdf" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(initialPreview);
  const [previewHtml, setPreviewHtml] = useState(doc.rendered_html);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const dirty = content !== doc.content;
  const label = doc.type === "resume" ? "Resume" : "Cover letter";

  useEffect(() => {
    if (!preview || !profileId) return;
    let active = true;
    setLoadingPreview(true);
    setError(null);
    api
      .previewDocument(doc.id, profileId, content)
      .then(({ rendered_html }) => {
        if (active) setPreviewHtml(rendered_html);
      })
      .catch((previewError) => {
        if (active) {
          setError(previewError instanceof Error ? previewError.message : String(previewError));
        }
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [preview, doc.id, profileId]);

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      onChange(await api.updateDocument(doc.id, { content, profile_id: profileId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleApprove = async () => {
    setBusy("approve");
    setError(null);
    try {
      // Persist any pending edits together with the approval.
      const updated = await api.updateDocument(doc.id, {
        content: dirty ? content : undefined,
        approved: !doc.approved,
        profile_id: profileId,
      });
      setContent(updated.content);
      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    if (!profileId) {
      setError("No active profile.");
      return;
    }
    setBusy("regen");
    setError(null);
    try {
      const updated = await api.regenerateDocument(
        doc.id,
        profileId,
        instructions || undefined,
      );
      setContent(updated.content);
      setInstructions("");
      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = () => navigator.clipboard.writeText(content);

  const downloadPdf = async () => {
    setBusy("pdf");
    setError(null);
    try {
      // Ensure the PDF reflects any unsaved edits.
      if (dirty) {
        onChange(await api.updateDocument(doc.id, { content, profile_id: profileId }));
      }
      const { blob, filename } = await api.downloadDocumentPdf(doc.id, profileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={compact ? "document-editor" : "panel"}
      style={
        compact
          ? undefined
          : { marginTop: 10, borderColor: doc.approved ? "#22c55e" : undefined }
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>
          {doc.file_path?.replace(/\.pdf$/i, "") ?? `${label} #${doc.id}`} <span className="meta">(Markdown)</span>
        </strong>
        <div>
          {matchScore != null && (
            <span className="badge score" style={matchStyle(matchScore)}>
              match {matchScore}
            </span>
          )}
          {doc.approved && <span className="badge approved-badge">approved</span>}
        </div>
      </div>

      <label>
        {preview ? "Rendered preview" : "Edit the content, then save, approve, or regenerate"}
      </label>
      {preview ? (
        loadingPreview ? (
          <div className="doc-preview"><Spinner label="Applying template..." /></div>
        ) : previewHtml ? (
          <iframe
            className="doc-preview template-preview"
            sandbox=""
            srcDoc={previewHtml}
            title={`${label} template preview`}
          />
        ) : (
          <div
            className="doc-preview"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ minHeight: 240, fontFamily: "ui-monospace, monospace" }}
        />
      )}

      <div className="actions">
        <button className="btn secondary" onClick={() => setPreview((p) => !p)}>
          {preview ? "Edit" : "Preview"}
        </button>
        <button
          className="btn secondary"
          onClick={downloadPdf}
          disabled={busy !== null}
        >
          {busy === "pdf" ? <Spinner label="Preparing…" /> : "Download PDF"}
        </button>
        <button className="btn secondary" onClick={copy}>
          Copy
        </button>
        <button
          className="btn secondary"
          onClick={save}
          disabled={busy !== null || !dirty}
        >
          {busy === "save" ? <Spinner label="Saving…" /> : dirty ? "Save edits" : "Saved"}
        </button>
        <button
          className="btn"
          onClick={toggleApprove}
          disabled={busy !== null}
        >
          {busy === "approve"
            ? "…"
            : doc.approved
              ? "Unapprove"
              : "Approve"}
        </button>
      </div>

      <label>Regenerate with AI — describe what to change</label>
      <div className="row">
        <input
          value={instructions}
          placeholder="e.g. Emphasize leadership, make it more concise, add a metrics-focused summary"
          onChange={(e) => setInstructions(e.target.value)}
        />
        <button
          className="btn"
          style={{ flex: "0 0 auto" }}
          onClick={regenerate}
          disabled={busy !== null}
        >
          {busy === "regen" ? <Spinner label="Regenerating…" /> : "Regenerate"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
