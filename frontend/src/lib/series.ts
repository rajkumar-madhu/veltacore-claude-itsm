// Deterministic synthetic time-series for charts. There's no metrics store
// behind the demo backend, so history is generated from a seed string and
// always ends exactly on the live current value the API reports.

export type Range = "1h" | "6h" | "24h";
export const RANGE_LABEL: Record<Range, string> = { "1h": "Last 1 hour", "6h": "Last 6 hours", "24h": "Last 24 hours" };
const RANGE_MINUTES: Record<Range, number> = { "1h": 60, "6h": 360, "24h": 1440 };

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n points wandering around `end`, finishing exactly on it. */
export function series(seed: string, end: number, opts: { n?: number; jitter?: number; min?: number; max?: number } = {}) {
  const { n = 60, jitter = 0.12, min = 0, max = Infinity } = opts;
  const rand = rng(hashSeed(seed));
  const amp = Math.max(Math.abs(end) * jitter, 0.5);
  const out: number[] = [];
  let v = end + (rand() - 0.5) * amp * 2;
  for (let i = 0; i < n - 1; i++) {
    v += (rand() - 0.5) * amp * 0.9 + (end - v) * 0.08;
    if (rand() < 0.04) v += amp * (rand() * 1.6);
    out.push(Math.min(max, Math.max(min, v)));
  }
  out.push(end);
  return out;
}

export function pointsFor(range: Range) {
  return range === "1h" ? 60 : range === "6h" ? 72 : 96;
}

/** Evenly spaced HH:MM tick labels ending at "now". */
export function timeTicks(range: Range, count = 7) {
  const span = RANGE_MINUTES[range];
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now - span * 60_000 * (1 - i / (count - 1)));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  });
}

/** % change of the latest point vs. the average of the series' first half. */
export function trendPct(data: number[]) {
  const half = data.slice(0, Math.floor(data.length / 2));
  const avg = half.reduce((a, b) => a + b, 0) / (half.length || 1);
  if (!avg) return 0;
  return Math.round(((data[data.length - 1] - avg) / avg) * 100);
}

export function formatUptime(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} day${d === 1 ? "" : "s"}, ${h} hour${h === 1 ? "" : "s"}`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
