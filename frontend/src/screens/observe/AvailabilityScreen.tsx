import { Link } from "react-router-dom";
import { useSlos, useSynthetics } from "@/api/hooks";
import { useItsmList } from "@/api/itsm";
import { Breadcrumbs, Card } from "@/components/ui";
import { ago } from "@/lib/itsmFmt";
import { useServices, HEALTH_TONE } from "./observeMeta";

interface Check { id: number; name: string; kind: string; target: string; status: string; uptimePct: number | null; lastLatencyMs: number | null; lastChecked: string | null }

export default function AvailabilityScreen() {
  const { data: slos = [] } = useSlos();
  const { data: syn = [] } = useSynthetics();
  const { data: checks = [] } = useItsmList<Check>("/uptime/");
  const { services } = useServices();
  const svc = [...services].filter((s) => s.values.availability !== null).sort((a, b) => (a.values.availability ?? 0) - (b.values.availability ?? 0));

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Availability" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-heart-pulse" /><div><h1 className="page-title">Availability</h1>
        <div className="page-sub">SLO compliance, synthetic journeys, uptime checks and per-service availability in one place</div></div></div></div>
      <div className="kpi-strip">
        <div className={`kpi${slos.some((s) => s.actual < s.target) ? " tone-crit" : " tone-ok"}`}><div className="l">SLOs met</div><div className="v">{slos.filter((s) => s.actual >= s.target).length}/{slos.length}</div></div>
        <div className="kpi"><div className="l">Synthetics up</div><div className="v">{syn.filter((s) => s.status === "up").length}/{syn.length}</div></div>
        <div className={`kpi${checks.some((c) => c.status === "down") ? " tone-crit" : ""}`}><div className="l">Uptime checks up</div><div className="v">{checks.filter((c) => c.status === "up").length}/{checks.length}</div><div className="s">{checks.filter((c) => c.status === "unknown").length} not run yet</div></div>
        <div className="kpi"><div className="l">Services below 99.9%</div><div className="v">{svc.filter((s) => (s.values.availability ?? 100) < 99.9).length}</div></div>
      </div>
      <div className="grid-2">
        <Card title="SLOs" icon="fa-bullseye" bodyPad={false} right={<Link className="link-btn" to="/slos">Details</Link>}>
          <table className="list compact"><thead><tr><th>SLO</th><th>Target</th><th>Actual</th><th>Window</th></tr></thead>
            <tbody>{slos.map((s) => <tr key={s.id}><td><b>{s.name}</b><div className="cell-sub">{s.service}</div></td><td>{s.target}%</td>
              <td><span className={`pill ${s.actual >= s.target ? "ok" : "crit"}`}>{s.actual}%</span></td><td className="cell-sub">{s.window}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Synthetic journeys" icon="fa-globe" bodyPad={false} right={<Link className="link-btn" to="/synthetics">Details</Link>}>
          <table className="list compact"><thead><tr><th>Journey</th><th>Uptime</th><th>p95</th><th>Status</th></tr></thead>
            <tbody>{syn.map((s) => <tr key={s.id}><td><b>{s.name}</b><div className="cell-sub">{s.type} · {s.locations} locations</div></td><td>{s.uptime}%</td><td>{s.p95} ms</td>
              <td><span className={`pill ${s.status === "up" ? "ok" : s.status === "degraded" ? "warn" : "crit"}`}>{s.status}</span></td></tr>)}</tbody></table>
        </Card>
      </div>
      <div className="grid-2">
        <Card title="Uptime checks" icon="fa-stethoscope" bodyPad={false} right={<Link className="link-btn" to="/uptime">Run checks</Link>}>
          <table className="list compact"><thead><tr><th>Check</th><th>Status</th><th>Uptime</th><th>Last run</th></tr></thead>
            <tbody>{checks.map((c) => <tr key={c.id}><td><b>{c.name}</b><div className="cell-sub mono">{c.target}</div></td>
              <td><span className={`pill ${c.status === "up" ? "ok" : c.status === "down" ? "crit" : "muted"}`}>{c.status === "unknown" ? "not run" : c.status}</span></td>
              <td>{c.uptimePct === null ? "—" : `${c.uptimePct}%`}</td><td className="cell-sub">{ago(c.lastChecked)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Service availability (lowest first)" icon="fa-wave-square" bodyPad={false}>
          <table className="list compact"><thead><tr><th>Service</th><th>Domain</th><th>Availability</th></tr></thead>
            <tbody>{svc.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td className="cell-sub">{s.domainName}</td>
              <td><span className={`pill ${HEALTH_TONE[s.statuses.availability]}`}>{s.values.availability}%</span></td></tr>)}</tbody></table>
        </Card>
      </div>
    </div>
  );
}
