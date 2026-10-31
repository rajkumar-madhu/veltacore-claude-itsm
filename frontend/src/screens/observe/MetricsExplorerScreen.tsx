import React from "react";
import type { MetricKey } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { useServices, type Svc } from "./observeMeta";

const METRICS: { key: MetricKey; label: string; unit: string; higherIsBetter?: boolean }[] = [
  { key: "availability", label: "Availability", unit: "%", higherIsBetter: true }, { key: "responseMs", label: "Response time", unit: "ms" },
  { key: "latencyP95Ms", label: "p95 latency", unit: "ms" }, { key: "errorRate", label: "Error rate", unit: "%" },
  { key: "cpuPct", label: "CPU", unit: "%" }, { key: "memPct", label: "Memory", unit: "%" }, { key: "diskPct", label: "Disk", unit: "%" }, { key: "netPct", label: "Network", unit: "%" },
];
const TONE_FILL: Record<string, string> = { ok: "#2a78d6", warn: "#d97706", crit: "#dc2626", unknown: "#94a3b8" };

export default function MetricsExplorerScreen() {
  const { services, isError, isLoading, refetch } = useServices();
  const [metric, setMetric] = React.useState<MetricKey>("latencyP95Ms");
  const [domain, setDomain] = React.useState("");
  const [sort, setSort] = React.useState<"worst" | "name">("worst");
  const m = METRICS.find((x) => x.key === metric)!;
  const domains = [...new Map(services.map((s) => [s.domainId, s.domainName])).entries()];
  const rows = services.filter((s) => (!domain || s.domainId === domain) && s.values[metric] !== null && s.values[metric] !== undefined)
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : ((b.values[metric] ?? 0) - (a.values[metric] ?? 0)) * (m.higherIsBetter ? -1 : 1));
  const max = Math.max(...rows.map((s) => s.values[metric] ?? 0), m.unit === "%" && !m.higherIsBetter ? 100 : 1);
  const min = m.higherIsBetter ? Math.min(...rows.map((s) => s.values[metric] ?? 100), 99) - 0.5 : 0;
  const width = (s: Svc) => Math.max(2, (((s.values[metric] ?? 0) - min) / (max - min || 1)) * 100);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Metrics Explorer" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-chart-column" /><div><h1 className="page-title">Metrics Explorer</h1>
        <div className="page-sub">Compare the current value of any golden signal across services</div></div></div></div>
      <div className="card filter-bar">
        <div className="seg" role="tablist">{METRICS.map((x) => <button key={x.key} className={metric === x.key ? "active" : ""} style={{ padding: "7px 12px" }} onClick={() => setMetric(x.key)}>{x.label}</button>)}</div>
        <select className="select-sm" aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">All domains</option>{domains.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select className="select-sm" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "worst" | "name")}><option value="worst">Worst first</option><option value="name">By name</option></select>
      </div>
      {isError ? <ApiDown what="metrics" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
        <Card title={`${m.label} by service (${m.unit})`} icon="fa-chart-bar" className="mt">
          {rows.map((s) => {
            const st = s.statuses[metric];
            return (
              <div key={s.id} className="bar-row" style={{ gridTemplateColumns: "200px minmax(0,1fr) 90px" }} title={`${s.name} (${s.domainName}): ${s.values[metric]} ${m.unit} — ${st}`}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name} <span className="cell-sub">· {s.domainName}</span></span>
                <span className="bar" style={{ height: 12 }}><span style={{ width: `${width(s)}%`, background: TONE_FILL[st] }} /></span>
                <b style={{ textAlign: "right" }}>{s.values[metric]} {m.unit}</b>
              </div>
            );
          })}
          {!rows.length && <div className="cell-sub">No service reports this metric.</div>}
          <div className="graph-legend" style={{ marginTop: 10 }}>
            <span><b style={{ background: TONE_FILL.ok, borderRadius: 2 }} />Within threshold</span><span><b style={{ background: TONE_FILL.warn, borderRadius: 2 }} />Warning</span>
            <span><b style={{ background: TONE_FILL.crit, borderRadius: 2 }} />Critical</span>
            {m.higherIsBetter && <span className="cell-sub">Axis starts at {min.toFixed(1)}% to make differences visible</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
