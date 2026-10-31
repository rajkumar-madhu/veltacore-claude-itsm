import React from "react";
import { useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";

interface Report { id: string; name: string }
const DESC: Record<string, [string, string]> = {
  sla: ["fa-stopwatch", "Every ticket with an SLA: due time, resolution time and whether it was met"],
  incidents: ["fa-fire", "All incidents with assignee, CI and hours open"],
  availability: ["fa-heart-pulse", "Uptime checks with uptime % and latency over recorded runs"],
  assets: ["fa-boxes-stacked", "Hardware register with cost, warranty and end-of-life"],
  licenses: ["fa-key", "License seats, utilisation, cost and expiry"],
  alerts: ["fa-bell", "Alerts raised in the last 7 days with status and linked incident"],
};

/** Minimal CSV parser for previews (handles quoted fields). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export default function ReportsScreen() {
  const { data, isError, isLoading, refetch } = useItsmList<Report>("/reports/");
  const [preview, setPreview] = React.useState<{ id: string; rows: string[][] | null; error?: string } | null>(null);

  function open(id: string) {
    setPreview({ id, rows: null });
    fetch(`/api/itsm/reports/${id}.csv`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => setPreview({ id, rows: parseCsv(t) })).catch((e: Error) => setPreview({ id, rows: [], error: e.message }));
  }
  const current = data?.find((r) => r.id === preview?.id);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Analytics" }, { label: "Reports" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-file-csv" /><div><h1 className="page-title">Reports</h1>
          <div className="page-sub">Generated on demand from live data — preview in the browser or download as CSV</div></div></div>
      </div>
      {isError ? <ApiDown what="reports" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
        <div className="catalog-grid">
          {(data ?? []).map((r) => (
            <div key={r.id} className="catalog-card">
              <div className="cc-top"><span className="cc-icon"><i className={`fa-solid ${DESC[r.id]?.[0] ?? "fa-file"}`} /></span>
                <div><b>{r.name}</b><div className="cell-sub">CSV</div></div></div>
              <p className="cell-sub cc-desc" style={{ margin: 0 }}>{DESC[r.id]?.[1]}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => open(r.id)}><i className="fa-solid fa-eye" /> Preview</button>
                <a className="btn primary" style={{ flex: 1, justifyContent: "center" }} href={`/api/itsm/reports/${r.id}.csv`} download={`${r.id}.csv`}><i className="fa-solid fa-download" /> Download</a>
              </div>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <Card className="mt" bodyPad={false} title={<>{current?.name} {preview.rows && <span className="cell-sub">({Math.max(0, preview.rows.length - 1)} rows)</span>}</>} icon="fa-table"
          right={<button className="icon-btn" aria-label="Close preview" onClick={() => setPreview(null)}><i className="fa-solid fa-xmark" /></button>}>
          {preview.error ? <div className="field-error" style={{ padding: 14 }}>{preview.error}</div> : !preview.rows ? <div className="loading">Loading…</div> : (
            <div className="table-wrap" style={{ maxHeight: 460, overflow: "auto" }}><table className="list compact">
              <thead><tr>{preview.rows[0]?.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(1, 201).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="nowrap">{c || "—"}</td>)}</tr>)}
                {preview.rows.length <= 1 && <tr><td className="empty-row" colSpan={preview.rows[0]?.length ?? 1}>No rows.</td></tr>}</tbody>
            </table></div>
          )}
          {preview.rows && preview.rows.length > 201 && <div className="card-foot">Showing first 200 rows — download for the full report.</div>}
        </Card>
      )}
    </div>
  );
}
