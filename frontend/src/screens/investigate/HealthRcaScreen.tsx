import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { PriorityBadge, SeverityPill, StatePill } from "@/components/itsmBadges";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";
import type { MetricKey } from "@/api/hooks";
import { HEALTH_LABEL, HEALTH_TONE, useServices } from "@/screens/observe/observeMeta";

interface Rca {
  service: { id: number; name: string; host: string; domain: string; health: "ok" | "warn" | "crit" | "unknown"; values: Record<MetricKey, number | null>; statuses: Record<MetricKey, "ok" | "warn" | "crit" | "unknown"> };
  causes: { kind: string; confidence: "high" | "medium" | "low"; text: string }[];
  alerts: { id: number; title: string; severity: string; status: string; source: string; startedAt: string }[];
  incidents: { id: number; number: string; title: string; priority: string; state: string }[];
  changes: { id: number; number: string; title: string; priority: string; state: string }[];
  dependencies: { name: string; ciClass: string; status: string }[];
  events: { ts: string; level?: string; severity?: string; message: string }[];
}
const KIND_ICON: Record<string, string> = { metric: "fa-chart-line", change: "fa-code-pull-request", alert: "fa-bell", dependency: "fa-diagram-project", event: "fa-list" };
const CONF_TONE: Record<string, string> = { high: "crit", medium: "warn", low: "muted" };
const LABELS: Record<MetricKey, string> = { availability: "Availability %", responseMs: "Response ms", errorRate: "Error %", latencyP95Ms: "p95 ms", cpuPct: "CPU %", memPct: "Memory %", diskPct: "Disk %", netPct: "Network %" };

