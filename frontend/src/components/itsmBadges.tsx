import { stateLabel } from "@/lib/status";
const STATE_TONE: Record<string, string> = {
  new: "info", submitted: "info", draft: "muted", in_progress: "warn", investigating: "warn", assess: "warn", fulfilling: "warn",
  on_hold: "muted", known_error: "warn", approved: "info", scheduled: "info", implemented: "ok", resolved: "ok", fulfilled: "ok",
  closed: "muted", cancelled: "muted", rejected: "crit",
};


export function StatePill({ state }: { state: string }) {
  return <span className={`pill ${STATE_TONE[state] ?? "muted"}`}>{stateLabel(state)}</span>;
}

export function PriorityBadge({ p }: { p: string }) {
  return <span className={`prio ${p}`}>{p}</span>;
}

const SLA: Record<string, [string, string]> = {
  breached: ["crit", "Breached"], at_risk: ["warn", "At risk"], on_track: ["ok", "On track"], met: ["ok", "Met"], none: ["muted", "—"],
};

export function SlaBadge({ s }: { s: string }) {
  const [cls, label] = SLA[s] ?? SLA.none;
  return s === "none" ? <span className="muted-text">—</span> : <span className={`pill ${cls}`}><i className={`fa-solid ${s === "breached" ? "fa-fire" : "fa-clock"}`} /> {label}</span>;
}

export function SeverityPill({ s }: { s: string }) {
  const map: Record<string, [string, string]> = { critical: ["crit", "fa-circle-xmark"], warning: ["warn", "fa-triangle-exclamation"], info: ["info", "fa-circle-info"] };
  const [cls, icon] = map[s] ?? ["muted", "fa-circle"];
  return <span className={`pill ${cls}`}><i className={`fa-solid ${icon}`} /> {s[0].toUpperCase() + s.slice(1)}</span>;
}
