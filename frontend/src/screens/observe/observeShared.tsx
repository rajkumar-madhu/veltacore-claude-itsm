import React from "react";
import { Link } from "react-router-dom";
import type { Health, MetricKey } from "@/api/hooks";
import { HEALTH_LABEL, HEALTH_TONE, useServices, type Svc } from "./observeMeta";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";

const COLS: [MetricKey, string, (v: number) => string][] = [
  ["availability", "Availability", (v) => `${v}%`], ["latencyP95Ms", "p95", (v) => `${Math.round(v)} ms`], ["errorRate", "Errors", (v) => `${v}%`],
  ["cpuPct", "CPU", (v) => `${Math.round(v)}%`], ["memPct", "Memory", (v) => `${Math.round(v)}%`],
];

export function ServicesTable({ services }: { services: Svc[] }) {
  return (
    <div className="table-wrap"><table className="list compact">
      <thead><tr><th>Service</th><th>Domain</th><th>Host</th>{COLS.map(([, l]) => <th key={l}>{l}</th>)}<th>Health</th><th /></tr></thead>
      <tbody>
        {services.map((s) => (
          <tr key={s.id}>
            <td><b>{s.name}</b></td>
            <td><Link className="link" to={`/heatmap?domain=${s.domainId}`}>{s.domainName}</Link></td>
            <td className="mono cell-sub">{s.host}</td>
            {COLS.map(([k, , f]) => {
              const v = s.values[k], st = s.statuses[k];
              return <td key={k}>{v === null || v === undefined ? "—" : <span className={st === "ok" || st === "unknown" ? "" : `${st === "crit" ? "crit" : "warn"}-text`} style={{ fontWeight: st === "ok" ? 400 : 700 }}>{f(v)}</span>}</td>;
            })}
            <td><span className={`pill ${HEALTH_TONE[s.health]}`}>{HEALTH_LABEL[s.health]}</span></td>
            <td><Link className="link" to={`/investigate/health?service=${s.id}`} title="Health / RCA"><i className="fa-solid fa-magnifying-glass-chart" /></Link></td>
          </tr>
        ))}
        {!services.length && <tr><td colSpan={COLS.length + 5} className="empty-row">No services in this view.</td></tr>}
      </tbody>
    </table></div>
  );
}

export function HealthKpis({ services }: { services: Svc[] }) {
  const n = (h: Health) => services.filter((s) => s.health === h).length;
  const avail = services.filter((s) => s.values.availability !== null);
  return (
    <div className="kpi-strip">
      <div className="kpi"><div className="l">Services</div><div className="v">{services.length}</div></div>
      <div className="kpi tone-ok"><div className="l">Healthy</div><div className="v">{n("ok")}</div></div>
      <div className={`kpi${n("warn") + n("crit") ? " tone-crit" : ""}`}><div className="l">Degraded / critical</div><div className="v">{n("warn")} / {n("crit")}</div></div>
      <div className="kpi"><div className="l">Avg availability</div><div className="v">{avail.length ? `${(avail.reduce((a, s) => a + (s.values.availability ?? 0), 0) / avail.length).toFixed(2)}%` : "—"}</div></div>
    </div>
  );
}

/** Page shell for a filtered service view (Applications, Databases, Middleware). */
export function ServicesPage({ title, icon, sub, crumb, filter, extra }: {
  title: string; icon: string; sub: string; crumb: string; filter: (s: Svc) => boolean; extra?: React.ReactNode;
}) {
  const { services, isError, isLoading, refetch } = useServices(filter);
  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: crumb }]} />
      <div className="page-head"><div className="title-with-icon"><i className={`fa-solid ${icon}`} /><div><h1 className="page-title">{title}</h1><div className="page-sub">{sub}</div></div></div></div>
      {isError ? <ApiDown what="services" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <HealthKpis services={services} />
        <Card title="Golden signals" icon="fa-wave-square" bodyPad={false}><ServicesTable services={[...services].sort((a, b) => ["crit", "warn", "unknown", "ok"].indexOf(a.health) - ["crit", "warn", "unknown", "ok"].indexOf(b.health))} /></Card>
        {extra}
      </>}
    </div>
  );
}
