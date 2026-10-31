/** Small formatting helpers shared by the ITSM module screens. */
export const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));
export const pairs = (values: [string, string][]) => values.map(([value, label]) => ({ value, label }));

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : INR.format(Number(v)));

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function fmtDate(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** "in 12 days" / "3 days ago" / "today" */
export function relDays(date: string | null | undefined) {
  const n = daysUntil(date);
  if (n === null) return "";
  if (n === 0) return "today";
  return n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`;
}

export function dateTone(date: string | null | undefined, warnDays = 90): "ok" | "warn" | "crit" | "muted" {
  const n = daysUntil(date);
  if (n === null) return "muted";
  return n < 0 ? "crit" : n <= warnDays ? "warn" : "ok";
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
