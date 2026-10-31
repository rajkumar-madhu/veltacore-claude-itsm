import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBulkImport, useDevices, useDiscover, type DiscoveryResult } from "@/api/hooks";
import { Card } from "@/components/ui";
import { csvToObjects } from "@/lib/csv";
import { formatShort } from "@/lib/series";
import { STATUS_PILL, TYPE_LABEL, downloadText } from "../device/deviceMeta";

export function DiscoveryPanel({ ip, result, running, error, onRun, monitored, onToggleService }: {
  ip: string; result?: DiscoveryResult | null; running: boolean; error?: string;
  onRun: () => void; monitored: string[]; onToggleService: (check: string) => void;
}) {
  return (
    <Card title="Network Discovery" right={
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {result && <span className={`pill ${result.reachable ? "ok" : "warn"}`}><i className={`fa-solid ${result.reachable ? "fa-circle-check" : "fa-triangle-exclamation"}`} /> {result.reachable ? "Discovery Completed" : "No Response"}</span>}
        <button className="btn primary" onClick={onRun} disabled={running || !ip}>{running ? <><i className="fa-solid fa-spinner fa-spin" /> Scanning…</> : "Run Discovery"}</button>
      </div>
    }>
      <div className="cell-sub" style={{ marginBottom: 10 }}>Checks which common service ports answer on the device's IP (TCP connect, private ranges only).</div>
      {error && <div className="banner err"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
      {!result && !error && <div className="empty-row">{ip ? `Run discovery to probe ${ip}.` : "Enter an IP address, then run discovery."}</div>}
      {result && (<>
        <div className={`banner ${result.reachable ? "ok" : "warn"}`}>
          <i className={`fa-solid ${result.reachable ? "fa-circle-check" : "fa-triangle-exclamation"}`} />
          <div style={{ flex: 1 }}><b>{result.reachable ? "Device Found" : "Device did not respond"}</b>
            <div>{result.reachable ? `${result.services.length} open service port(s) on ${result.ip}${result.reverseDns ? ` (${result.reverseDns})` : ""}.` : `None of ${result.portsScanned} common ports answered on ${result.ip}. It may be down, filtered, or not yet cabled.`}</div></div>
          <div className="banner-meta"><span>Discovery Time</span><b>{formatShort(result.discoveredAt)}</b></div>
          <div className="banner-meta"><span>Duration</span><b>{(result.durationMs / 1000).toFixed(1)} s</b></div>
        </div>
        <div className="card-title" style={{ margin: "14px 0 8px", fontSize: 13.5 }}>Discovered Services</div>
        {result.services.length ? (
          <table className="list compact">
            <thead><tr><th>Service</th><th>Port</th><th>Status</th><th>Version / Banner</th><th>Description</th><th>Action</th></tr></thead>
            <tbody>{result.services.map((s) => {
              const check = `${s.service}/${s.port}`; const on = monitored.includes(check);
              return (
                <tr key={s.port}><td className="cell-strong">{s.service}</td><td>{s.port}</td>
                  <td><span className="pill ok"><i className="fa-solid fa-circle-check" /> Open</span></td>
                  <td className="mono">{s.version ?? "—"}</td><td>{s.description}</td>
                  <td><button className={`btn sm${on ? " added" : ""}`} onClick={() => onToggleService(check)}>
                    <i className={`fa-solid ${on ? "fa-check" : "fa-download"}`} /> {on ? "Added" : "Add to Monitoring"}</button></td></tr>
              );
            })}</tbody>
          </table>
        ) : <div className="empty-row">No open services found.</div>}
      </>)}
    </Card>
  );
}

export function RecentDevices() {
  const navigate = useNavigate();
  const { data = [] } = useDevices({ sort: "recent" });
  return (
    <Card title="Recent Onboarded Devices" bodyPad={false} right={<Link className="link-btn" to="/devices">View All</Link>}>
      <table className="list compact">
        <thead><tr><th>Hostname</th><th>IP Address</th><th>Type</th><th>Site</th><th>Status</th><th>Onboarded</th><th></th></tr></thead>
        <tbody>{data.slice(0, 6).map((d) => { const p = STATUS_PILL[d.status]; return (
          <tr key={d.id}><td><Link className="link" to={`/devices/${d.id}`}>{d.hostname}</Link></td><td className="mono">{d.ip}</td><td>{TYPE_LABEL[d.deviceType]}</td><td>{d.siteName}</td>
            <td><span className={`pill ${p.cls}`}><i className={`fa-solid ${p.icon}`} /> {p.label}</span></td><td className="nowrap">{formatShort(d.onboardedAt)}</td>
            <td><button className="icon-btn" title="View" onClick={() => navigate(`/devices/${d.id}`)}><i className="fa-solid fa-eye" /></button></td></tr>
        ); })}</tbody>
      </table>
    </Card>
  );
}

const TEMPLATE_COLUMNS = ["deviceType", "hostname", "ip", "mgmtIp", "site", "environment", "vendor", "model", "osType", "osVersion", "role", "description"];
const TEMPLATE = `${TEMPLATE_COLUMNS.join(",")}\nserver,NSE-APP-05,10.10.1.41,10.10.1.42,br-mum,Production,Dell,PowerEdge R740,Linux,RHEL 8.8,Application Server,"NSE app server, secondary"\nswitch,NSE-SW-07,10.10.1.57,,br-mum,Production,Cisco,Catalyst 2960-X,IOS,15.2(4)E,Access Switch,\n`;
const MAX_SCAN = 10;

export function BulkImport({ onUseIp }: { onUseIp: (ip: string) => void }) {
  const [tab, setTab] = React.useState<"csv" | "scan" | "redmine">("csv");
  const [rows, setRows] = React.useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [parseError, setParseError] = React.useState("");
  const bulk = useBulkImport();
  const discover = useDiscover();
  const [scanInput, setScanInput] = React.useState("");
  const [scanResults, setScanResults] = React.useState<(DiscoveryResult | { ip: string; error: string })[]>([]);
  const [scanning, setScanning] = React.useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    bulk.reset(); setParseError(""); setRows(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 1_000_000) return setParseError("File is larger than 1 MB.");
    const parsed = csvToObjects(await file.text());
    const missing = ["deviceType", "hostname", "ip", "site", "environment"].filter((c) => parsed.length && !(c in parsed[0]));
    if (!parsed.length) setParseError("No data rows found.");
    else if (missing.length) setParseError(`Missing required column(s): ${missing.join(", ")}. Use the template.`);
    else setRows(parsed);
  }

  async function runScan() {
    const ips = scanInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_SCAN);
    setScanning(true); setScanResults([]);
    for (const ip of ips) {
      try { const r = await discover.mutateAsync(ip); setScanResults((p) => [...p, r]); }
      catch (err) { setScanResults((p) => [...p, { ip, error: (err as Error).message }]); }
    }
    setScanning(false);
  }

  return (
    <Card title="Bulk Import Devices">
      <div className="cell-sub" style={{ marginTop: -6, marginBottom: 8 }}>Import multiple devices from CSV or scan a list of addresses</div>
      <div className="tabs small">
        {([["csv", "CSV Import"], ["scan", "Network Scan"], ["redmine", "Redmine Sync"]] as const).map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "csv" && (
        <div className="dropzone">
          <i className="fa-solid fa-cloud-arrow-up" />
          <div style={{ flex: 1 }}>
            <b>Upload CSV File</b>
            <div className="cell-sub">Columns: {TEMPLATE_COLUMNS.join(", ")} (max 500 rows)</div>
            <label className="file-pick"><input type="file" accept=".csv,text/csv" onChange={onFile} /><span className="btn sm">Choose File</span> <span className="cell-sub">{fileName || "No file chosen"}</span></label>
            {parseError && <div className="field-error">{parseError}</div>}
            {rows && !bulk.data && <div className="cell-sub" style={{ marginTop: 6 }}>{rows.length} row(s) ready to import.</div>}
            {bulk.error && <div className="field-error">{bulk.error.message}</div>}
            {bulk.data && (
              <div className="import-result">
                <div className="ok-text"><i className="fa-solid fa-circle-check" /> Imported {bulk.data.created.length}: {bulk.data.created.join(", ") || "none"}</div>
                {bulk.data.errors.map((e) => (
                  <div key={e.row} className="crit-text">Row {e.row}: {Object.entries(e.errors).map(([k, v]) => `${k} — ${v.join(" ")}`).join("; ")}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <button className="link-btn" onClick={() => downloadText("argus-device-import-template.csv", TEMPLATE)}><i className="fa-solid fa-download" /> Download Template</button>
            <button className="btn primary" disabled={!rows || bulk.isPending} onClick={() => rows && bulk.mutate(rows)}>{bulk.isPending && <i className="fa-solid fa-spinner fa-spin" />} Import Devices</button>
          </div>
        </div>
      )}

      {tab === "scan" && (
        <div>
          <label className="field"><span>IP addresses (up to {MAX_SCAN}, comma or space separated)</span>
            <textarea rows={2} value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="10.10.1.21, 10.10.1.22" /></label>
          <button className="btn primary sm" disabled={scanning || !scanInput.trim()} onClick={runScan}>{scanning && <i className="fa-solid fa-spinner fa-spin" />} Scan</button>
          {scanResults.length > 0 && (
            <table className="list compact" style={{ marginTop: 10 }}>
              <thead><tr><th>IP</th><th>Result</th><th></th></tr></thead>
              <tbody>{scanResults.map((r) => (
                <tr key={r.ip}><td className="mono">{r.ip}</td>
                  <td>{"error" in r ? <span className="crit-text">{r.error}</span> : r.reachable ? <span className="ok-text">{r.services.map((s) => `${s.service}/${s.port}`).join(", ")}</span> : <span className="muted-text">no response</span>}</td>
                  <td>{!("error" in r) && <button className="link-btn" onClick={() => onUseIp(r.ip)}>Use in form</button>}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === "redmine" && (
        <div className="empty-row"><i className="fa-solid fa-plug-circle-xmark" /> Redmine isn't connected for this workspace, so there's nothing to sync yet.</div>
      )}
    </Card>
  );
}
