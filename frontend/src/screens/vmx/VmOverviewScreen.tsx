import { Link } from "react-router-dom";
import { useVms } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { BarList } from "@/screens/analytics/Charts";

export default function VmOverviewScreen() {
  const { data = [], isError, isLoading, refetch } = useVms();
  const count = (key: (v: (typeof data)[number]) => string) => Object.entries(data.reduce<Record<string, number>>((m, v) => ({ ...m, [key(v)]: (m[key(v)] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const running = data.filter((v) => v.state === "running");
  const avg = (k: "cpuPct" | "memPct" | "diskPct") => (running.length ? Math.round(running.reduce((s, v) => s + v[k], 0) / running.length) : 0);
  const hot = [...running].sort((a, b) => Math.max(b.cpuPct, b.memPct, b.diskPct) - Math.max(a.cpuPct, a.memPct, a.diskPct)).slice(0, 5);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines" }, { label: "Overview" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-cube" /><div><h1 className="page-title">Virtual Machines Overview</h1><div className="page-sub">Capacity and health across every hypervisor platform</div></div></div>
        <div className="detail-actions"><Link className="btn" to="/vms">VM list</Link><Link className="btn primary" to="/vms/new"><i className="fa-solid fa-plus" /> Request VM</Link></div>
      </div>
      {isError ? <ApiDown what="VMs" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <div className="kpi-strip">
          <div className="kpi"><div className="l">VMs</div><div className="v">{data.length}</div><div className="s">{running.length} running</div></div>
          <div className="kpi"><div className="l">Allocated</div><div className="v">{data.reduce((s, v) => s + v.vcpu, 0)} vCPU</div><div className="s">{data.reduce((s, v) => s + v.memoryGb, 0)} GB memory</div></div>
          <div className="kpi"><div className="l">Avg CPU / memory</div><div className="v">{avg("cpuPct")}% / {avg("memPct")}%</div><div className="s">running VMs</div></div>
          <div className={`kpi${data.length - running.length ? " tone-warn" : ""}`}><div className="l">Stopped / suspended</div><div className="v">{data.length - running.length}</div></div>
        </div>
        <div className="grid-3">
          <Card title="By platform"><BarList data={count((v) => v.platform)} /><div className="cell-sub" style={{ marginTop: 8 }}>
            {["VMware", "Hyper-V", "Proxmox"].map((p) => <Link key={p} className="link" style={{ marginRight: 12 }} to={`/vms?platform=${p}`}>{p}</Link>)}</div></Card>
          <Card title="By cluster"><BarList data={count((v) => v.cluster)} /></Card>
          <Card title="By operating system"><BarList data={count((v) => v.osFamily)} /></Card>
        </div>
        <Card title="Busiest running VMs" icon="fa-temperature-high" className="mt" bodyPad={false} right={<Link className="link-btn" to="/vms/monitoring">VM monitoring</Link>}>
          <table className="list compact"><thead><tr><th>VM</th><th>Host</th><th>CPU</th><th>Memory</th><th>Disk</th></tr></thead>
            <tbody>{hot.map((v) => <tr key={v.id}><td><Link className="link cell-strong" to={`/vms/${v.id}`}>{v.name}</Link><div className="cell-sub">{v.role}</div></td><td className="mono cell-sub">{v.host}</td>
              {(["cpuPct", "memPct", "diskPct"] as const).map((k) => <td key={k} className={v[k] >= 85 ? "warn-text" : ""}>{Math.round(v[k])}%</td>)}</tr>)}</tbody></table>
        </Card>
      </>}
    </div>
  );
}
