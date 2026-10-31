import React from "react";
import { Link } from "react-router-dom";
import { useExporterMutations, useExporters, type ExporterRow } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { IntegrationBanner } from "@/components/IntegrationBanner";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";

const HEALTH: Record<string, [string, string]> = { active: ["ok", "UP"], error: ["crit", "DOWN"], inactive: ["muted", "DISABLED"], not_configured: ["muted", "UNKNOWN"] };

/** Exporters seen as Prometheus scrape targets, grouped by job (exporter type). */
export default function PrometheusScreen() {
  const { data, isError, isLoading, refetch } = useExporters();
  const { test } = useExporterMutations();
  const [toast, setToast] = useToast();
  const [q, setQ] = React.useState("");
  const [onlyDown, setOnlyDown] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);

  const rows = (data ?? []).filter((e) => (!q || `${e.name} ${e.endpoint} ${e.target} ${e.exporterType}`.toLowerCase().includes(q.toLowerCase())) && (!onlyDown || e.status !== "active"));
  const jobs = new Map<string, ExporterRow[]>();
  rows.forEach((e) => jobs.set(e.exporterType, [...(jobs.get(e.exporterType) ?? []), e]));
  const all = data ?? [];
  const up = all.filter((e) => e.status === "active").length;

  function scrape(e: ExporterRow) {
    setTesting(e.id);
    test.mutate(e.id, {
      onSuccess: (r) => setToast({ kind: r.ok ? "ok" : "err", text: r.ok ? `${e.name}: endpoint reachable${r.latencyMs !== null ? ` · ${r.latencyMs} ms` : ""}` : `${e.name}: ${r.detail}` }),
      onError: (err) => setToast({ kind: "err", text: err.message }),
      onSettled: () => setTesting(null),
    });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: "Prometheus Metrics" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-fire-flame-curved" /><div><h1 className="page-title">Prometheus Targets</h1>
          <div className="page-sub">Scrape targets by job, with health and last scrape — test any endpoint live</div></div></div>
        <Link className="btn" to="/exporters"><i className="fa-solid fa-gear" /> Manage exporters</Link>
      </div>
      <div className="stack-gap"><IntegrationBanner name="Prometheus" what="Target health below comes from Argus's exporter registry and live endpoint tests." /></div>
      <div className="kpi-strip">
        <div className="kpi"><div className="l">Targets</div><div className="v">{all.length || "—"}</div><div className="s">{new Set(all.map((e) => e.exporterType)).size} jobs</div></div>
        <div className="kpi tone-ok"><div className="l">Up</div><div className="v">{up}</div></div>
        <div className={`kpi${all.some((e) => e.status === "error") ? " tone-crit" : ""}`}><div className="l">Down</div><div className="v">{all.filter((e) => e.status === "error").length}</div></div>
        <div className="kpi"><div className="l">Unknown / disabled</div><div className="v">{all.filter((e) => e.status === "inactive" || e.status === "not_configured").length}</div></div>
      </div>
      <div className="card filter-bar">
        <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Filter by name, endpoint or job…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="cell-sub" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={onlyDown} onChange={(e) => setOnlyDown(e.target.checked)} /> Unhealthy only</label>
      </div>
      {isError ? <ApiDown what="exporters" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : [...jobs.entries()].sort().map(([job, list]) => (
        <Card key={job} className="mt" bodyPad={false}
          title={<>{job.toLowerCase().replace(/[^a-z0-9]+/g, "_")} <span className="cell-sub">({list.filter((e) => e.status === "active").length}/{list.length} up)</span></>} icon="fa-crosshairs">
          <div className="table-wrap"><table className="list compact" style={{ tableLayout: "fixed", minWidth: 900 }}>
            <colgroup><col style={{ width: "26%" }} /><col style={{ width: 100 }} /><col /><col style={{ width: 100 }} /><col style={{ width: 80 }} /><col style={{ width: "18%" }} /><col style={{ width: 90 }} /></colgroup>
            <thead><tr><th>Endpoint</th><th>State</th><th>Labels</th><th>Last scrape</th><th>Interval</th><th>Error</th><th /></tr></thead>
            <tbody>{list.map((e) => (
              <tr key={e.id}>
                <td>{e.endpoint ? <span className="mono">http://{e.endpoint}/metrics</span> : <span className="cell-sub">No endpoint configured</span>}</td>
                <td><span className={`pill ${HEALTH[e.status][0]}`}>{HEALTH[e.status][1]}</span></td>
                <td><span className="pill muted mono">instance="{e.target}"</span>{e.siteName && <> <span className="pill muted mono">site="{e.siteId}"</span></>}</td>
                <td className="cell-sub">{ago(e.lastSeen)}</td><td className="cell-sub">{e.intervalSec}s</td>
                <td className="cell-sub" style={{ maxWidth: 260 }}>{e.lastError || "—"}</td>
                <td><button className="btn sm" disabled={testing === e.id} onClick={() => scrape(e)}>{testing === e.id ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-plug" />} Test</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      ))}
      {!isLoading && !rows.length && <div className="card empty-card"><i className="fa-solid fa-crosshairs" />No targets match.</div>}
      {toast}
    </div>
  );
}
