import React from "react";
import { Link } from "react-router-dom";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { useToast } from "@/lib/useToast";

interface Data {
  metrics: { metric: string; label: string; warn: number; crit: number; higherIsBetter: boolean }[];
  slos: { id: string; name: string; service: string; target: number; actual: number; window: string }[];
}

export default function ThresholdsScreen() {
  const { data, isError, isLoading, refetch } = useItsmGet<Data>("/thresholds/");
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [toast, setToast] = useToast();
  const save = useItsmMutation<{ id: string; target: number }>("PATCH", (v) => `/slos/${v.id}/target/`, (v) => ({ target: v.target }));

  function commit(id: string) {
    const v = Number(edits[id]);
    save.mutate({ id, target: v }, {
      onSuccess: () => { setEdits(({ [id]: _, ...rest }) => rest); setToast({ kind: "ok", text: `Target set to ${v}%` }); },
      onError: (e) => setToast({ kind: "err", text: e.message }),
    });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Administration" }, { label: "Thresholds / SLOs" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-sliders" /><div><h1 className="page-title">Thresholds &amp; SLOs</h1>
          <div className="page-sub">Health thresholds that colour the heatmap and domains, and the service-level objectives behind them</div></div></div>
        <Link className="btn" to="/slos"><i className="fa-solid fa-bullseye" /> SLO dashboard</Link>
      </div>
      {isError ? <ApiDown what="thresholds" retry={() => refetch()} /> : isLoading || !data ? <div className="loading">Loading…</div> : <>
        <Card title="SLO targets" icon="fa-bullseye" bodyPad={false}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>SLO</th><th>Service</th><th>Window</th><th>Current</th><th>Target</th><th>Error budget</th><th /></tr></thead>
            <tbody>{data.slos.map((s) => {
              const val = edits[s.id] ?? String(s.target);
              const t = Number(val), valid = !Number.isNaN(t) && t >= 50 && t < 100;
              const budget = 100 - s.target;
              // share of the error budget not yet spent: (actual - target) / (100 - target)
              const remaining = budget > 0 ? Math.max(0, ((s.actual - s.target) / budget) * 100) : 0;
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b><div className="cell-sub mono">{s.id}</div></td><td className="mono">{s.service}</td><td>{s.window}</td>
                  <td><span className={`pill ${s.actual >= s.target ? "ok" : "crit"}`}>{s.actual}%</span></td>
                  <td><input aria-label={`${s.name} target`} className="select-sm" style={{ width: 90, borderColor: valid ? undefined : "var(--crit)" }} type="number" step="0.01" min={50} max={99.999}
                    value={val} onChange={(e) => setEdits({ ...edits, [s.id]: e.target.value })} /> %</td>
                  <td className="cell-sub">{s.actual >= s.target ? `${Math.min(100, remaining).toFixed(0)}% left` : "exhausted"}</td>
                  <td>{edits[s.id] !== undefined && Number(edits[s.id]) !== s.target && <button className="btn sm primary" disabled={!valid || save.isPending} onClick={() => commit(s.id)}>Save</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
        <Card title="Health thresholds" icon="fa-temperature-half" className="mt" bodyPad={false}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Signal</th><th>Warning at</th><th>Critical at</th><th>Direction</th></tr></thead>
            <tbody>{data.metrics.map((m) => (
              <tr key={m.metric}><td><b>{m.label}</b><div className="cell-sub mono">{m.metric}</div></td>
                <td><span className="pill warn">{m.higherIsBetter ? "below" : "above"} {m.warn}</span></td>
                <td><span className="pill crit">{m.higherIsBetter ? "below" : "above"} {m.crit}</span></td>
                <td className="cell-sub">{m.higherIsBetter ? "Higher is better" : "Lower is better"}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="card-foot">These thresholds are defined in the platform's health engine and apply to every domain; saturation signals (CPU, memory, disk, network) can raise a domain to warning but never to critical on their own.</div>
        </Card>
      </>}
      {toast}
    </div>
  );
}
