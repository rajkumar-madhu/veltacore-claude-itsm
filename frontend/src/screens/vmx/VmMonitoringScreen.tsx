import React from "react";
import { Link } from "react-router-dom";
import { useVms } from "@/api/hooks";
import { useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, Meter } from "@/components/ui";
import { SeverityPill } from "@/components/itsmBadges";
import { VM_STATE_PILL } from "@/lib/status";
import { ago } from "@/lib/itsmFmt";

interface Alert { id: number; title: string; severity: string; status: string; target: string; startedAt: string }
const tone = (v: number, w: number, c: number) => (v >= c ? "var(--crit)" : v >= w ? "#f59e0b" : "var(--ok)");

export default function VmMonitoringScreen() {
  const { data = [], isError, isLoading, refetch } = useVms();
  const { data: alerts = [] } = useItsmList<Alert>("/alerts/", {}, { refetchInterval: 30_000 });
  const [sort, setSort] = React.useState<"cpuPct" | "memPct" | "diskPct">("cpuPct");
  const names = new Set(data.map((v) => v.name.toLowerCase()));
  const vmAlerts = alerts.filter((a) => a.status !== "resolved" && names.has(a.target.toLowerCase()));
  const rows = [...data].sort((a, b) => b[sort] - a[sort]);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines" }, { label: "VM Monitoring" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-chart-line" /><div><h1 className="page-title">VM Monitoring</h1>
        <div className="page-sub">Live CPU, memory and disk utilisation against thresholds (warn 70/70/75%, critical 85/85/90%)</div></div></div>
        <div className="seg">{([["cpuPct", "CPU"], ["memPct", "Memory"], ["diskPct", "Disk"]] as const).map(([k, l]) => <button key={k} className={sort === k ? "active" : ""} onClick={() => setSort(k)}>Sort by {l}</button>)}</div>
      </div>
      {isError ? <ApiDown what="VMs" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <div className="kpi-strip">
          {([["cpuPct", "CPU ≥ 85%", 85], ["memPct", "Memory ≥ 85%", 85], ["diskPct", "Disk ≥ 90%", 90]] as const).map(([k, l, c]) => {
            const n = data.filter((v) => v[k] >= c).length;
            return <div key={k} className={`kpi${n ? " tone-crit" : " tone-ok"}`}><div className="l">{l}</div><div className="v">{n}</div></div>;
          })}
          <div className={`kpi${vmAlerts.length ? " tone-warn" : ""}`}><div className="l">Open VM alerts</div><div className="v">{vmAlerts.length}</div></div>
        </div>
        <Card title="Utilisation" icon="fa-gauge" bodyPad={false}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>VM</th><th>State</th><th>CPU</th><th>Memory</th><th>Disk</th><th>Alerts</th></tr></thead>
            <tbody>{rows.map((v) => {
              const al = vmAlerts.filter((a) => a.target.toLowerCase() === v.name.toLowerCase());
              return (
                <tr key={v.id}><td><Link className="link cell-strong" to={`/vms/${v.id}`}>{v.name}</Link><div className="cell-sub">{v.platform} · {v.host}</div></td>
                  <td><span className={`pill ${VM_STATE_PILL[v.state].cls}`}>{VM_STATE_PILL[v.state].label}</span></td>
                  {([["cpuPct", 70, 85], ["memPct", 70, 85], ["diskPct", 75, 90]] as const).map(([k, w, c]) => (
                    <td key={k} style={{ minWidth: 140 }}><div className="cell-sub">{Math.round(v[k])}%</div><Meter pct={v[k]} color={tone(v[k], w, c)} /></td>))}
                  <td>{al.length ? al.map((a) => <div key={a.id}><SeverityPill s={a.severity} /></div>) : <span className="cell-sub">—</span>}</td></tr>
              );
            })}</tbody>
          </table></div>
        </Card>
        <Card title="Open VM alerts" icon="fa-bell" className="mt" bodyPad={false} right={<Link className="link-btn" to="/alerts">Alert Manager</Link>}>
          <table className="list compact"><tbody>{vmAlerts.map((a) => <tr key={a.id}><td><SeverityPill s={a.severity} /></td><td><b>{a.title}</b><div className="cell-sub">{a.target} · {a.status}</div></td><td className="cell-sub">{ago(a.startedAt)}</td></tr>)}
            {!vmAlerts.length && <tr><td className="empty-row">No open alerts on VMs.</td></tr>}</tbody></table>
        </Card>
      </>}
    </div>
  );
}
