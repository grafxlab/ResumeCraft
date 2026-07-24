import { CircleHelp } from "lucide-react";

interface Props {
  placeholders: string[];
}

export default function PlaceholderHelp({ placeholders }: Props) {
  const message = placeholders.map((placeholder) => `{{${placeholder}}}`).join("  ");

  return (
    <button
      className="placeholder-help"
      type="button"
      aria-label={`Template placeholders: ${message}`}
      data-tooltip={message}
    >
      <CircleHelp size={14} aria-hidden="true" />
    </button>
  );
}
