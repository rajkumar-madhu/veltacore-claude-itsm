import type { VmState } from "@/api/hooks";

// Single registry for the app's status vocabularies, so a threshold or
// label never has to be edited in more than one place.

export type HealthTone = "ok" | "warn" | "crit";

export function healthTone(health: number): HealthTone {
  return health >= 95 ? "ok" : health >= 80 ? "warn" : "crit";
}

// Matches the --ok/--warn/--crit custom properties in styles.css — kept as
// plain values (not `var(--x)`) only where an inline hex is unavoidable
// (e.g. SVG `fill`/`stroke` on the dark-background WorldMap, which uses its
// own brighter on-dark variant, MAP_TONE_COLOR, defined in WorldMap.tsx).
export const TONE_COLOR: Record<HealthTone, string> = {
  ok: "#059669",
  warn: "#b45309",
  crit: "#dc2626",
};

interface PillMeta { cls: string; label: string; icon: string }

export const MONITOR_STATE_PILL: Record<string, PillMeta> = {
  ok: { cls: "ok", label: "OK", icon: "fa-circle-check" },
  warn: { cls: "warn", label: "Warn", icon: "fa-triangle-exclamation" },
  alert: { cls: "crit", label: "Alert", icon: "fa-fire" },
  nodata: { cls: "muted", label: "No Data", icon: "fa-circle-question" },
};

export const SYNTHETIC_STATUS_PILL: Record<string, PillMeta> = {
  up: { cls: "ok", label: "Up", icon: "fa-circle-check" },
  degraded: { cls: "warn", label: "Degraded", icon: "fa-triangle-exclamation" },
  down: { cls: "crit", label: "Down", icon: "fa-circle-xmark" },
};

export const VM_STATE_PILL: Record<VmState, { cls: string; label: string; icon: string }> = {
  running: { cls: "ok", label: "Running", icon: "fa-circle-check" },
  stopped: { cls: "crit", label: "Powered Off", icon: "fa-power-off" },
  suspended: { cls: "warn", label: "Suspended", icon: "fa-pause" },
};

/** "in_progress" → "In Progress" */
export const stateLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
