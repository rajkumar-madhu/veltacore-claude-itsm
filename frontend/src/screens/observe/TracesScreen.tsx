import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useDomains, type DomainDetail } from "@/api/hooks";
import { Breadcrumbs, Card } from "@/components/ui";

export default function TracesScreen() {
  const { data: domains = [] } = useDomains();
  const details = useQueries({
    queries: domains.map((d) => ({ queryKey: ["domains", d.id], retry: 0, queryFn: async () => (await (await fetch(`/api/domains/${d.id}/`)).json()) as DomainDetail })),
  });
  const [onlyErr, setOnlyErr] = React.useState(false);
  const [svc, setSvc] = React.useState("");
  const all = details.flatMap((q) => (q.data ? q.data.traces.map((t) => ({ ...t, domain: q.data!.name })) : []));
  const instrumented = details.filter((q) => q.data && q.data.traces.length).map((q) => q.data!.name);
  const rows = all.filter((t) => (!onlyErr || t.status !== "ok") && (!svc || t.service === svc)).sort((a, b) => b.durationMs - a.durationMs);
  const maxMs = Math.max(1, ...rows.map((t) => t.durationMs));
  const p = (q: number) => { const s = [...all].map((t) => t.durationMs).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Traces" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-route" /><div><h1 className="page-title">Traces</h1>
        <div className="page-sub">Sampled request traces from instrumented services{instrumented.length ? ` (${instrumented.join(", ")})` : ""}</div></div></div></div>
      <div className="kpi-strip">
        <div className="kpi"><div className="l">Sampled traces</div><div className="v">{all.length}</div></div>
        <div className={`kpi${all.some((t) => t.status !== "ok") ? " tone-crit" : ""}`}><div className="l">Errored</div><div className="v">{all.filter((t) => t.status !== "ok").length}</div></div>
        <div className="kpi"><div className="l">Median duration</div><div className="v">{p(0.5)} ms</div></div>
        <div className="kpi"><div className="l">Slowest</div><div className="v">{Math.max(0, ...all.map((t) => t.durationMs))} ms</div></div>
      </div>
      <div className="card filter-bar">
        <select className="select-sm" aria-label="Service" value={svc} onChange={(e) => setSvc(e.target.value)}><option value="">All services</option>{[...new Set(all.map((t) => t.service))].sort().map((s) => <option key={s}>{s}</option>)}</select>
        <label className="cell-sub" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} /> Errors only</label>
      </div>
      <Card title="Traces (slowest first)" icon="fa-route" className="mt" bodyPad={false}>
        <div className="table-wrap"><table className="list compact">
          <thead><tr><th>Trace ID</th><th>Root span</th><th>Service</th><th>Domain</th><th style={{ width: "30%" }}>Duration</th><th>Spans</th><th>Status</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.traceId}><td className="mono">{t.traceId}</td><td className="mono"><b>{t.root}</b></td><td>{t.service}</td><td className="cell-sub">{t.domain}</td>
              <td><div className="bar-row" style={{ gridTemplateColumns: "minmax(0,1fr) 64px", padding: 0 }}><span className="bar"><span className={t.status === "ok" ? "" : "crit"} style={{ width: `${(t.durationMs / maxMs) * 100}%` }} /></span><b style={{ textAlign: "right" }}>{t.durationMs} ms</b></div></td>
              <td>{t.spans}</td><td><span className={`pill ${t.status === "ok" ? "ok" : "crit"}`}>{t.status}</span></td></tr>
          ))}{!rows.length && <tr><td colSpan={7} className="empty-row">No traces match.</td></tr>}</tbody>
        </table></div>
        <div className="card-foot">Only services instrumented for tracing report spans. Others appear here once their OpenTelemetry exporter is configured.</div>
      </Card>
    </div>
  );
}
