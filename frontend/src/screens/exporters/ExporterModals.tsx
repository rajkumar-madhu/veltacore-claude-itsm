import React from "react";
import { useExporter, useExporterMutations, useSites, type ExporterCategory, type ExporterRow, type ExporterWrite } from "@/api/hooks";
import { StackedBars } from "@/components/charts";
import { InfoTable, Modal } from "@/components/ui";
import { csvToObjects } from "@/lib/csv";
import { CATEGORY_META, EXPORTER_TYPES, STATUS_META, fmtCount, relTime } from "./exportersMeta";

type FieldErrors = Record<string, string[]> | undefined;

export function ExporterFormModal({ existing, onClose, onSaved }: { existing?: ExporterRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const sites = useSites().data;
  const { create, update } = useExporterMutations();
  const m = existing ? update : create;
  const [f, setF] = React.useState<ExporterWrite>({
    name: existing?.name ?? "", exporterType: existing?.exporterType ?? "Node Exporter", category: existing?.category ?? "servers",
    target: existing?.target ?? "", endpoint: existing?.endpoint ?? "", site: existing?.siteId ?? null, intervalSec: existing?.intervalSec ?? 60,
  });
  const fields = (m.error as (Error & { fields?: Record<string, string[]> }) | null)?.fields as FieldErrors;
  const set = <K extends keyof ExporterWrite>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: k === "intervalSec" ? Number(e.target.value) : k === "site" ? (e.target.value || null) : e.target.value }));
  const err = (k: string) => fields?.[k] && <em className="field-error">{fields[k].join(" ")}</em>;
  const submit = () => {
    if (existing) update.mutate({ id: existing.id, ...f }, { onSuccess: () => onSaved(`${existing.name} updated`) });
    else create.mutate(f, { onSuccess: (r) => onSaved(`${r.name} added — run Test to bring it online`) });
  };
  return (
    <Modal title={existing ? `Edit ${existing.name}` : "Add Exporter"} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={submit} disabled={m.isPending || !f.name.trim() || !f.target.trim()}>{m.isPending && <i className="fa-solid fa-spinner fa-spin" />} {existing ? "Save" : "Add Exporter"}</button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="form-grid">
          <label className={`field${fields?.name ? " has-error" : ""}`}><span>Name</span><input value={f.name} onChange={set("name")} disabled={!!existing} maxLength={64} placeholder="node-exporter-05" autoFocus={!existing} />{err("name")}</label>
          <label className="field"><span>Type</span><select value={f.exporterType} onChange={set("exporterType")}>{EXPORTER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field"><span>Category</span><select value={f.category} onChange={set("category")}>{(Object.keys(CATEGORY_META) as ExporterCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}</select></label>
          <label className="field"><span>Site</span><select value={f.site ?? ""} onChange={set("site")}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className={`field${fields?.target ? " has-error" : ""}`}><span>Target / Device</span><input value={f.target} onChange={set("target")} maxLength={200} placeholder="srv-app-05 or https://…" />{err("target")}</label>
          <label className={`field${fields?.endpoint ? " has-error" : ""}`}><span>Exporter endpoint (host:port)</span><input value={f.endpoint} onChange={set("endpoint")} placeholder="10.10.3.205:9100" />{err("endpoint")}</label>
          <label className="field"><span>Scrape interval</span><select value={f.intervalSec} onChange={set("intervalSec")}>{[30, 60, 300, 900].map((s) => <option key={s} value={s}>{s < 60 ? `${s}s` : `${s / 60} min`}</option>)}</select></label>
        </div>
        {m.error && !fields && <div className="field-error">{m.error.message}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const IMPORT_TEMPLATE = "name,exporterType,category,target,endpoint,site,intervalSec\nnode-exporter-09,Node Exporter,servers,srv-app-09,10.10.3.209:9100,br-mum,60\n";

export function ImportModal({ onClose, onDownloadTemplate }: { onClose: () => void; onDownloadTemplate: (csv: string) => void }) {
  const { importRows } = useExporterMutations();
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = React.useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    importRows.reset(); setError(""); setRows(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return setError("File is larger than 1 MB.");
    const parsed = csvToObjects(await file.text()).map((r) => ({ ...r, intervalSec: r.intervalSec ? Number(r.intervalSec) : 60, site: r.site || null }));
    if (!parsed.length) setError("No data rows found.");
    else if (!("name" in parsed[0]) || !("category" in parsed[0])) setError("Missing name/category columns — use the template.");
    else setRows(parsed);
  }
  return (
    <Modal title="Import Exporters" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Close</button>
      <button className="btn primary" disabled={!rows || importRows.isPending || !!importRows.data} onClick={() => rows && importRows.mutate(rows)}>{importRows.isPending && <i className="fa-solid fa-spinner fa-spin" />} Import</button>
    </>}>
      <p className="modal-text">CSV columns: name, exporterType, category, target, endpoint, site, intervalSec. <button className="link-btn" onClick={() => onDownloadTemplate(IMPORT_TEMPLATE)}>Download template</button></p>
      <label className="file-pick"><input type="file" accept=".csv,text/csv" onChange={onFile} /><span className="btn sm">Choose File</span></label>
      {rows && !importRows.data && <div className="cell-sub" style={{ marginTop: 8 }}>{rows.length} row(s) ready.</div>}
      {error && <div className="field-error">{error}</div>}
      {importRows.error && <div className="field-error">{importRows.error.message}</div>}
      {importRows.data && <div className="import-result">
        <div className="ok-text">Imported {importRows.data.created.length}: {importRows.data.created.join(", ") || "none"}</div>
        {importRows.data.errors.map((e) => <div key={e.row} className="crit-text">Row {e.row}: {Object.entries(e.errors).map(([k, v]) => `${k} — ${v.join(" ")}`).join("; ")}</div>)}
      </div>}
    </Modal>
  );
}

export function ExporterDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: e } = useExporter(id);
  return (
    <Modal title={e ? e.name : "Exporter"} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {!e ? <div className="loading">Loading…</div> : (<>
        <InfoTable rows={[
          ["Status", <span className={`pill ${STATUS_META[e.status].cls}`}><i className={`fa-solid ${STATUS_META[e.status].icon}`} /> {STATUS_META[e.status].label}</span>],
          ["Type / Category", `${e.exporterType} · ${CATEGORY_META[e.category].label}`], ["Target", e.target], ["Endpoint", e.endpoint || "—"],
          ["Site", e.siteName ?? "—"], ["Interval", `${e.intervalSec}s`], ["Last seen", relTime(e.lastSeen)], ["Logs (24h)", fmtCount(e.logs24h)],
          ...(e.lastError ? [["Last error", <span className="crit-text">{e.lastError}</span>] as [string, React.ReactNode]] : []),
        ]} />
        {e.hourly.length > 0 && <><div className="mini-title" style={{ marginTop: 12 }}>Log volume (24h)</div>
          <StackedBars height={120} data={e.hourly} labels={e.hourly.map((h) => new Date(h.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }))}
            keys={[{ key: "info", color: "#2563eb", label: "Info" }, { key: "warn", color: "#f59e0b", label: "Warn" }, { key: "error", color: "#ef4444", label: "Error" }]} formatY={fmtCount} /></>}
        <div className="mini-title" style={{ marginTop: 12 }}>Recent logs</div>
        {e.recentLogs.length ? <div className="log-view" style={{ maxHeight: 200 }}>{e.recentLogs.map((l) => (
          <div key={l.id} className={`log-line ${l.level.toLowerCase()}`}><span className="ts">{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</span><span className="lv">{l.level}</span><span>{l.message}</span></div>
        ))}</div> : <div className="empty-row">No recent log lines.</div>}
      </>)}
    </Modal>
  );
}
