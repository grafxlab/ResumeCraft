import { useState } from "react";
import { api } from "../api";
import { renderMarkdown } from "../pdf";
import type { Document } from "../types";
import Spinner from "./Spinner";

interface Props {
  doc: Document;
  profileId: number | undefined;
  onChange: (doc: Document) => void;
}

export default function DocumentEditor({ doc, profileId, onChange }: Props) {
  const [content, setContent] = useState(doc.content);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<"save" | "approve" | "regen" | "pdf" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const dirty = content !== doc.content;
  const label = doc.type === "resume" ? "Resume" : "Cover letter";

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      onChange(await api.updateDocument(doc.id, { content }));
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
        onChange(await api.updateDocument(doc.id, { content }));
      }
      const blob = await api.downloadDocumentPdf(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.type}_${doc.id}.pdf`;
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
      className="panel"
      style={{ marginTop: 10, borderColor: doc.approved ? "#22c55e" : undefined }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>
          {label} #{doc.id} <span className="meta">(Markdown)</span>
        </strong>
        {doc.approved && <span className="badge score">approved</span>}
      </div>

      <label>
        {preview ? "Rendered preview" : "Edit the content, then save, approve, or regenerate"}
      </label>
      {preview ? (
        <div
          className="doc-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
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
