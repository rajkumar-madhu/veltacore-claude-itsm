import React from "react";
import { useDomain, type DomainDetail, type Health } from "@/api/hooks";
import { Legend, LineChart } from "@/components/charts";
import { Card, RangeSelect } from "@/components/ui";
import { pointsFor, series, timeTicks, type Range } from "@/lib/series";
import { HEALTH_META, METRICS, ago, fmtMetric } from "./heatmapMeta";

export type DomainTab = "overview" | "services" | "incidents" | "logs" | "traces" | "metrics" | "topology";

export function HealthBadge({ h }: { h: Health }) {
  const m = HEALTH_META[h];
  return <span className={`pill ${m.cls}`}><i className={`fa-solid ${m.icon}`} /> {m.label}</span>;
}

const FLOW_ICON: Record<string, string> = {
  exchange: "fa-globe", "market data": "fa-chart-column", oms: "fa-server", "risk engine": "fa-shield-halved", database: "fa-database",
};

function Flow({ d }: { d: DomainDetail }) {
  if (!d.flow.length) return <div className="empty-row">No topology defined for this domain.</div>;
  return (
    <div className="flow">
      {d.flow.map((n, i) => (
        <React.Fragment key={n.label}>
          {i > 0 && <i className="fa-solid fa-arrow-right flow-arrow" />}
          <div className={`flow-node ${n.health}`} title={HEALTH_META[n.health].label}>
            <span className="flow-icon"><i className={`fa-solid ${FLOW_ICON[n.label.toLowerCase()] ?? "fa-cube"}`} /></span>
            <span>{n.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function MetricsTab({ d, range }: { d: DomainDetail; range: Range }) {
  const n = pointsFor(range);
  const ticks = timeTicks(range, 6);
  const avail = d.availability ?? 100, err = d.errorRate ?? 0, p95 = d.latencyP95Ms ?? 0;
  const a = series(`${d.id}:${range}:avail`, avail, { n, jitter: 0.002, min: 98, max: 100 });
  const e = series(`${d.id}:${range}:err`, err, { n, jitter: 0.5 });
  const l = series(`${d.id}:${range}:p95`, p95, { n, jitter: 0.3, max: Infinity });
  const lmax = Math.max(100, Math.ceil(Math.max(...l) / 100) * 100);
  const emax = Math.max(1, Math.ceil(Math.max(...e)));
  return (
    <div className="grid-2">
      <div><div className="mini-title">Availability (weakest service)</div>
        <LineChart height={150} xTicks={ticks} yMin={98} yMax={100} yTicks={[98, 98.5, 99, 99.5, 100]} formatY={(v) => `${v}%`}
          series={[{ label: "Availability", color: "#16a34a", data: a, fill: true }]} /></div>
      <div><div className="mini-title">Error rate (avg)</div>
        <LineChart height={150} xTicks={ticks} yMax={emax} yTicks={[0, emax / 2, emax]} formatY={(v) => `${v}%`} series={[{ label: "Errors", color: "#dc2626", data: e }]} /></div>
      <div className="span-2"><div className="mini-title">p95 latency (worst service)</div>
        <LineChart height={150} xTicks={ticks} yMax={lmax} yTicks={[0, lmax / 2, lmax]} formatY={(v) => `${v} ms`} series={[{ label: "p95", color: "#2563eb", data: l, fill: true }]} />
        <Legend items={[{ label: "p95 now", color: "#2563eb", value: `${p95} ms` }]} /></div>
    </div>
  );
}

export function DomainDetails({ id, tab, setTab }: { id: string; tab: DomainTab; setTab: (t: DomainTab) => void }) {
  const { data: d, isLoading, isError } = useDomain(id);
  const [range, setRange] = React.useState<Range>("1h");
  if (isLoading) return <Card title="Domain Details"><div className="loading">Loading…</div></Card>;
  if (isError || !d) return <Card title="Domain Details"><div className="empty-row">Couldn't load this domain.</div></Card>;

  const open = d.incidents.filter((i) => i.status === "open");
  const top = [...d.services].sort((a, b) => ({ crit: 0, warn: 1, ok: 2, unknown: 3 }[a.health] - { crit: 0, warn: 1, ok: 2, unknown: 3 }[b.health]));
  const tabs: { id: DomainTab; label: string }[] = [
    { id: "overview", label: "Overview" }, { id: "services", label: `Services (${d.serviceCount})` }, { id: "incidents", label: `Incidents (${open.length})` },
    { id: "logs", label: "Logs" }, { id: "traces", label: "Traces" }, { id: "metrics", label: "Metrics" }, { id: "topology", label: "Topology" },
  ];

  return (
    <Card title={<>Domain Details – {d.name} <HealthBadge h={d.health} /></>} right={<RangeSelect value={range} onChange={setRange} />}>
      <div className="pill-tabs">{tabs.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>

      {tab === "overview" && (
        <div className="dd-grid">
          <div>
            <div className="dd-hero">
              <i className={`fa-solid ${d.icon}`} />
              <div style={{ flex: 1 }}><b>{d.name}</b><div className="cell-sub">{d.description}</div></div>
              <div className="dd-avail"><b>{d.availability != null ? `${d.availability}%` : "—"}</b><span>Availability</span></div>
            </div>
            <div className="mini-title">Top Services</div>
            {d.services.length ? (
              <table className="list compact">
                <thead><tr><th>Service</th><th>Health</th><th>Availability</th><th>Error Rate</th><th>p95 Latency</th></tr></thead>
                <tbody>{top.slice(0, 5).map((s) => (
                  <tr key={s.id}><td className="link">{s.name}</td><td><HealthBadge h={s.health} /></td>
                    <td>{fmtMetric("availability", s.values.availability)}</td>
                    <td className={`${s.statuses.errorRate}-text`}>{fmtMetric("errorRate", s.values.errorRate)}</td>
                    <td className={`${s.statuses.latencyP95Ms}-text`}>{fmtMetric("latencyP95Ms", s.values.latencyP95Ms)}</td></tr>
                ))}</tbody>
              </table>
            ) : <div className="empty-row">No services in this domain yet.</div>}
            {d.services.length > 5 && <button className="link-btn" onClick={() => setTab("services")}>View Full Services <i className="fa-solid fa-arrow-right" /></button>}
          </div>
          <div className="stack">
            <div>
              <div className="mini-title" style={{ display: "flex", justifyContent: "space-between" }}>Recent Incidents
                {open.length > 0 && <button className="link-btn" onClick={() => setTab("incidents")}>View All <i className="fa-solid fa-arrow-right" /></button>}</div>
              {open.length ? <ul className="inc-list">{open.slice(0, 5).map((i) => (
                <li key={i.id}><i className="fa-solid fa-circle-xmark crit-text" /><span className="link">{i.id}</span><span className={`prio ${i.priority}`}>{i.priority}</span>
                  <span className="inc-title">{i.title}</span><span className="cell-sub">{ago(i.openedAt)}</span></li>
              ))}</ul> : <div className="empty-row">No open incidents.</div>}
            </div>
            <div><div className="mini-title">Domain Topology</div><Flow d={d} /></div>
          </div>
        </div>
      )}

      {tab === "services" && (
        <div className="table-wrap"><table className="list compact">
          <thead><tr><th>Service</th><th>Host</th><th>Health</th>{METRICS.map((m) => <th key={m.key}>{m.label}</th>)}</tr></thead>
          <tbody>{d.services.map((s) => (
            <tr key={s.id}><td className="cell-strong">{s.name}</td><td className="mono">{s.host}</td><td><HealthBadge h={s.health} /></td>
              {METRICS.map((m) => <td key={m.key} className={`${s.statuses[m.key]}-text`}>{fmtMetric(m.key, s.values[m.key])}</td>)}</tr>
          ))}</tbody>
        </table></div>
      )}

      {tab === "incidents" && (d.incidents.length ? (
        <table className="list compact">
          <thead><tr><th>Incident</th><th>Priority</th><th>Title</th><th>Service</th><th>Status</th><th>Opened</th></tr></thead>
          <tbody>{d.incidents.map((i) => (
            <tr key={i.id}><td className="link">{i.id}</td><td><span className={`prio ${i.priority}`}>{i.priority}</span></td><td>{i.title}</td><td>{i.service ?? "—"}</td>
              <td><span className={`pill ${i.status === "open" ? "crit" : "ok"}`}>{i.status}</span></td><td>{ago(i.openedAt)} ago</td></tr>
          ))}</tbody>
        </table>) : <div className="empty-row">No incidents.</div>)}

      {tab === "logs" && (d.logs.length ? (
        <div className="log-view">{d.logs.map((l, i) => <div key={i} className={`log-line ${l.level.toLowerCase()}`}><span className="ts">{l.ts}</span><span className="lv">{l.level}</span><span className="src">{l.source}</span><span>{l.message}</span></div>)}</div>
      ) : <div className="empty-row">No domain logs collected yet.</div>)}

      {tab === "traces" && (d.traces.length ? (
        <table className="list compact">
          <thead><tr><th>Trace ID</th><th>Root span</th><th>Service</th><th>Duration</th><th>Spans</th><th>Status</th></tr></thead>
          <tbody>{d.traces.map((t) => (
            <tr key={t.traceId}><td className="mono">{t.traceId}</td><td className="mono">{t.root}</td><td>{t.service}</td>
              <td className={t.durationMs > 600 ? "crit-text" : ""}>{t.durationMs} ms</td><td>{t.spans}</td>
              <td><span className={`pill ${t.status === "ok" ? "ok" : "crit"}`}>{t.status}</span></td></tr>
          ))}</tbody>
        </table>) : <div className="empty-row">No sampled traces for this domain.</div>)}

      {tab === "metrics" && <MetricsTab d={d} range={range} />}
      {tab === "topology" && <Flow d={d} />}
    </Card>
  );
}
