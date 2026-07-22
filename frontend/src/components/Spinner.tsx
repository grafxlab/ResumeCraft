interface Props {
  size?: "sm" | "lg";
  label?: string;
  block?: boolean;
}

export default function Spinner({ size = "sm", label, block }: Props) {
  const spinner = <span className={`spinner${size === "lg" ? " lg" : ""}`} />;
  if (block) {
    return (
      <div className="spinner-wrap">
        {spinner}
        {label && <span>{label}</span>}
      </div>
    );
  }
  return (
    <>
      {spinner}
      {label ? ` ${label}` : ""}
    </>
  );
}
