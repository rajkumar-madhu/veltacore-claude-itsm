import React from "react";

export type Toast = { kind: "ok" | "err"; text: string } | null;

export function useToast() {
  const [toast, setToast] = React.useState<Toast>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast && (
    <div className={`toast ${toast.kind}`} role="status">
      <i className={`fa-solid ${toast.kind === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} /> {toast.text}
    </div>
  );
  return [node, setToast] as const;
}
