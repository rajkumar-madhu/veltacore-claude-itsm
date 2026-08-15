import { useSlos } from "@/api/hooks";
import { TONE_COLOR } from "@/lib/status";
import { useSelectedRow } from "@/lib/useSelectedRow";

function budgetRemainingPct(target: number, actual: number) {
  const allowed = 100 - target;
  if (allowed <= 0) return actual >= target ? 100 : 0;
  const remaining = Math.min(1, Math.max(0, (actual - target) / allowed + 1));
  return Math.round(remaining * 100);
}

export default function SlosScreen() {
  const SLOS = useSlos().data;
  const [sel, setSelId] = useSelectedRow(SLOS);

  const healthy = SLOS.filter((s) => s.actual >= s.target).length;
  const breaching = SLOS.length - healthy;
  const b = sel ? budgetRemainingPct(sel.target, sel.actual) : 0;

  return (
    <div className="page">
      <h1 className="page-title">Service Level Objectives</h1>
      <div className="page-sub">Error-budget tracking across trading &amp; platform services</div>

      <div className="kpi-strip">
        <div className="kpi"><div className="l">Objectives</div><div className="v">{SLOS.length}</div><div className="s">tracked</div></div>
        <div className="kpi tone-ok"><div className="l">On track</div><div className="v">{healthy}</div><div className="s">within budget</div></div>
        <div className={`kpi ${breaching > 0 ? "tone-crit" : "tone-ok"}`}><div className="l">Breaching</div><div className="v">{breaching}</div><div className="s">budget exhausted</div></div>
      </div>

      <div className="two-col">
        <div className="card">
          <table className="list">
            <thead>
              <tr><th>Objective</th><th>Type</th><th>Target</th><th>Actual</th><th>Error budget</th></tr>
            </thead>
            <tbody>
              {SLOS.map((s) => {
                const ok = s.actual >= s.target;
                const bb = budgetRemainingPct(s.target, s.actual);
                return (
                  <tr key={s.id} className="row-clickable" onClick={() => setSelId(s.id)} style={{ background: sel?.id === s.id ? "#eff6ff" : undefined }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#8a94a3" }}>{s.service}</div>
                    </td>
                    <td><span className="pill muted">{s.type}</span></td>
                    <td>{s.target}%</td>
                    <td style={{ fontWeight: 700, color: ok ? TONE_COLOR.ok : TONE_COLOR.crit }}>{s.actual}%</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${bb}%`, height: "100%", background: ok ? "#10b981" : "#dc2626", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, minWidth: 30 }}>{bb}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside className="side-panel">
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{sel.name}</div>
              <div style={{ fontSize: 11, color: "#8a94a3", marginBottom: 14 }}>{sel.service} · {sel.window} window</div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, textAlign: "center", padding: "10px 6px", background: "#f8fafc", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: sel.actual >= sel.target ? TONE_COLOR.ok : TONE_COLOR.crit }}>{sel.actual}%</div>
                  <div style={{ fontSize: 10.5, color: "#8a94a3" }}>SLI vs {sel.target}% target</div>
                </div>
                <div style={{ flex: 1, textAlign: "center", padding: "10px 6px", background: "#f8fafc", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: b > 0 ? TONE_COLOR.ok : TONE_COLOR.crit }}>{b}%</div>
                  <div style={{ fontSize: 10.5, color: "#8a94a3" }}>budget remaining</div>
                </div>
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 6, background: sel.burnRate >= 2 ? "#fef2f2" : "#ecfdf5" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: sel.burnRate >= 2 ? "#b91c1c" : "#047857" }}>
                  {sel.burnRate >= 2 ? `Fast burn — ${sel.burnRate}× budget` : "Healthy burn rate"}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
