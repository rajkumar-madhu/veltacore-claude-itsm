import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDevices, type DeviceType } from "@/api/hooks";
import { ApiDown, Breadcrumbs } from "@/components/ui";
import { formatShort, formatUptime } from "@/lib/series";
import { STATUS_PILL, TYPE_ICON, TYPE_LABEL, TYPE_PLURAL } from "./deviceMeta";

export default function DeviceListScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") as DeviceType | null) ?? undefined;
  const { data, isLoading, isError, refetch } = useDevices({ type });
  const [q, setQ] = React.useState("");
  const all = data ?? [];
  const rows = all.filter((d) => !q || `${d.hostname} ${d.ip} ${d.vendor} ${d.model} ${d.role}`.toLowerCase().includes(q.toLowerCase()));
  const online = all.filter((d) => d.status === "online").length;
  const title = type ? TYPE_PLURAL[type] : "All Devices";

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Network Devices", to: "/devices" }, ...(type ? [{ label: TYPE_PLURAL[type] }] : [])]} />
      <div className="page-head">
        <div><h1 className="page-title">{title}</h1><div className="page-sub">{all.length} devices · {online} online · {all.length - online} offline/unknown</div></div>
        <Link className="btn primary" to="/onboarding"><i className="fa-solid fa-plus" /> Add Device</Link>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search hostname, IP, vendor, model, role…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select-sm" value={type ?? ""} onChange={(e) => setParams(e.target.value ? { type: e.target.value } : {})}>
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        {isError ? <ApiDown what="devices" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading devices…</div> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th>Hostname</th><th>Status</th><th>Type</th><th>Vendor / Model</th><th>IP Address</th><th>Site</th><th>Role</th><th>Uptime</th><th>Last Seen</th></tr></thead>
            <tbody>
              {rows.map((d) => { const p = STATUS_PILL[d.status]; return (
                <tr key={d.id} className="row-clickable" onClick={() => navigate(`/devices/${d.id}`)}>
                  <td className="cell-strong link">{d.hostname}</td>
                  <td><span className={`pill ${p.cls}`}><i className={`fa-solid ${p.icon}`} /> {p.label}</span></td>
                  <td><i className={`fa-solid ${TYPE_ICON[d.deviceType]}`} /> {TYPE_LABEL[d.deviceType]}</td>
                  <td>{d.vendor} {d.model}</td><td className="mono">{d.ip}</td><td>{d.siteName}</td><td>{d.role || "—"}</td>
                  <td>{formatUptime(d.uptimeSeconds)}</td><td>{d.lastSeen ? formatShort(d.lastSeen) : "never"}</td>
                </tr>); })}
              {!rows.length && <tr><td colSpan={9} className="empty-row">No devices match.</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
