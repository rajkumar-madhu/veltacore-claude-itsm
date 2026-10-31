import React from "react";
import { Link } from "react-router-dom";
import { useItsmList } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, Meter } from "@/components/ui";
import { formatShort } from "@/lib/series";

interface Prov { id: string; hostname: string; deviceType: string; ip: string; site: string; onboardedAt: string; status: string; tasks: { task: string; done: boolean }[]; done: number }

const FIX: Record<string, [string, (id: string) => string]> = {
  "Reachable (discovery or poll)": ["Run discovery", () => "/onboarding/discovery"],
  "Registered in CMDB": ["Sync CMDB", () => "/cmdb/cis"],
  "Monitoring checks configured": ["Add checks", (id) => `/devices/${id}`],
  "Exporter / agent reporting": ["Exporters", () => "/exporters"],
  "Owner / contact set": ["Edit device", (id) => `/devices/${id}`],
};

export default function ProvisioningScreen() {
  const { data = [], isError, isLoading, refetch } = useItsmList<Prov>("/provisioning/", {}, { refetchInterval: 60_000 });
  const [onlyOpen, setOnlyOpen] = React.useState(false);
  const rows = data.filter((d) => !onlyOpen || d.done < d.tasks.length).sort((a, b) => a.done / a.tasks.length - b.done / b.tasks.length);
  const complete = data.filter((d) => d.done === d.tasks.length).length;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Onboarding" }, { label: "Provisioning" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-list-check" /><div><h1 className="page-title">Provisioning</h1>
        <div className="page-sub">Readiness checklist for every onboarded device, worked out from live inventory, CMDB and monitoring data</div></div></div>
        <label className="btn" style={{ cursor: "pointer" }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Incomplete only</label>
      </div>
      {isError ? <ApiDown what="provisioning" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <div className="kpi-strip">
          <div className="kpi"><div className="l">Devices</div><div className="v">{data.length}</div></div>
          <div className="kpi tone-ok"><div className="l">Fully provisioned</div><div className="v">{complete}</div></div>
          <div className={`kpi${data.length - complete ? " tone-warn" : ""}`}><div className="l">Need attention</div><div className="v">{data.length - complete}</div></div>
          <div className="kpi"><div className="l">Open tasks</div><div className="v">{data.reduce((s, d) => s + d.tasks.length - d.done, 0)}</div></div>
        </div>
        <div className="catalog-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {rows.map((d) => {
            const pct = Math.round((d.done / d.tasks.length) * 100);
            return (
              <Card key={d.id} title={<Link className="link" to={`/devices/${d.id}`}>{d.hostname}</Link>} right={<span className={`pill ${pct === 100 ? "ok" : "warn"}`}>{d.done}/{d.tasks.length}</span>}>
                <div className="cell-sub" style={{ marginBottom: 8 }}>{d.deviceType.replace("_", " ")} · <span className="mono">{d.ip}</span> · {d.site} · onboarded {formatShort(d.onboardedAt)}</div>
                <Meter pct={pct} color={pct === 100 ? "var(--ok)" : "#f59e0b"} />
                <ul className="stat-list" style={{ marginTop: 8 }}>{d.tasks.map((t) => (
                  <li key={t.task}><span><i className={`fa-solid ${t.done ? "fa-circle-check" : "fa-circle"}`} style={{ color: t.done ? "var(--ok)" : "#cbd5e1", width: 18 }} />{t.task}</span>
                    {!t.done && FIX[t.task] && <Link className="link-btn" to={FIX[t.task][1](d.id)}>{FIX[t.task][0]}</Link>}</li>
                ))}</ul>
              </Card>
            );
          })}
        </div>
      </>}
    </div>
  );
}
