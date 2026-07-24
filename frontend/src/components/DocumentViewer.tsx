import { useEffect, useState } from "react";
import { api } from "../api";
import { renderMarkdown } from "../pdf";
import type { Document } from "../types";
import Spinner from "./Spinner";

interface Props {
  documentId: number;
  profileId: number | undefined;
  onClose: () => void;
}

export default function DocumentViewer({ documentId, profileId, onClose }: Props) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDocument(documentId)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [documentId]);

  useEffect(() => {
    if (!doc || !profileId) return;
    let active = true;
    api
      .previewDocument(doc.id, profileId)
      .then(({ rendered_html }) => {
        if (active) setPreviewHtml(rendered_html);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [doc, profileId]);

  const downloadPdf = async () => {
    try {
      const { blob, filename } = await api.downloadDocumentPdf(documentId, profileId);
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
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <strong>
            {doc
              ? doc.type === "resume"
                ? "Resume"
                : "Cover letter"
              : "Document"}
            {doc && (doc.file_path
              ? ` · ${doc.file_path.replace(/\.pdf$/i, "")}`
              : ` #${doc.id}`)}
          </strong>
          <div style={{ display: "flex", gap: 8 }}>
            {doc && (
              <button className="btn secondary" onClick={downloadPdf}>
                Download PDF
              </button>
            )}
            <button className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {doc && (!profileId || previewHtml) ? (
          <div
            className="doc-preview"
            style={{ maxHeight: "70vh" }}
            dangerouslySetInnerHTML={{
              __html: previewHtml ?? renderMarkdown(doc.content),
            }}
          />
        ) : (
          !error && <Spinner size="lg" label="Loading…" block />
        )}
      </div>
    </div>
  );
}
