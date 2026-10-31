import React from "react";
import { useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, Meter } from "@/components/ui";
import { ago } from "@/lib/itsmFmt";

interface Cluster {
  id: number; name: string; version: string; distribution: string; siteName: string | null;
  nodes: { name: string; role: string; status: string; cpuPct: number; memPct: number; pods: number; kubelet: string }[];
  workloads: { namespace: string; name: string; kind: string; desired: number; ready: number; restarts: number; image: string }[];
  events: { ts: string; type: string; object: string; reason: string; message: string }[];
}
const pct = (v: number) => (v >= 85 ? "var(--crit)" : v >= 70 ? "#f59e0b" : "var(--ok)");

export default function KubernetesScreen() {
  const { data, isError, isLoading, refetch } = useItsmList<Cluster>("/kubernetes/", {}, { refetchInterval: 60_000 });
  const [sel, setSel] = React.useState<number | null>(null);
  const [ns, setNs] = React.useState("");
  const c = data?.find((x) => x.id === sel) ?? data?.[0];
  const namespaces = [...new Set(c?.workloads.map((w) => w.namespace) ?? [])].sort();
  const wl = (c?.workloads ?? []).filter((w) => !ns || w.namespace === ns);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Kubernetes" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-dharmachakra" /><div><h1 className="page-title">Kubernetes</h1><div className="page-sub">Clusters, nodes, workloads and recent events</div></div></div>
        {data && data.length > 1 && <div className="seg">{data.map((x) => <button key={x.id} className={c?.id === x.id ? "active" : ""} onClick={() => { setSel(x.id); setNs(""); }}>{x.name}</button>)}</div>}
      </div>
      {isError ? <ApiDown what="clusters" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : !c ? <div className="card empty-card"><i className="fa-solid fa-dharmachakra" />No clusters registered.</div> : <>
        <div className="kpi-strip">
          <div className="kpi"><div className="l">Cluster</div><div className="v" style={{ fontSize: 20 }}>{c.name}</div><div className="s">{c.distribution} {c.version}{c.siteName ? ` · ${c.siteName}` : ""}</div></div>
          <div className={`kpi${c.nodes.some((n) => n.status !== "Ready") ? " tone-warn" : " tone-ok"}`}><div className="l">Nodes ready</div><div className="v">{c.nodes.filter((n) => n.status === "Ready").length}/{c.nodes.length}</div></div>
          <div className={`kpi${c.workloads.some((w) => w.ready < w.desired) ? " tone-warn" : ""}`}><div className="l">Workloads healthy</div><div className="v">{c.workloads.filter((w) => w.ready >= w.desired).length}/{c.workloads.length}</div></div>
          <div className="kpi"><div className="l">Pods</div><div className="v">{c.nodes.reduce((s, n) => s + n.pods, 0)}</div><div className="s">{c.workloads.reduce((s, w) => s + w.restarts, 0)} restarts</div></div>
        </div>
        <Card title="Nodes" icon="fa-server" bodyPad={false}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Node</th><th>Role</th><th>Status</th><th>CPU</th><th>Memory</th><th>Pods</th><th>Kubelet</th></tr></thead>
            <tbody>{c.nodes.map((n) => (
              <tr key={n.name}><td className="mono cell-strong">{n.name}</td><td>{n.role}</td>
                <td><span className={`pill ${n.status === "Ready" ? "ok" : "warn"}`}>{n.status}</span></td>
                <td style={{ minWidth: 120 }}><div className="cell-sub">{n.cpuPct}%</div><Meter pct={n.cpuPct} color={pct(n.cpuPct)} /></td>
                <td style={{ minWidth: 120 }}><div className="cell-sub">{n.memPct}%</div><Meter pct={n.memPct} color={pct(n.memPct)} /></td>
                <td>{n.pods}</td><td className="cell-sub">{n.kubelet}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <Card title="Workloads" icon="fa-boxes-stacked" className="mt" bodyPad={false} right={
          <select className="select-sm" aria-label="Namespace" value={ns} onChange={(e) => setNs(e.target.value)}><option value="">All namespaces</option>{namespaces.map((n) => <option key={n}>{n}</option>)}</select>}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Namespace</th><th>Name</th><th>Kind</th><th>Ready</th><th>Restarts</th><th>Image</th></tr></thead>
            <tbody>{wl.map((w) => (
              <tr key={`${w.namespace}/${w.name}`}><td><span className="pill muted">{w.namespace}</span></td><td><b>{w.name}</b></td><td>{w.kind}</td>
                <td><span className={`pill ${w.ready >= w.desired ? "ok" : w.ready === 0 ? "crit" : "warn"}`}>{w.ready}/{w.desired}</span></td>
                <td className={w.restarts >= 5 ? "warn-text" : ""}>{w.restarts}</td><td className="mono cell-sub">{w.image}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <Card title="Recent events" icon="fa-list" className="mt" bodyPad={false}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Time</th><th>Type</th><th>Object</th><th>Reason</th><th>Message</th></tr></thead>
            <tbody>{c.events.map((e, i) => (
              <tr key={i}><td className="cell-sub nowrap">{ago(e.ts)}</td><td><span className={`pill ${e.type === "Warning" ? "warn" : "muted"}`}>{e.type}</span></td>
                <td className="mono">{e.object}</td><td>{e.reason}</td><td className="cell-sub">{e.message}</td></tr>
            ))}{!c.events.length && <tr><td colSpan={5} className="empty-row">No recent events.</td></tr>}</tbody>
          </table></div>
        </Card>
      </>}
    </div>
  );
}
