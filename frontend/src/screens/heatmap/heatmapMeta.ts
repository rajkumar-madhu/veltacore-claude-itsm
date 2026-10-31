import type { Health, MetricKey, ServiceSnap } from "@/api/hooks";

export const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "availability", label: "Availability", unit: "%" }, { key: "responseMs", label: "Response", unit: " ms" },
  { key: "errorRate", label: "Errors", unit: "%" }, { key: "latencyP95Ms", label: "Latency", unit: " ms" },
  { key: "cpuPct", label: "CPU", unit: "%" }, { key: "memPct", label: "Memory", unit: "%" },
  { key: "diskPct", label: "Disk", unit: "%" }, { key: "netPct", label: "Network", unit: "%" },
];

export const HEALTH_META: Record<Health, { label: string; cls: string; icon: string; color: string }> = {
  ok: { label: "Healthy", cls: "ok", icon: "fa-circle-check", color: "#4caf50" },
  warn: { label: "Warning", cls: "warn", icon: "fa-triangle-exclamation", color: "#f5b82e" },
  crit: { label: "Critical", cls: "crit", icon: "fa-circle-xmark", color: "#ef4444" },
  unknown: { label: "Unknown", cls: "muted", icon: "fa-circle-question", color: "#a8b1bd" },
};

const RANK: Record<Health, number> = { unknown: -1, ok: 0, warn: 1, crit: 2 };

/** Worst status of an already-classified set (server owns the thresholds). */
export function worstOf(list: Health[]): Health {
  return list.reduce<Health>((w, s) => (RANK[s] > RANK[w] ? s : w), "unknown");
}

export function domainCellStatus(services: ServiceSnap[], key: MetricKey) {
  return worstOf(services.map((s) => s.statuses[key]));
}

export function fmtMetric(key: MetricKey, v: number | null) {
  if (v == null) return "—";
  const m = METRICS.find((x) => x.key === key)!;
  return `${v}${m.unit}`;
}

export function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
