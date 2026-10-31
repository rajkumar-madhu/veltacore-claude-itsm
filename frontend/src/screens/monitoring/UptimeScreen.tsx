import React from "react";
import { useSearchParams } from "react-router-dom";
import ResourcePage, { type ActionCtx, type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { useItsmMutation } from "@/api/itsm";
import { ago, pairs } from "@/lib/itsmFmt";

interface Check extends Row {
  id: number; name: string; kind: "http" | "tcp"; target: string; expectedStatus: number; intervalSec: number; timeoutSec: number;
  status: string; lastChecked: string | null; lastLatencyMs: number | null; lastError: string; tags: string;
  history: { ts: string; ok: boolean; ms: number | null }[]; uptimePct: number | null;
}

const KIND_META = {
  http: { title: "URL Checker", icon: "fa-globe", sub: "HTTP(S) endpoint checks with expected status codes", label: "URL check" },
  tcp: { title: "Telnet Monitoring", icon: "fa-terminal", sub: "TCP port reachability (telnet-style host:port checks)", label: "TCP check" },
  all: { title: "Uptime Checks", icon: "fa-heart-pulse", sub: "All HTTP and TCP checks with uptime over the last 60 runs", label: "Check" },
};
const STATUS_TONE: Record<string, string> = { up: "ok", down: "crit", unknown: "muted", paused: "muted" };

function Spark({ h }: { h: Check["history"] }) {
  const cells = [...Array(Math.max(0, 30 - h.length)).fill(null), ...h.slice(-30)];
  return <span className="spark" title={`${h.length} recorded runs`}>{cells.map((x, i) => (
    <i key={i} className={x === null ? "none" : x.ok ? "" : "down"} style={{ height: x === null ? 6 : x.ok ? 8 + Math.min(14, (x.ms ?? 0) / 25) : 22 }} />
  ))}</span>;
}

export default function UptimeScreen() {
  const [params] = useSearchParams();
  const kind = (params.get("kind") === "http" || params.get("kind") === "tcp" ? params.get("kind") : "all") as "http" | "tcp" | "all";
  const m = KIND_META[kind];
  const [auto, setAuto] = React.useState(false);
  const runAll = useItsmMutation<void, { ran: number; up: number }>("POST", () => "/uptime/run-all/", () => ({}));

  React.useEffect(() => {
    if (!auto) return;
    runAll.mutate();
    const t = window.setInterval(() => runAll.mutate(), 60_000);
    return () => window.clearInterval(t);
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (r: Check, ctx: ActionCtx) => ctx.post(`/uptime/${r.id}/run/`).then((res) => {
    const x = (res as { result: { ok: boolean; ms: number | null; error: string; code: number | null } }).result;
    ctx.toast(x.ok ? "ok" : "err", x.ok ? `${r.name} is up · ${x.ms} ms${x.code ? ` · HTTP ${x.code}` : ""}` : `${r.name} is down: ${x.error}`);
  }).catch((e: Error) => ctx.toast("err", e.message));

  const cfg: ResourceConfig<Check> = {
    title: m.title, subtitle: m.sub, icon: m.icon,
    crumbs: [{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: m.title }],
    path: "/uptime/", params: { kind: kind === "all" ? undefined : kind }, refetchInterval: auto ? 15_000 : undefined,
    createLabel: m.label, canDelete: true,
    defaults: { kind: kind === "all" ? "http" : kind, expectedStatus: 200, intervalSec: 60, timeoutSec: 5 },
    search: (r) => `${r.name} ${r.target} ${r.tags}`,
    headerActions: (ctx) => <>
      <label className="btn" style={{ cursor: "pointer" }} title="Runs every check once a minute while this page is open">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-run every 60s
      </label>
      <button className="btn" disabled={runAll.isPending} onClick={() => runAll.mutate(undefined, {
        onSuccess: (r) => ctx.toast(r.up === r.ran ? "ok" : "err", `Ran ${r.ran} checks · ${r.up} up, ${r.ran - r.up} down`),
        onError: (e) => ctx.toast("err", e.message),
      })}>{runAll.isPending ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-play" />} Run all now</button>
    </>,
    kpis: (rows) => {
      const live = rows.filter((r) => r.status !== "paused");
      const withPct = rows.filter((r) => r.uptimePct !== null);
      const lat = rows.filter((r) => r.lastLatencyMs !== null);
      return [
        { label: "Up", value: `${rows.filter((r) => r.status === "up").length} / ${live.length}`, tone: live.length && live.every((r) => r.status === "up") ? "ok" : undefined },
        { label: "Down", value: rows.filter((r) => r.status === "down").length, tone: rows.some((r) => r.status === "down") ? "crit" : undefined },
        { label: "Avg uptime", value: withPct.length ? `${(withPct.reduce((s, r) => s + (r.uptimePct ?? 0), 0) / withPct.length).toFixed(2)}%` : "—", sub: withPct.length ? undefined : "no runs yet — press Run all" },
        { label: "Avg latency", value: lat.length ? `${Math.round(lat.reduce((s, r) => s + (r.lastLatencyMs ?? 0), 0) / lat.length)} ms` : "—" },
      ];
    },
    filters: [
      { key: "status", label: "Status", options: pairs([["up", "Up"], ["down", "Down"], ["unknown", "Not run yet"], ["paused", "Paused"]]) },
      ...(kind === "all" ? [{ key: "kind", label: "Type", options: pairs([["http", "HTTP(S)"], ["tcp", "TCP"]]) }] : []),
    ],
    columns: [
      { key: "status", label: "Status", render: (r) => <span className={`pill ${STATUS_TONE[r.status]}`}>{r.status === "unknown" ? "Not run" : r.status[0].toUpperCase() + r.status.slice(1)}</span> },
      { key: "name", label: "Check", render: (r) => <><b>{r.name}</b><div className="cell-sub mono">{r.target}</div></> },
      ...(kind === "all" ? [{ key: "kind", label: "Type", render: (r: Check) => (r.kind === "http" ? "HTTP" : "TCP") }] : []),
      { key: "history", label: "Last 30 runs", render: (r) => <Spark h={r.history} /> },
      { key: "uptimePct", label: "Uptime", sortValue: (r) => r.uptimePct ?? -1, render: (r) => (r.uptimePct === null ? "—" : <b className={r.uptimePct < 99 ? "warn-text" : ""}>{r.uptimePct}%</b>) },
      { key: "lastLatencyMs", label: "Latency", sortValue: (r) => r.lastLatencyMs ?? -1, render: (r) => (r.lastLatencyMs === null ? "—" : `${Math.round(r.lastLatencyMs)} ms`) },
      { key: "lastChecked", label: "Last check", render: (r) => <><span className="cell-sub">{ago(r.lastChecked)}</span>{r.lastError && <div className="field-error" style={{ fontSize: 11.5 }}>{r.lastError}</div>}</> },
    ],
    rowActions: [
      { label: "Run now", icon: "fa-play", show: (r) => r.status !== "paused", run },
      { label: "Pause / resume", icon: "fa-pause", run: (r, ctx) => ctx.post(`/uptime/${r.id}/pause/`).then(() => ctx.toast("ok", `${r.name} ${r.status === "paused" ? "resumed" : "paused"}`)).catch((e: Error) => ctx.toast("err", e.message)) },
    ],
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "kind", label: "Type", type: "select", options: pairs([["http", "HTTP(S)"], ["tcp", "TCP / Telnet"]]), required: true },
      { key: "target", label: "Target", required: true, wide: true, placeholder: kind === "tcp" ? "10.20.1.15:5672" : "https://example.com/health", help: "URL for HTTP checks, host:port for TCP checks. Private and public hosts are allowed; link-local addresses are blocked." },
      { key: "expectedStatus", label: "Expected HTTP status", type: "number", min: 100, max: 599 },
      { key: "timeoutSec", label: "Timeout (s)", type: "number", min: 1, max: 30 },
      { key: "intervalSec", label: "Interval (s)", type: "number", min: 30, max: 3600 },
      { key: "tags", label: "Tags", placeholder: "prod,api" },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
