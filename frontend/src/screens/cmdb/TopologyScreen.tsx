import React from "react";
import { useSearchParams } from "react-router-dom";
import { useItsmGet, useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { TopologyGraph, type GEdge, type GNode } from "./TopologyGraph";
import type { Ci } from "./cmdbMeta";

export default function TopologyScreen() {
  const [params, setParams] = useSearchParams();
  const root = params.get("root") ?? "";
  const depth = params.get("depth") ?? "2";
  const [cls, setCls] = React.useState("");
  const { data: cis = [] } = useItsmList<Ci>("/cis/");
  const { data, isError, isLoading, refetch } = useItsmGet<{ nodes: GNode[]; edges: GEdge[] }>(`/cis/graph/${root ? `?root=${root}&depth=${depth}` : ""}`);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const graph = React.useMemo(() => {
    if (!data) return null;
    if (!cls) return data;
    const keep = new Set(data.nodes.filter((n) => n.ciClass === cls).map((n) => n.id));
    // keep the selected class plus direct neighbours so edges stay meaningful
    data.edges.forEach((e) => { if (keep.has(e.source) || keep.has(e.target)) { keep.add(e.source); keep.add(e.target); } });
    return { nodes: data.nodes.filter((n) => keep.has(n.id)), edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  }, [data, cls]);

  const classes = [...new Set((data?.nodes ?? []).map((n) => n.ciClass))].sort();
  const degraded = graph?.nodes.filter((n) => n.status !== "operational").length ?? 0;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "CMDB" }, { label: "Topology" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-diagram-project" /><div><h1 className="page-title">Service Topology</h1>
          <div className="page-sub">How business services, hosts and network gear depend on each other</div></div></div>
      </div>
      <div className="kpi-strip">
        <div className="kpi"><div className="l">Nodes</div><div className="v">{graph?.nodes.length ?? "—"}</div></div>
        <div className="kpi"><div className="l">Relationships</div><div className="v">{graph?.edges.length ?? "—"}</div></div>
        <div className={`kpi${degraded ? " tone-warn" : ""}`}><div className="l">Not operational</div><div className="v">{graph ? degraded : "—"}</div></div>
        <div className="kpi"><div className="l">CI classes</div><div className="v">{classes.length || "—"}</div></div>
      </div>
      <Card title="Dependency graph" icon="fa-diagram-project" right={
        <div className="inline-form">
          <select className="select-sm" aria-label="Focus CI" value={root} onChange={(e) => set("root", e.target.value)}>
            <option value="">Whole estate</option>
            {cis.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {root && <select className="select-sm" aria-label="Depth" value={depth} onChange={(e) => set("depth", e.target.value)}>
            {["1", "2", "3", "4"].map((d) => <option key={d} value={d}>{d} hop{d === "1" ? "" : "s"}</option>)}
          </select>}
          <select className="select-sm" aria-label="Class filter" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      }>
        {isError ? <ApiDown what="the topology" retry={() => refetch()} /> : isLoading || !graph ? <div className="loading">Loading…</div>
          : graph.nodes.length ? <TopologyGraph nodes={graph.nodes} edges={graph.edges} rootId={root ? Number(root) : undefined} />
            : <div className="empty-card"><i className="fa-solid fa-diagram-project" />No relationships recorded for this selection yet.</div>}
      </Card>
    </div>
  );
}
