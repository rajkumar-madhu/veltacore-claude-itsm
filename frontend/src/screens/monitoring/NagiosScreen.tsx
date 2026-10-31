import React from "react";
import { Link } from "react-router-dom";
import { useDevices, useVms } from "@/api/hooks";
import { useItsmList } from "@/api/itsm";
import { Breadcrumbs, Card } from "@/components/ui";
import { IntegrationBanner } from "@/components/IntegrationBanner";
import { ago } from "@/lib/itsmFmt";

interface Alert { id: number; title: string; severity: string; status: string; target: string; source: string; startedAt: string }
interface Check { id: number; name: string; kind: string; target: string; status: string; lastChecked: string | null; lastError: string; lastLatencyMs: number | null }

type HostState = "UP" | "DOWN" | "UNREACHABLE";
type SvcState = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";
const HOST_TONE: Record<HostState, string> = { UP: "ok", DOWN: "crit", UNREACHABLE: "warn" };
const SVC_TONE: Record<SvcState, string> = { OK: "ok", WARNING: "warn", CRITICAL: "crit", UNKNOWN: "muted" };

interface Svc { host: string; name: string; state: SvcState; info: string; since: string | null; link: string }

/**
 * Nagios-style host/service view built from Argus's own inventory: devices and VMs are hosts, and
 * their open alerts plus uptime checks are services. When a real Nagios is connected under
 * Integrations, this is where its status would be merged in.
 */
export default function NagiosScreen() {
  const { data: devices = [] } = useDevices();
  const { data: vms = [] } = useVms();
  const { data: alerts = [] } = useItsmList<Alert>("/alerts/", {}, { refetchInterval: 30_000 });
  const { data: checks = [] } = useItsmList<Check>("/uptime/");
  const [filter, setFilter] = React.useState<"" | "problems">("");

  const open = alerts.filter((a) => a.status !== "resolved");
  const hosts = [
    ...devices.map((d) => ({ name: d.hostname, kind: d.deviceType.replace("_", " "), ip: d.ip, state: (d.status === "online" ? "UP" : "DOWN") as HostState, since: d.lastSeen, link: `/devices/${d.id}` })),
    ...vms.map((v) => ({ name: v.name, kind: `VM · ${v.platform}`, ip: v.ip, state: (v.state === "running" ? "UP" : v.state === "suspended" ? "UNREACHABLE" : "DOWN") as HostState, since: null, link: `/vms/${v.id}` })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const services: Svc[] = [
    ...open.map((a) => ({ host: a.target, name: a.title, state: (a.severity === "critical" ? "CRITICAL" : a.severity === "warning" ? "WARNING" : "OK") as SvcState,
      info: `${a.source}${a.status !== "firing" ? ` · ${a.status}` : ""}`, since: a.startedAt, link: "/alerts" })),
    ...checks.map((c) => ({ host: c.kind === "http" ? (() => { try { return new URL(c.target).host; } catch { return c.target; } })() : c.target.split(":")[0],
      name: `${c.kind.toUpperCase()} ${c.name}`, state: (c.status === "up" ? "OK" : c.status === "down" ? "CRITICAL" : "UNKNOWN") as SvcState,
      info: c.status === "up" ? `${Math.round(c.lastLatencyMs ?? 0)} ms` : c.lastError || (c.status === "paused" ? "paused" : "not run yet"), since: c.lastChecked, link: `/uptime?kind=${c.kind}` })),
  ];
  const svcFor = (host: string) => services.filter((s) => s.host.toLowerCase() === host.toLowerCase());
  const count = <T extends string>(xs: { state: T }[], s: T) => xs.filter((x) => x.state === s).length;
  const shownSvcs = filter === "problems" ? services.filter((s) => s.state !== "OK") : services;
  const order: SvcState[] = ["CRITICAL", "WARNING", "UNKNOWN", "OK"];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: "Nagios Status" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-table-list" /><div><h1 className="page-title">Host &amp; Service Status</h1>
          <div className="page-sub">Nagios-style status grid for every monitored host and service</div></div></div>
      </div>
      <div className="stack-gap"><IntegrationBanner name="Nagios" what="Showing hosts and services from Argus's own inventory, alerts and uptime checks." /></div>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <Card title="Host status totals">
          <div className="kpi-strip" style={{ margin: 0, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {(["UP", "DOWN", "UNREACHABLE"] as HostState[]).map((s) => <div key={s} className={`kpi tone-${HOST_TONE[s]}`}><div className="l">{s}</div><div className="v">{count(hosts, s)}</div></div>)}
          </div>
        </Card>
        <Card title="Service status totals">
          <div className="kpi-strip" style={{ margin: 0, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {order.map((s) => <div key={s} className={`kpi${count(services, s) && s !== "OK" ? ` tone-${SVC_TONE[s]}` : ""}`}><div className="l">{s}</div><div className="v">{count(services, s)}</div></div>)}
          </div>
        </Card>
      </div>

      <Card title={`Hosts (${hosts.length})`} icon="fa-server" className="mt">
        <div className="status-grid">
          {hosts.map((h) => {
            const svcs = svcFor(h.name);
            const worst = order.find((s) => svcs.some((x) => x.state === s));
            const tone = h.state !== "UP" ? HOST_TONE[h.state] : worst === "CRITICAL" ? "crit" : worst === "WARNING" ? "warn" : "ok";
            return (
              <Link key={h.link} to={h.link} className={`status-tile ${tone}`}>
                <div className="t">{h.name}</div>
                <div className="cell-sub">{h.kind} · <span className="mono">{h.ip}</span></div>
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span className={`pill ${HOST_TONE[h.state]}`}>{h.state}</span>
                  {order.filter((s) => s !== "OK").map((s) => count(svcs, s) ? <span key={s} className={`pill ${SVC_TONE[s]}`}>{count(svcs, s)} {s.toLowerCase()}</span> : null)}
                  {svcs.length > 0 && !svcs.some((s) => s.state !== "OK") && <span className="pill ok">{svcs.length} ok</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card title={`Services (${shownSvcs.length})`} icon="fa-list-check" className="mt" bodyPad={false} right={
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={!filter ? "active" : ""} onClick={() => setFilter("")}>All</button>
          <button className={filter ? "active" : ""} onClick={() => setFilter("problems")}>Problems only</button>
        </div>}>
        <div className="table-wrap"><table className="list compact">
          <thead><tr><th>Host</th><th>Service</th><th>Status</th><th>Last check / since</th><th>Status information</th></tr></thead>
          <tbody>
            {[...shownSvcs].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.host.localeCompare(b.host)).map((s, i) => (
              <tr key={`${s.host}-${s.name}-${i}`}>
                <td className="mono">{s.host}</td><td><Link className="link" to={s.link}>{s.name}</Link></td>
                <td><span className={`pill ${SVC_TONE[s.state]}`}>{s.state}</span></td>
                <td className="cell-sub">{ago(s.since)}</td><td className="cell-sub">{s.info}</td>
              </tr>
            ))}
            {!shownSvcs.length && <tr><td colSpan={5} className="empty-row">No service problems.</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
