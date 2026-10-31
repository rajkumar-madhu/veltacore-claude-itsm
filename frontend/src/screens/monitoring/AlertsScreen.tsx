import React from "react";
import { Link, useNavigate } from "react-router-dom";
import ResourcePage, { type ActionCtx, type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { SeverityPill } from "@/components/itsmBadges";
import { Card, Modal } from "@/components/ui";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { useToast } from "@/lib/useToast";
import { ago, opts, pairs } from "@/lib/itsmFmt";

interface Alert extends Row {
  id: number; fingerprint: string; title: string; severity: string; status: string; source: string; target: string; rule: string;
  labels: Record<string, string>; startedAt: string; acknowledgedBy: string; acknowledgedAt: string | null; resolvedAt: string | null;
  silencedUntil: string | null; ticket: number | null; ticketNumber: string | null;
}
interface Stats { bySeverity: Record<string, number>; byStatus: Record<string, number>; bySource: Record<string, number>; last24h: number }

const STATUS = pairs([["firing", "Firing"], ["acknowledged", "Acknowledged"], ["silenced", "Silenced"], ["resolved", "Resolved"]]);
const STATUS_TONE: Record<string, string> = { firing: "crit", acknowledged: "warn", silenced: "muted", resolved: "ok" };
const SEV = pairs([["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]]);

export default function AlertsScreen() {
  const navigate = useNavigate();
  const { data: stats } = useItsmGet<Stats>("/alerts/stats/", { refetchInterval: 30_000 });
  const [silencing, setSilencing] = React.useState<Alert | null>(null);
  const [hours, setHours] = React.useState("2");
  const [testing, setTesting] = React.useState(false);
  const [toast, setToast] = useToast();
  const silence = useItsmMutation<{ id: number; hours: number }>("POST", (v) => `/alerts/${v.id}/silence/`, (v) => ({ hours: v.hours }));
  const ingest = useItsmMutation<Record<string, unknown>, Alert & { automation: { runbook: string; status: string }[] }>("POST", () => "/alerts/");
  const [test, setTest] = React.useState({ title: "", severity: "warning", target: "", source: "manual", rule: "" });

  const act = (verb: string, past: string) => (r: Alert, ctx: ActionCtx) =>
    ctx.post(`/alerts/${r.id}/${verb}/`).then(() => ctx.toast("ok", `${r.title} ${past}`)).catch((e: Error) => ctx.toast("err", e.message));

  const cfg: ResourceConfig<Alert> = {
    title: "Alert Manager", subtitle: "Every alert from Prometheus, SNMP, hardware and uptime checks — deduplicated by fingerprint", icon: "fa-bell",
    crumbs: [{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: "Alert Manager" }],
    path: "/alerts/", refetchInterval: 30_000, label: (r) => r.title,
    search: (r) => `${r.title} ${r.target} ${r.rule} ${r.source} ${r.fingerprint} ${Object.values(r.labels ?? {}).join(" ")}`,
    headerActions: () => <button className="btn" onClick={() => setTesting(true)}><i className="fa-solid fa-paper-plane" /> Send test alert</button>,
    kpis: () => [
      { label: "Firing", value: stats?.byStatus.firing ?? 0, tone: stats?.byStatus.firing ? "crit" : "ok", sub: `${stats?.bySeverity.critical ?? 0} critical · ${stats?.bySeverity.warning ?? 0} warning` },
      { label: "Acknowledged", value: stats?.byStatus.acknowledged ?? 0 },
      { label: "Silenced", value: stats?.byStatus.silenced ?? 0 },
      { label: "Started in last 24h", value: stats?.last24h ?? 0 },
    ],
    aboveTable: () => stats && Object.keys(stats.bySource).length ? (
      <div className="card" style={{ padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
        <span className="cell-sub">Active by source:</span>
        {Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => <span key={s} className="pill muted">{s} · {n}</span>)}
      </div>
    ) : null,
    filters: [
      { key: "status", label: "Status", options: STATUS },
      { key: "severity", label: "Severity", options: SEV },
      { key: "source", label: "Source" },
      { key: "open", label: "Open", options: pairs([["open", "Open only"], ["done", "Resolved only"]]), match: (r, v) => (v === "open" ? r.status !== "resolved" : r.status === "resolved") },
    ],
    columns: [
      { key: "severity", label: "Severity", render: (r) => <SeverityPill s={r.severity} />, sortValue: (r) => ["critical", "warning", "info"].indexOf(r.severity) },
      { key: "title", label: "Alert", render: (r) => <><b>{r.title}</b><div className="cell-sub">{r.rule || r.fingerprint}</div></> },
      { key: "target", label: "Target", render: (r) => <span className="mono">{r.target}</span> },
      { key: "source", label: "Source" },
      { key: "status", label: "Status", render: (r) => <><span className={`pill ${STATUS_TONE[r.status]}`}>{STATUS.find((s) => s.value === r.status)?.label}</span>
        {r.status === "acknowledged" && <div className="cell-sub">by {r.acknowledgedBy}</div>}
        {r.status === "silenced" && r.silencedUntil && <div className="cell-sub">until {new Date(r.silencedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}</> },
      { key: "startedAt", label: "Started", render: (r) => <span className="cell-sub">{ago(r.startedAt)}</span> },
      { key: "ticketNumber", label: "Incident", render: (r) => (r.ticket ? <Link className="link mono" onClick={(e) => e.stopPropagation()} to={`/tickets/${r.ticket}`}>{r.ticketNumber}</Link> : <span className="cell-sub">—</span>) },
    ],
    rowActions: [
      { label: "Acknowledge", icon: "fa-check", show: (r) => r.status === "firing", run: act("acknowledge", "acknowledged") },
      { label: "Silence", icon: "fa-bell-slash", show: (r) => r.status !== "resolved", run: (r) => { setHours("2"); setSilencing(r); } },
      { label: "Create incident", icon: "fa-fire", show: (r) => !r.ticket, run: (r, ctx) => ctx.post(`/alerts/${r.id}/create-incident/`)
        .then((t) => { const tk = t as { id: number; number: string }; ctx.toast("ok", `${tk.number} created`); navigate(`/tickets/${tk.id}`); })
        .catch((e: Error) => ctx.toast("err", e.message)) },
      { label: "Resolve", icon: "fa-circle-check", show: (r) => r.status !== "resolved", run: act("resolve", "resolved") },
    ],
  };

  function sendTest() {
    const fingerprint = `manual-${test.target || "test"}-${test.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64);
    ingest.mutate({ ...test, fingerprint, labels: { origin: "argus-ui" } }, {
      onSuccess: (a) => {
        setTesting(false);
        const runs = a.automation?.length ? ` · triggered ${a.automation.map((x) => x.runbook).join(", ")}` : "";
        setToast({ kind: "ok", text: `Alert ingested${runs}` });
      },
    });
  }

  return (
    <>
      <ResourcePage cfg={cfg} />
      <div className="page" style={{ paddingTop: 0 }}>
        <Card title="Ingest alerts from your tools" icon="fa-plug">
          <p className="cell-sub" style={{ marginTop: 0 }}>POST alerts as JSON. Alerts with the same <span className="mono">fingerprint</span> update the existing alert instead of duplicating it, and matching automation workflows run on every firing alert.</p>
          <pre className="code-block">{`curl -X POST ${window.location.origin}/api/itsm/alerts/ \\
  -H 'Content-Type: application/json' \\
  -d '{"fingerprint":"disk-vm-app-01","title":"Disk / above 90%","severity":"warning",
       "source":"prometheus","target":"VM-APP-01","rule":"NodeDiskFull","labels":{"team":"infra"}}'`}</pre>
        </Card>
      </div>

      {silencing && (
        <Modal title={`Silence: ${silencing.title}`} onClose={() => setSilencing(null)} footer={<>
          <button className="btn" onClick={() => setSilencing(null)}>Cancel</button>
          <button className="btn primary" disabled={silence.isPending} onClick={() => silence.mutate({ id: silencing.id, hours: Number(hours) }, {
            onSuccess: () => { setToast({ kind: "ok", text: `Silenced for ${hours}h` }); setSilencing(null); },
          })}>Silence</button>
        </>}>
          <label className="field"><span>Duration</span>
            <select value={hours} onChange={(e) => setHours(e.target.value)}>{["1", "2", "4", "8", "24", "72"].map((h) => <option key={h} value={h}>{h} hour{h === "1" ? "" : "s"}</option>)}</select></label>
          {silence.error && <div className="field-error">{silence.error.message}</div>}
        </Modal>
      )}
      {testing && (
        <Modal title="Send test alert" onClose={() => setTesting(false)} footer={<>
          <button className="btn" onClick={() => setTesting(false)}>Cancel</button>
          <button className="btn primary" disabled={!test.title.trim() || !test.target.trim() || ingest.isPending} onClick={sendTest}>Send</button>
        </>}>
          <p className="modal-text">Creates a real alert through the ingestion API, exactly as an external tool would.</p>
          <label className="field"><span>Title *</span><input value={test.title} onChange={(e) => setTest({ ...test, title: e.target.value })} placeholder="CPU above 90% on VM-APP-01" /></label>
          <div className="field-row">
            <label className="field"><span>Severity</span><select value={test.severity} onChange={(e) => setTest({ ...test, severity: e.target.value })}>{SEV.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
            <label className="field"><span>Source</span><select value={test.source} onChange={(e) => setTest({ ...test, source: e.target.value })}>{opts(["manual", "prometheus", "snmp", "blackbox", "vsphere", "kubernetes"]).map((s) => <option key={s.value}>{s.value}</option>)}</select></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Target *</span><input value={test.target} onChange={(e) => setTest({ ...test, target: e.target.value })} placeholder="VM-APP-01" /></label>
            <label className="field"><span>Rule</span><input value={test.rule} onChange={(e) => setTest({ ...test, rule: e.target.value })} placeholder="HighCpu" /></label>
          </div>
          {ingest.error && <div className="field-error">{ingest.error.message}</div>}
        </Modal>
      )}
      {toast}
    </>
  );
}
