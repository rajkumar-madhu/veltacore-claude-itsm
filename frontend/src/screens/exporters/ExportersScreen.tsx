import React from "react";
import {
  useEvents, useExporterMutations, useExporterStats, useExporters, useLogs, useSites,
  type ExporterCategory, type ExporterRow, type ExporterStatus,
} from "@/api/hooks";
import { Donut, StackedBars } from "@/components/charts";
import { ApiDown, Breadcrumbs, Card, LevelBadge, Meter } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { downloadText } from "../device/deviceMeta";
import { ConfirmModal } from "../device/deviceCommon";
import { ExporterDrawer, ExporterFormModal, ImportModal } from "./ExporterModals";
import { CATEGORY_META, STATUS_META, fmtCount, relTime } from "./exportersMeta";

const PAGE_SIZES = [10, 25, 50];

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Change({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct == null || pct === 0) return null;
  const good = invert ? pct < 0 : pct > 0;
  return <span className={`chg ${good ? "up" : "down"}`}><i className={`fa-solid fa-arrow-${pct > 0 ? "up" : "down"}`} /> {Math.abs(pct)}%</span>;
}

function LiveLogs({ exporters }: { exporters: ExporterRow[] }) {
  const [live, setLive] = React.useState(true);
  const [exporter, setExporter] = React.useState("");
  const [level, setLevel] = React.useState("");
  const { data = [], isError } = useLogs({ exporter, level }, live);
  return (
    <Card title="Logs (Real-time)" right={
      <div className="logs-ctrl">
        <button className="icon-btn" title={live ? "Pause" : "Resume"} onClick={() => setLive((l) => !l)}><i className={`fa-solid ${live ? "fa-pause" : "fa-play"}`} /></button>
        <label className="switch"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /><span /> Auto Refresh</label>
        <select className="select-sm" value={exporter} onChange={(e) => setExporter(e.target.value)}><option value="">All Exporters</option>{exporters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select className="select-sm" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option><option>INFO</option><option>WARN</option><option>ERROR</option></select>
      </div>} bodyPad={false}>
      {isError ? <div className="empty-row">Log stream unavailable.</div> : (
        <div className="logs-scroll">
          <table className="list compact">
            <thead><tr><th>Time</th><th>Exporter</th><th>Level</th><th>Message</th></tr></thead>
            <tbody>{data.map((l) => (
              <tr key={l.id}><td className="nowrap mono">{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</td><td className="nowrap">{l.exporter}</td>
                <td><span className={`lvl-tag ${l.level.toLowerCase()}`}>{l.level}</span></td><td>{l.message}</td></tr>
            ))}</tbody>
          </table>
          {!data.length && <div className="empty-row">No log lines{level && ` at ${level}`}{exporter && " for this exporter"}.</div>}
        </div>
      )}
    </Card>
  );
}

export default function ExportersScreen() {
  const { data: exporters, isLoading, isError, refetch } = useExporters();
  const stats = useExporterStats();
  const events = useEvents();
  const sites = useSites().data;
  const mut = useExporterMutations();
  const [toast, setToast] = useToast();

  const [category, setCategory] = React.useState<"" | ExporterCategory>("");
  const [status, setStatus] = React.useState<"" | ExporterStatus>("");
  const [site, setSite] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [modal, setModal] = React.useState<null | { kind: "add" } | { kind: "edit"; row: ExporterRow } | { kind: "import" } | { kind: "view"; id: string } | { kind: "delete"; ids: string[] }>(null);
  const [testing, setTesting] = React.useState<string>();

  React.useEffect(() => setPage(0), [category, status, site, q, pageSize]);

  if (isError) return <div className="page"><ApiDown what="exporters" retry={() => refetch()} /></div>;
  const all = exporters ?? [];
  const rows = all.filter((e) => (!category || e.category === category) && (!status || e.status === status) && (!site || e.siteId === site)
    && (!q || `${e.name} ${e.exporterType} ${e.target}`.toLowerCase().includes(q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, page * pageSize + pageSize);
  const s = stats.data;
  const total = s?.total ?? all.length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 1000) / 10}%` : "—");
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((p) => { const n = new Set(p); pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; });

  function runTest(e: ExporterRow) {
    setTesting(e.id);
    mut.test.mutate(e.id, {
      onSuccess: (r) => setToast({ kind: r.ok ? "ok" : "err", text: `${e.name}: ${r.detail}` }),
      onError: (err) => setToast({ kind: "err", text: `${e.name}: ${err.message}` }),
      onSettled: () => setTesting(undefined),
    });
  }

  function bulk(action: "enable" | "disable") {
    mut.bulk.mutate({ ids: [...selected], action }, { onSuccess: (r) => { setToast({ kind: "ok", text: r.detail }); setSelected(new Set()); } });
  }

  function confirmDelete(ids: string[]) {
    const done = () => { setModal(null); setSelected((p) => { const n = new Set(p); ids.forEach((i) => n.delete(i)); return n; }); };
    if (ids.length === 1) mut.remove.mutate(ids[0], { onSuccess: () => { done(); setToast({ kind: "ok", text: `${ids[0]} deleted` }); }, onError: (e) => setToast({ kind: "err", text: e.message }) });
    else mut.bulk.mutate({ ids, action: "delete" }, { onSuccess: (r) => { done(); setToast({ kind: "ok", text: r.detail }); } });
  }

  function exportCsv() {
    const cols: (keyof ExporterRow)[] = ["name", "exporterType", "category", "target", "endpoint", "siteId", "status", "intervalSec", "lastSeen", "logs24h"];
    downloadText(`argus-exporters-${new Date().toISOString().slice(0, 10)}.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
    setToast({ kind: "ok", text: `Exported ${rows.length} exporter(s)` });
  }

  const trendLabels = (s?.trend ?? []).map((t) => new Date(t.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
  const topMax = Math.max(1, ...(s?.topSources ?? []).map((t) => t.count));

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: "Exporters, Logs & Events" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-gear" />
          <div><h1 className="page-title">All Exporters, Logs &amp; Events</h1>
            <div className="page-sub">Manage exporters, view real-time logs and events from all infrastructure, network, applications and services</div></div></div>
        <div className="detail-actions">
          <button className="btn" onClick={exportCsv}><i className="fa-solid fa-download" /> Export</button>
          <button className="btn" onClick={() => setModal({ kind: "import" })}><i className="fa-solid fa-file-import" /> Import</button>
          <a className="btn" href="https://prometheus.io/docs/instrumenting/exporters/" target="_blank" rel="noopener noreferrer"><i className="fa-regular fa-file-lines" /> View Documentation</a>
          <button className="btn primary" onClick={() => setModal({ kind: "add" })}><i className="fa-solid fa-plus" /> Add Exporter</button>
        </div>
      </div>

      <div className="ex-kpis">
        <div className="ex-kpi"><span className="ek-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}><i className="fa-solid fa-database" /></span><div><b>{total}</b><span>Total Exporters</span><Change pct={s?.totalChangePct ?? null} /></div></div>
        {(["active", "inactive", "error"] as ExporterStatus[]).map((k) => (
          <div key={k} className="ex-kpi"><span className={`ek-icon ${k}`}><i className={`fa-solid ${k === "active" ? "fa-check" : k === "inactive" ? "fa-pause" : "fa-triangle-exclamation"}`} /></span>
            <div><b>{s?.byStatus[k] ?? "—"}</b><span>{STATUS_META[k].label}</span>{s && <span className={`chg flat ${k}`}>{pct(s.byStatus[k])}</span>}</div></div>
        ))}
        <div className="ex-kpi"><span className="ek-icon" style={{ background: "#dbeafe", color: "#2563eb" }}><i className="fa-solid fa-file-lines" /></span><div><b>{s ? fmtCount(s.logs24h) : "—"}</b><span>Logs (24h)</span><Change pct={s?.logsChangePct ?? null} /></div></div>
        <div className="ex-kpi"><span className="ek-icon" style={{ background: "#f3e8ff", color: "#9333ea" }}><i className="fa-solid fa-bell" /></span><div><b>{s?.events24h ?? "—"}</b><span>Events (24h)</span><Change pct={s?.eventsChangePct ?? null} invert /></div></div>
      </div>

      <div className="cat-tiles card">
        <button className={`cat-tile${!category ? " active" : ""}`} onClick={() => setCategory("")}><i className="fa-solid fa-layer-group" /><span>All</span><b>{total}</b></button>
        {(Object.keys(CATEGORY_META) as ExporterCategory[]).map((c) => (
          <button key={c} className={`cat-tile${category === c ? " active" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
            <i className={`fa-solid ${CATEGORY_META[c].icon}`} style={{ color: category === c ? undefined : CATEGORY_META[c].color }} /><span>{CATEGORY_META[c].label}</span><b>{s?.byCategory[c] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="ex-grid">
        <Card title={`Exporters (${rows.length})`} right={<button className="btn" onClick={() => { refetch(); stats.refetch(); }}><i className="fa-solid fa-rotate" /> Refresh</button>} bodyPad={false}>
          <div className="toolbar">
            <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search exporters by name, type, or device…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="select-sm" value={category} onChange={(e) => setCategory(e.target.value as "" | ExporterCategory)}><option value="">All Categories</option>{(Object.keys(CATEGORY_META) as ExporterCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}</select>
            <select className="select-sm" value={status} onChange={(e) => setStatus(e.target.value as "" | ExporterStatus)}><option value="">All Status</option>{(Object.keys(STATUS_META) as ExporterStatus[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}</select>
            <select className="select-sm" value={site} onChange={(e) => setSite(e.target.value)}><option value="">All Sites</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </div>
          {selected.size > 0 && (
            <div className="bulk-bar"><b>{selected.size} selected</b>
              <button className="btn sm" onClick={() => bulk("enable")} disabled={mut.bulk.isPending}><i className="fa-solid fa-play" /> Enable</button>
              <button className="btn sm" onClick={() => bulk("disable")} disabled={mut.bulk.isPending}><i className="fa-solid fa-pause" /> Disable</button>
              <button className="btn sm danger" onClick={() => setModal({ kind: "delete", ids: [...selected] })}><i className="fa-solid fa-trash" /> Delete</button>
              <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button></div>
          )}
          {isLoading ? <div className="loading">Loading exporters…</div> : (
            <div className="table-wrap"><table className="list compact ex-table">
              <thead><tr><th><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select page" /></th><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>Target / Device</th><th>Status</th><th>Last Seen</th><th>Logs (24h)</th><th>Actions</th></tr></thead>
              <tbody>{pageRows.map((e, i) => { const st = STATUS_META[e.status]; const cat = CATEGORY_META[e.category]; return (
                <tr key={e.id}>
                  <td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSel(e.id)} aria-label={`Select ${e.name}`} /></td>
                  <td>{page * pageSize + i + 1}</td>
                  <td><button className="link-btn plain" onClick={() => setModal({ kind: "view", id: e.id })}>{e.name}</button></td>
                  <td>{e.exporterType}</td>
                  <td className="nowrap"><i className={`fa-solid ${cat.icon}`} style={{ color: cat.color }} /> {cat.label}</td>
                  <td className="mono" title={e.target}>{e.target}</td>
                  <td><span className={`pill ${st.cls}`} title={e.lastError || undefined}><i className={`fa-solid ${st.icon}`} /> {st.label}</span></td>
                  <td className="nowrap">{relTime(e.lastSeen)}</td>
                  <td>{e.logs24h ? e.logs24h.toLocaleString() : "—"}</td>
                  <td className="nowrap row-actions">
                    <button title="Test endpoint" disabled={testing === e.id || !e.endpoint} onClick={() => runTest(e)}><i className={`fa-solid ${testing === e.id ? "fa-spinner fa-spin" : "fa-play"}`} /></button>
                    <button title="Details" onClick={() => setModal({ kind: "view", id: e.id })}><i className="fa-solid fa-chart-line" /></button>
                    <button title="Edit" onClick={() => setModal({ kind: "edit", row: e })}><i className="fa-solid fa-pen" /></button>
                    <button title={e.status === "inactive" ? "Enable" : "Disable"} onClick={() => mut.bulk.mutate({ ids: [e.id], action: e.status === "inactive" ? "enable" : "disable" }, { onSuccess: (r) => setToast({ kind: "ok", text: r.detail }) })}>
                      <i className={`fa-solid ${e.status === "inactive" ? "fa-toggle-off" : "fa-toggle-on"}`} /></button>
                    <button title="Delete" className="danger" onClick={() => setModal({ kind: "delete", ids: [e.id] })}><i className="fa-solid fa-trash" /></button>
                  </td>
                </tr>); })}</tbody>
            </table>{!pageRows.length && <div className="empty-row">No exporters match.</div>}</div>
          )}
          <div className="pager" style={{ padding: "10px 14px" }}>
            <div><button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><i className="fa-solid fa-chevron-left" /></button>
              {Array.from({ length: pages }, (_, i) => i).filter((i) => i < 5 || i === pages - 1).map((i) => (
                <button key={i} className={`btn sm${i === page ? " primary" : ""}`} onClick={() => setPage(i)}>{i + 1}</button>))}
              <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next"><i className="fa-solid fa-chevron-right" /></button></div>
            <span className="cell-sub">Showing {rows.length ? page * pageSize + 1 : 0} to {Math.min(rows.length, (page + 1) * pageSize)} of {rows.length} exporters</span>
            <select className="select-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
        </Card>
        <LiveLogs exporters={all} />
      </div>

      <div className="ex-bottom">
        <Card title="Exporter Health Status">
          {s && <div className="donut-wrap">
            <Donut center={total} sub="Exporters" slices={(Object.keys(STATUS_META) as ExporterStatus[]).map((k) => ({ label: STATUS_META[k].label, value: s.byStatus[k], color: STATUS_META[k].color }))} />
            <div className="donut-legend">{(Object.keys(STATUS_META) as ExporterStatus[]).map((k) => (
              <div key={k}><span className="dot" style={{ background: STATUS_META[k].color }} />{STATUS_META[k].label}<b>{s.byStatus[k]} ({pct(s.byStatus[k])})</b></div>))}</div>
          </div>}
        </Card>
        <Card title="Logs Trend (Last 24 Hours)">
          {s && <StackedBars data={s.trend} labels={trendLabels} formatY={fmtCount}
            keys={[{ key: "info", color: "#2563eb", label: "Info" }, { key: "warn", color: "#f59e0b", label: "Warn" }, { key: "error", color: "#ef4444", label: "Error" }]} />}
          <div className="chart-legend"><span><span className="dot" style={{ background: "#2563eb" }} />Info</span><span><span className="dot" style={{ background: "#f59e0b" }} />Warn</span><span><span className="dot" style={{ background: "#ef4444" }} />Error</span></div>
        </Card>
        <Card title="Top Log Sources (24h)">
          <div className="top-sources">{(s?.topSources ?? []).map((t) => (
            <div key={t.id}><span className="ts-name">{t.name}</span><div className="ts-bar"><Meter pct={(t.count / topMax) * 100} color="#2563eb" /></div><b>{t.count.toLocaleString()}</b></div>
          ))}</div>
        </Card>
        <Card title="Recent Events" bodyPad={false}>
          {events.data?.length ? <table className="list compact">
            <thead><tr><th>Time</th><th>Severity</th><th>Message</th></tr></thead>
            <tbody>{events.data.map((ev, i) => (
              <tr key={i}><td className="nowrap">{new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</td><td><LevelBadge level={ev.severity} /></td>
                <td><span className="cell-sub">{ev.source}</span> · {ev.message}</td></tr>))}</tbody>
          </table> : <div className="empty-row">No events.</div>}
        </Card>
      </div>

      {modal?.kind === "add" && <ExporterFormModal onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setToast({ kind: "ok", text: m }); }} />}
      {modal?.kind === "edit" && <ExporterFormModal existing={modal.row} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setToast({ kind: "ok", text: m }); }} />}
      {modal?.kind === "import" && <ImportModal onClose={() => setModal(null)} onDownloadTemplate={(csv) => downloadText("argus-exporters-template.csv", csv)} />}
      {modal?.kind === "view" && <ExporterDrawer id={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "delete" && <ConfirmModal title={modal.ids.length === 1 ? "Delete Exporter" : `Delete ${modal.ids.length} Exporters`} danger
        text={`Delete ${modal.ids.length === 1 ? modal.ids[0] : `${modal.ids.length} exporters`}? Their log history in Argus is removed too.`}
        busy={mut.remove.isPending || mut.bulk.isPending} onClose={() => setModal(null)} onConfirm={() => confirmDelete(modal.ids)} />}
      {toast}
    </div>
  );
}
