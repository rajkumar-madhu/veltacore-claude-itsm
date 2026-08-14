import React from "react";
import { useSynthetics } from "@/api/hooks";
import { SEED_SYNTHETICS } from "@/lib/seed";

const STATUS_PILL: Record<string, { cls: string; label: string; icon: string }> = {
  up: { cls: "ok", label: "Up", icon: "fa-circle-check" },
  degraded: { cls: "warn", label: "Degraded", icon: "fa-triangle-exclamation" },
  down: { cls: "crit", label: "Down", icon: "fa-circle-xmark" },
};

export default function SyntheticsScreen() {
  const CHECKS = useSynthetics().data ?? SEED_SYNTHETICS;
  const [selId, setSelId] = React.useState("SYN-01");
  const sel = CHECKS.find((c) => c.id === selId) ?? CHECKS[0];

  const upCount = CHECKS.filter((c) => c.status === "up").length;
  const fleetUptime = CHECKS.length ? (CHECKS.reduce((s, c) => s + c.uptime, 0) / CHECKS.length).toFixed(2) : "0";

  return (
    <div className="page">
      <h1 className="page-title">Synthetic Monitoring</h1>
      <div className="page-sub">Uptime &amp; API checks from global probes · {fleetUptime}% fleet availability</div>

      <div className="kpi-strip">
        <div className="kpi tone-ok"><div className="l">Fleet availability</div><div className="v">{fleetUptime}%</div><div className="s">30-day window</div></div>
        <div className={`kpi ${upCount === CHECKS.length ? "tone-ok" : "tone-warn"}`}><div className="l">Checks up</div><div className="v">{upCount}/{CHECKS.length}</div><div className="s">across all probes</div></div>
        <div className="kpi tone-crit"><div className="l">Failing now</div><div className="v">{CHECKS.filter((c) => c.status !== "up").length}</div><div className="s">degraded or down</div></div>
      </div>

      <div className="two-col">
        <div className="card">
          <table className="list">
            <thead><tr><th>Check</th><th>Type</th><th>Uptime</th><th>P95</th><th>Status</th></tr></thead>
            <tbody>
              {CHECKS.map((c) => {
                const p = STATUS_PILL[c.status] ?? STATUS_PILL.up;
                return (
                  <tr key={c.id} className="row-clickable" onClick={() => setSelId(c.id)} style={{ background: sel?.id === c.id ? "#eff6ff" : undefined }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#8a94a3" }}>{c.target}</div>
                    </td>
                    <td><span className="pill muted">{c.type}</span></td>
                    <td style={{ fontWeight: 700, color: c.uptime >= 99.9 ? "#059669" : c.uptime >= 99 ? "#b45309" : "#dc2626" }}>{c.uptime.toFixed(2)}%</td>
                    <td>{c.p95}ms</td>
                    <td><span className={`pill ${p.cls}`}><i className={`fa-solid ${p.icon}`} /> {p.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside className="side-panel">
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{sel.name}</div>
              <div style={{ fontSize: 11, color: "#8a94a3", marginBottom: 12 }}>{sel.target}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Interval</span><b>{sel.interval}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Locations</span><b>{sel.locations}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Last run</span><b>{sel.lastRun}</b></div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
