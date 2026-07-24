import { X } from "lucide-react";
import type { TextLinkItem } from "../types";
import PlaceholderHelp from "./PlaceholderHelp";

interface Props {
  label: string;
  value: TextLinkItem | null;
  onChange: (item: TextLinkItem | null) => void;
  placeholders: string[];
}

export default function TextLinkField({ label, value, onChange, placeholders }: Props) {
  const update = (field: "text" | "link", nextValue: string) => {
    const next = { text: value?.text ?? "", link: value?.link ?? "", [field]: nextValue };
    onChange(next.text || next.link ? next : null);
  };

  return (
    <div className="text-link-field">
      <div className="field-label">
        <label>{label}</label>
        <PlaceholderHelp placeholders={placeholders} />
      </div>
      <div className="text-link-input">
        <input
          value={value?.text ?? ""}
          placeholder="Text"
          onChange={(event) => update("text", event.target.value)}
        />
        {value?.text && (
          <button type="button" onClick={() => update("text", "")} aria-label={`Clear ${label} text`} title="Clear text">
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="text-link-input">
        <input
          value={value?.link ?? ""}
          placeholder="URL"
          onChange={(event) => update("link", event.target.value)}
        />
        {value?.link && (
          <button type="button" onClick={() => update("link", "")} aria-label={`Clear ${label} URL`} title="Clear URL">
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
