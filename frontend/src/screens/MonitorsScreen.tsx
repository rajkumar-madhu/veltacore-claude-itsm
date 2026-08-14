import React from "react";
import { useMonitors } from "@/api/hooks";
import { SEED_MONITORS } from "@/lib/seed";

const STATE_PILL: Record<string, { cls: string; label: string; icon: string }> = {
  ok: { cls: "ok", label: "OK", icon: "fa-circle-check" },
  warn: { cls: "warn", label: "Warn", icon: "fa-triangle-exclamation" },
  alert: { cls: "crit", label: "Alert", icon: "fa-fire" },
  nodata: { cls: "muted", label: "No Data", icon: "fa-circle-question" },
};

export default function MonitorsScreen() {
  const MONITORS = useMonitors().data ?? SEED_MONITORS;
  const [selId, setSelId] = React.useState("MON-01");
  const sel = MONITORS.find((m) => m.id === selId) ?? MONITORS[0];

  const alerting = MONITORS.filter((m) => m.state === "alert").length;
  const warning = MONITORS.filter((m) => m.state === "warn").length;

  return (
    <div className="page">
      <h1 className="page-title">Monitors</h1>
      <div className="page-sub">Metric · anomaly · composite · log · synthetic alert rules</div>

      <div className="kpi-strip">
        <div className="kpi"><div className="l">Monitors</div><div className="v">{MONITORS.length}</div><div className="s">configured</div></div>
        <div className={`kpi ${alerting > 0 ? "tone-crit" : "tone-ok"}`}><div className="l">Alerting</div><div className="v">{alerting}</div><div className="s">critical threshold</div></div>
        <div className="kpi tone-warn"><div className="l">Warning</div><div className="v">{warning}</div><div className="s">warn threshold</div></div>
      </div>

      <div className="two-col">
        <div className="card">
          <table className="list">
            <thead><tr><th>Monitor</th><th>Type</th><th>State</th><th>Every</th><th>Since</th></tr></thead>
            <tbody>
              {MONITORS.map((m) => {
                const p = STATE_PILL[m.state] ?? STATE_PILL.ok;
                return (
                  <tr key={m.id} className="row-clickable" onClick={() => setSelId(m.id)} style={{ background: sel?.id === m.id ? "#eff6ff" : undefined }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 10.5, color: "#8a94a3", fontFamily: "monospace" }}>{m.query}</div>
                    </td>
                    <td><span className="pill muted">{m.type}</span></td>
                    <td><span className={`pill ${p.cls}`}><i className={`fa-solid ${p.icon}`} /> {p.label}</span></td>
                    <td>{m.window}</td>
                    <td style={{ color: "#8a94a3" }}>{m.since}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside className="side-panel">
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{sel.name}</div>
              <div style={{ fontSize: 11, color: "#8a94a3", marginBottom: 12 }}>{sel.type} · {sel.scope}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11.5, background: "#f8fafc", border: "1px solid #eef1f4", borderRadius: 6, padding: "8px 10px", wordBreak: "break-all", marginBottom: 12 }}>{sel.query}</div>
              <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                <div><b style={{ color: "#b45309" }}>Warn ≥</b> {sel.warn}</div>
                <div><b style={{ color: "#dc2626" }}>Crit ≥</b> {sel.crit}</div>
                <div><b>Window</b> {sel.window}</div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
