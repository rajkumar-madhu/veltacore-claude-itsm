import { Link } from "react-router-dom";
import { useDevices, useExporters } from "@/api/hooks";
import { useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { SeverityPill } from "@/components/itsmBadges";
import { ago } from "@/lib/itsmFmt";
import { formatUptime } from "@/lib/series";

const NET_TYPES = new Set(["switch", "router", "firewall", "load_balancer", "wireless"]);
const LABEL: Record<string, string> = { switch: "Switches", router: "Routers", firewall: "Firewalls", load_balancer: "Load balancers", wireless: "Wireless" };
interface Alert { id: number; title: string; severity: string; status: string; target: string; source: string; startedAt: string }

export default function NetworkScreen() {
  const { data: devices = [], isError, isLoading, refetch } = useDevices();
  const { data: exporters = [] } = useExporters();
  const { data: alerts = [] } = useItsmList<Alert>("/alerts/", { status: "firing" });
  const net = devices.filter((d) => NET_TYPES.has(d.deviceType));
  const names = new Set(net.map((d) => d.hostname.toLowerCase()));
  const netAlerts = alerts.filter((a) => names.has(a.target.toLowerCase()) || a.source === "snmp");
  const netExp = exporters.filter((e) => e.category === "network" || e.category === "firewalls" || e.category === "wireless");

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Network" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-network-wired" /><div><h1 className="page-title">Network</h1>
        <div className="page-sub">Switching, routing, security and wireless devices with their collectors and active alerts</div></div></div></div>
      {isError ? <ApiDown what="devices" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <div className="kpi-strip">
          {[...NET_TYPES].map((t) => {
            const ds = net.filter((d) => d.deviceType === t);
            return <Link key={t} to={`/devices?type=${t}`} className={`kpi${ds.some((d) => d.status !== "online") ? " tone-crit" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="l">{LABEL[t]}</div><div className="v">{ds.filter((d) => d.status === "online").length}/{ds.length}</div><div className="s">online</div></Link>;
          })}
        </div>
        <div className="grid-2">
          <Card title={`Devices (${net.length})`} icon="fa-network-wired" bodyPad={false}>
            <div className="table-wrap"><table className="list compact">
              <thead><tr><th>Device</th><th>Type</th><th>IP</th><th>Status</th><th>Uptime</th></tr></thead>
              <tbody>{net.map((d) => (
                <tr key={d.id}><td><Link className="link cell-strong" to={`/devices/${d.id}`}>{d.hostname}</Link><div className="cell-sub">{d.vendor} {d.model}</div></td>
                  <td>{LABEL[d.deviceType]?.replace(/s$/, "")}</td><td className="mono">{d.ip}</td>
                  <td><span className={`pill ${d.status === "online" ? "ok" : "crit"}`}>{d.status}</span></td><td className="cell-sub">{formatUptime(d.uptimeSeconds)}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
          <Card title={`Firing network alerts (${netAlerts.length})`} icon="fa-bell" bodyPad={false} right={<Link className="link-btn" to="/alerts">Alert Manager</Link>}>
            <div className="table-wrap"><table className="list compact"><tbody>
              {netAlerts.map((a) => <tr key={a.id}><td><SeverityPill s={a.severity} /></td><td><b>{a.title}</b><div className="cell-sub">{a.target} · {a.source}</div></td><td className="cell-sub">{ago(a.startedAt)}</td></tr>)}
              {!netAlerts.length && <tr><td className="empty-row">No firing network alerts.</td></tr>}
            </tbody></table></div>
          </Card>
        </div>
        <Card title={`Network collectors (${netExp.length})`} icon="fa-satellite-dish" className="mt" bodyPad={false} right={<Link className="link-btn" to="/exporters">Exporters</Link>}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Exporter</th><th>Type</th><th>Target</th><th>Status</th><th>Last seen</th><th>Logs 24h</th></tr></thead>
            <tbody>{netExp.map((e) => (
              <tr key={e.id}><td><b>{e.name}</b></td><td>{e.exporterType}</td><td className="mono">{e.target}</td>
                <td><span className={`pill ${e.status === "active" ? "ok" : e.status === "error" ? "crit" : "muted"}`}>{e.status.replace("_", " ")}</span></td>
                <td className="cell-sub">{ago(e.lastSeen)}</td><td>{e.logs24h}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      </>}
    </div>
  );
}
