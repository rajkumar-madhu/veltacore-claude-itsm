import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useExporters, type LogRow } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/series";

const LEVEL_TONE: Record<string, string> = { INFO: "info", WARN: "warn", ERROR: "crit" };

export default function LogsScreen() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [exporter, setExporter] = React.useState("");
  const [limit, setLimit] = React.useState(100);
  const [live, setLive] = React.useState(false);
  const { data: exporters = [] } = useExporters();
  React.useEffect(() => { const t = window.setTimeout(() => setDebounced(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);

  const qs = new URLSearchParams(Object.entries({ q: debounced, level, exporter, limit: String(limit) }).filter(([, v]) => v)).toString();
  const { data, isError, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["logs", "search", qs], retry: 0, refetchInterval: live ? 5000 : false,
    queryFn: async () => { const r = await fetch(`/api/logs/?${qs}`); if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as LogRow[]; },
  });
  const rows = data ?? [];
  const mark = (text: string) => {
    if (!debounced) return text;
    const i = text.toLowerCase().indexOf(debounced.toLowerCase());
    return i < 0 ? text : <>{text.slice(0, i)}<mark>{text.slice(i, i + debounced.length)}</mark>{text.slice(i + debounced.length)}</>;
  };

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Logs" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-file-lines" /><div><h1 className="page-title">Logs</h1><div className="page-sub">Search logs shipped by every exporter and agent</div></div></div>
        <Link className="btn" to="/exporters"><i className="fa-solid fa-gear" /> Exporters &amp; ingestion</Link>
      </div>
      <div className="card filter-bar">
        <div className="search-box" style={{ flex: 2 }}><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search message or source…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select-sm" aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option>{["ERROR", "WARN", "INFO"].map((l) => <option key={l}>{l}</option>)}</select>
        <select className="select-sm" aria-label="Source" value={exporter} onChange={(e) => setExporter(e.target.value)}><option value="">All sources</option>{exporters.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <select className="select-sm" aria-label="Limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} lines</option>)}</select>
        <label className="btn" style={{ cursor: "pointer" }}><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live tail</label>
      </div>
      <div className="kpi-strip">
        {(["ERROR", "WARN", "INFO"] as const).map((l) => <div key={l} className={`kpi${l === "ERROR" && rows.some((r) => r.level === l) ? " tone-crit" : ""}`}><div className="l">{l} in results</div><div className="v">{rows.filter((r) => r.level === l).length}</div></div>)}
        <div className="kpi"><div className="l">Sources in results</div><div className="v">{new Set(rows.map((r) => r.exporterId)).size}</div><div className="s">{dataUpdatedAt ? `updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}</div></div>
      </div>
      <Card title={`${rows.length} log lines`} icon="fa-list" bodyPad={false}>
        {isError ? <ApiDown what="logs" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap" style={{ maxHeight: 620, overflow: "auto" }}><table className="list compact">
            <thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="nowrap cell-sub mono">{formatDateTime(r.ts)}</td><td><span className={`pill ${LEVEL_TONE[r.level]}`}>{r.level}</span></td>
                <td className="nowrap"><button className="link-btn" onClick={() => setExporter(r.exporterId)}>{mark(r.exporter)}</button></td><td className="mono" style={{ fontSize: 12.5 }}>{mark(r.message)}</td></tr>
            ))}{!rows.length && <tr><td colSpan={4} className="empty-row">No log lines match.</td></tr>}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
