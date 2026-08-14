import { useNavigate } from "react-router-dom";
import { useSlos, useMonitors, useSynthetics, useSites } from "@/api/hooks";
import { SEED_SLOS, SEED_MONITORS, SEED_SYNTHETICS, SEED_SITES } from "@/lib/seed";
import { WorldMap } from "@/components/WorldMap";

export default function DashboardScreen() {
  const navigate = useNavigate();

  const slos = useSlos().data ?? SEED_SLOS;
  const monitors = useMonitors().data ?? SEED_MONITORS;
  const synthetics = useSynthetics().data ?? SEED_SYNTHETICS;
  const sites = useSites().data ?? SEED_SITES;

  const slosBreaching = slos.filter((s) => s.actual < s.target).length;
  const monitorsAlerting = monitors.filter((m) => m.state === "alert").length;
  const monitorsWarning = monitors.filter((m) => m.state === "warn").length;
  const syntheticsDown = synthetics.filter((c) => c.status === "down" || c.status === "degraded").length;
  const obsIssues = slosBreaching + monitorsAlerting + syntheticsDown;

  const totalDevices = sites.reduce((a, s) => a + s.devices, 0);
  const avgHealth = sites.length ? Math.round(sites.reduce((a, s) => a + s.health, 0) / sites.length) : 100;

  return (
    <div className="page">
      <h1 className="page-title">Operations Dashboard</h1>
      <div className="page-sub">Live cross-region view · {sites.length} sites · {totalDevices.toLocaleString()} monitored devices</div>

      <div className="kpi-strip">
        <div className="kpi tone-ok"><div className="l">Sites</div><div className="v">{sites.length}</div><div className="s">{avgHealth}% avg health</div></div>
        <div className={`kpi ${slosBreaching > 0 ? "tone-crit" : "tone-ok"}`}><div className="l">SLOs breaching</div><div className="v">{slosBreaching}/{slos.length}</div><div className="s">error budget</div></div>
        <div className={`kpi ${monitorsAlerting > 0 ? "tone-crit" : "tone-ok"}`}><div className="l">Monitors alerting</div><div className="v">{monitorsAlerting}/{monitors.length}</div><div className="s">{monitorsWarning} warning</div></div>
        <div className={`kpi ${syntheticsDown > 0 ? "tone-crit" : "tone-ok"}`}><div className="l">Synthetics down</div><div className="v">{syntheticsDown}/{synthetics.length}</div><div className="s">uptime checks</div></div>
      </div>

      <div className="two-col">
        <div style={{ minWidth: 0 }}>
          <WorldMap />
        </div>

        <aside className="side-panel">
          <div className="card">
            <div className="card-head">
              Observability
              {obsIssues > 0
                ? <span className="badge" style={{ background: "#fef2f2", color: "#dc2626" }}>{obsIssues} issue{obsIssues === 1 ? "" : "s"}</span>
                : <span className="badge" style={{ background: "#ecfdf5", color: "#059669" }}>all clear</span>}
            </div>
            <div style={{ padding: "4px 0" }}>
              {[
                { label: "SLOs breaching", n: slosBreaching, total: slos.length, to: "/slos", icon: "fa-bullseye" },
                { label: "Monitors alerting", n: monitorsAlerting, total: monitors.length, to: "/monitors", icon: "fa-bell" },
                { label: "Synthetics failing", n: syntheticsDown, total: synthetics.length, to: "/synthetics", icon: "fa-globe" },
              ].map((row) => (
                <div key={row.to} onClick={() => navigate(row.to)}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
                  <i className={`fa-solid ${row.icon}`} style={{ width: 14, color: row.n > 0 ? "#dc2626" : "#8a94a3", fontSize: 12 }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: "#334155" }}>{row.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: row.n > 0 ? "#dc2626" : "#059669" }}>{row.n}/{row.total}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">Sites</div>
            <div style={{ padding: "4px 0" }}>
              {sites.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.health >= 95 ? "#059669" : s.health >= 80 ? "#f2a01e" : "#dc2626", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>{s.name}</span>
                  <span style={{ fontSize: 11.5, color: "#8a94a3" }}>{s.health}%</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