export default function HealthRcaScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sid = params.get("service") ?? "";
  const { services } = useServices();
  const { data: r, isError, isLoading, refetch } = useItsmGet<Rca>(sid ? `/health-rca/?service=${sid}` : null);
  const problem = useItsmMutation<Record<string, unknown>, { id: number; number: string }>("POST", () => "/tickets/");
  const [toast, setToast] = useToast();
  const sorted = [...services].sort((a, b) => ["crit", "warn", "unknown", "ok"].indexOf(a.health) - ["crit", "warn", "unknown", "ok"].indexOf(b.health));

  function raiseProblem() {
    if (!r) return;
    problem.mutate({
      ticketType: "problem", title: `Investigate ${r.service.name} (${HEALTH_LABEL[r.service.health].toLowerCase()})`, priority: r.service.health === "crit" ? "P2" : "P3",
      category: "Problem", assignmentGroup: "Problem Mgmt",
      description: `Raised from Health / RCA for ${r.service.name} on ${r.service.host}.\n\nProbable causes:\n${r.causes.map((c) => `- [${c.confidence}] ${c.text}`).join("\n")}\n\nRelated incidents: ${r.incidents.map((i) => i.number).join(", ") || "none"}`,
    }, { onSuccess: (t) => navigate(`/tickets/${t.id}`), onError: (e) => setToast({ kind: "err", text: e.message }) });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Investigate" }, { label: "Health / RCA" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-magnifying-glass-chart" /><div><h1 className="page-title">Health &amp; Root-Cause Analysis</h1>
          <div className="page-sub">Correlates a service's signals with alerts, incidents, recent changes and dependencies</div></div></div>
        <select className="select-sm" aria-label="Service" value={sid} onChange={(e) => setParams(e.target.value ? { service: e.target.value } : {})} style={{ minWidth: 260 }}>
          <option value="">Choose a service…</option>{sorted.map((s) => <option key={s.id} value={s.id}>{s.health === "ok" ? "" : s.health === "crit" ? "● " : "◐ "}{s.name} · {s.domainName}</option>)}
        </select>
      </div>
      {!sid ? (
        <Card title="Services needing attention" icon="fa-triangle-exclamation">
          <div className="status-grid">{sorted.filter((s) => s.health !== "ok").map((s) => (
            <button key={s.id} className={`status-tile ${HEALTH_TONE[s.health]}`} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => setParams({ service: String(s.id) })}>
              <div className="t">{s.name}</div><div className="cell-sub">{s.domainName} · {s.host}</div><span className={`pill ${HEALTH_TONE[s.health]}`} style={{ marginTop: 6 }}>{HEALTH_LABEL[s.health]}</span></button>
          ))}{!sorted.some((s) => s.health !== "ok") && <div className="cell-sub">Every service is healthy.</div>}</div>
        </Card>
      ) : isError ? <ApiDown what="the analysis" retry={() => refetch()} /> : isLoading || !r ? <div className="loading">Analysing…</div> : <>
        <div className={`banner ${r.service.health === "ok" ? "ok" : r.service.health === "warn" ? "warn" : "err"}`} style={{ marginBottom: 14 }}>
          <i className={`fa-solid ${r.service.health === "ok" ? "fa-circle-check" : "fa-triangle-exclamation"}`} />
          <div style={{ flex: 1 }}><b>{r.service.name} is {HEALTH_LABEL[r.service.health].toLowerCase()}</b><div>{r.service.domain} · runs on <span className="mono">{r.service.host}</span> · {r.causes.length} contributing factor{r.causes.length === 1 ? "" : "s"}</div></div>
          <Link className="btn sm" to={`/act/remediation?service=${r.service.id}`}><i className="fa-solid fa-screwdriver-wrench" /> Remediate</Link>
          {r.service.health !== "ok" && <button className="btn sm primary" disabled={problem.isPending} onClick={raiseProblem}><i className="fa-solid fa-bug" /> Raise problem</button>}
        </div>
        <div className="status-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", marginBottom: 14 }}>
          {(Object.keys(LABELS) as MetricKey[]).map((k) => (
            <div key={k} className={`status-tile ${HEALTH_TONE[r.service.statuses[k]]}`}><div className="cell-sub">{LABELS[k]}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{r.service.values[k] ?? "—"}</div></div>
          ))}
        </div>
        <div className="ticket-grid" style={{ marginTop: 0 }}>
          <div className="stack">
            <Card title="Probable causes (most likely first)" icon="fa-list-ol">
              {!r.causes.length ? <div className="cell-sub">No contributing factors found.</div> : <ul className="result-steps">{r.causes.map((c, i) => (
                <li key={i}><i className={`fa-solid ${KIND_ICON[c.kind] ?? "fa-circle"}`} style={{ color: "var(--muted)" }} /><div style={{ flex: 1 }}>{c.text}<div className="cell-sub">{c.kind}</div></div><span className={`pill ${CONF_TONE[c.confidence]}`}>{c.confidence}</span></li>
              ))}</ul>}
            </Card>
            <Card title={`Alerts (${r.alerts.length})`} icon="fa-bell" bodyPad={false}>
              <table className="list compact"><tbody>{r.alerts.map((a) => <tr key={a.id}><td><SeverityPill s={a.severity} /></td><td><b>{a.title}</b><div className="cell-sub">{a.source} · {a.status}</div></td><td className="cell-sub">{ago(a.startedAt)}</td></tr>)}
                {!r.alerts.length && <tr><td className="empty-row">No related alerts in the last 24h.</td></tr>}</tbody></table>
            </Card>
          </div>
          <div className="stack">
            <Card title="Incidents" icon="fa-fire">{r.incidents.length ? <ul className="stat-list">{r.incidents.map((t) => <li key={t.id}><Link className="link" to={`/tickets/${t.id}`}>{t.number}</Link><span><PriorityBadge p={t.priority} /> <StatePill state={t.state} /></span></li>)}</ul> : <div className="cell-sub">None open.</div>}</Card>
            <Card title="Recent changes" icon="fa-code-pull-request">{r.changes.length ? <ul className="stat-list">{r.changes.map((t) => <li key={t.id}><span><Link className="link" to={`/tickets/${t.id}`}>{t.number}</Link><div className="cell-sub">{t.title}</div></span><StatePill state={t.state} /></li>)}</ul> : <div className="cell-sub">No recent changes.</div>}</Card>
            <Card title="Dependencies" icon="fa-diagram-project">{r.dependencies.length ? <ul className="stat-list">{r.dependencies.map((d) => <li key={d.name}><span>{d.name}<div className="cell-sub">{d.ciClass}</div></span><span className={`pill ${d.status === "operational" ? "ok" : "warn"}`}>{d.status}</span></li>)}</ul> : <div className="cell-sub">No dependencies in the CMDB.</div>}</Card>
          </div>
        </div>
      </>}
      {toast}
    </div>
  );
}
