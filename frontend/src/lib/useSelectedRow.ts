import { useState } from "react";

// Shared "click a table row to show it in the detail panel" state, used by
// every master-detail screen (Monitors, SLOs, Synthetics). Defaults to the
// first row rather than a hardcoded id, so it never drifts from seed data.
export function useSelectedRow<T extends { id: string }>(rows: T[]) {
  const [selId, setSelId] = useState<string | null>(null);
  const sel = rows.find((r) => r.id === selId) ?? rows[0];
  return [sel, setSelId] as const;
}
