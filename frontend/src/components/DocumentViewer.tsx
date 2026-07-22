import { useEffect, useState } from "react";
import { api } from "../api";
import { renderMarkdown } from "../pdf";
import type { Document } from "../types";
import Spinner from "./Spinner";

interface Props {
  documentId: number;
  onClose: () => void;
}

export default function DocumentViewer({ documentId, onClose }: Props) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDocument(documentId)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [documentId]);

  const downloadPdf = async () => {
    try {
      const blob = await api.downloadDocumentPdf(documentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc?.type ?? "document"}_${documentId}.pdf`;
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
            {doc && ` #${doc.id}`}
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
        {doc ? (
          <div
            className="doc-preview"
            style={{ maxHeight: "70vh" }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }}
          />
        ) : (
          !error && <Spinner size="lg" label="Loading…" block />
        )}
      </div>
    </div>
  );
}
