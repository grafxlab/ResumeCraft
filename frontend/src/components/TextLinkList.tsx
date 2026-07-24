import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TextLinkItem } from "../types";
import PlaceholderHelp from "./PlaceholderHelp";

interface Props {
  label: string;
  value: TextLinkItem[];
  onChange: (items: TextLinkItem[]) => void | Promise<void>;
  emptyMessage?: string;
  placeholders?: string[];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function linkHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (emailPattern.test(trimmed)) return `mailto:${trimmed}`;

  try {
    const url = new URL(
      trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed,
    );
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export default function TextLinkList({ label, value, onChange, emptyMessage, placeholders }: Props) {
  const [draft, setDraft] = useState<TextLinkItem | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const beginAdd = () => {
    setDraft({ text: "", link: "" });
    setEditingIndex(null);
    setError(null);
  };

  const beginEdit = (index: number) => {
    setDraft(value[index]);
    setEditingIndex(index);
    setError(null);
  };

  const cancel = () => {
    setDraft(null);
    setEditingIndex(null);
    setError(null);
  };

  const commit = async (items: TextLinkItem[]) => {
    setSaving(true);
    setError(null);
    try {
      await onChange(items);
      cancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!draft?.text.trim()) {
      setError("Text is required.");
      return;
    }
    if (draft.link.trim() && !linkHref(draft.link)) {
      setError("Link must be a valid URL or email address.");
      return;
    }

    const next = { text: draft.text.trim(), link: draft.link.trim() };
    await commit(
      editingIndex == null
        ? [...value, next]
        : value.map((item, index) => (index === editingIndex ? next : item)),
    );
  };

  return (
    <section className="text-link-list" aria-label={label}>
      <div className="text-link-list-header">
        <div className="field-label">
          <label>{label}</label>
          {placeholders && <PlaceholderHelp placeholders={placeholders} />}
        </div>
        <button className="icon-btn" type="button" onClick={beginAdd} title={`Add ${label.toLowerCase()}`} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      {value.length === 0 && !draft && (
        <p className="meta">{emptyMessage ?? "Add certifications, awards, languages, volunteer work, or relevant links."}</p>
      )}
      <div className="text-link-list-items">
        {value.map((item, index) => {
          const href = linkHref(item.link);
          return (
            <div className="text-link-item" key={`${item.text}-${index}`}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">{item.text}</a>
              ) : (
                <span>{item.text}</span>
              )}
              <div className="text-link-item-actions">
                <button className="icon-btn" type="button" onClick={() => beginEdit(index)} title="Edit" aria-label={`Edit ${item.text}`}>
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button className="icon-btn" type="button" disabled={saving} onClick={() => void commit(value.filter((_, itemIndex) => itemIndex !== index))} title="Delete" aria-label={`Delete ${item.text}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {draft && (
        <div className="text-link-form">
          <label>
            Text
            <input value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
          </label>
          <label>
            Link
            <input value={draft.link} placeholder="https://example.com or name@example.com" onChange={(event) => setDraft({ ...draft, link: event.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn" type="button" disabled={saving} onClick={() => void save()}><Check size={16} aria-hidden="true" /> {saving ? "Saving..." : "Save"}</button>
            <button className="btn secondary" type="button" disabled={saving} onClick={cancel}><X size={16} aria-hidden="true" /> Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}