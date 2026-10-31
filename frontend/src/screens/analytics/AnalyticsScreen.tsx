import { Link } from "react-router-dom";
import { useItsmGet } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { BarList, DailyBars } from "./Charts";

interface Analytics {
  days: string[]; incidentsOpened: number[]; incidentsResolved: number[]; alerts: number[]; mttrHours: number | null; slaCompliance: number | null;
  ticketsByCategory: Record<string, number>; ticketsByGroup: Record<string, number>; alertsBySource: Record<string, number>; topCis: { name: string; count: number }[];
}

const sorted = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => [k || "Uncategorised", v] as [string, number]).sort((a, b) => b[1] - a[1]);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function AnalyticsScreen() {
  const { data: a, isError, isLoading, refetch } = useItsmGet<Analytics>("/analytics/", { refetchInterval: 60_000 });
  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Analytics" }, { label: "Dashboards" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-chart-pie" /><div><h1 className="page-title">Operations Analytics</h1>
          <div className="page-sub">Incident flow, service levels and alert noise over the last 14 days</div></div></div>
        <Link className="btn" to="/reports"><i className="fa-solid fa-file-csv" /> Reports</Link>
      </div>
      {isError ? <ApiDown what="analytics" retry={() => refetch()} /> : isLoading || !a ? <div className="loading">Loading…</div> : <>
        <div className="kpi-strip">
          <div className="kpi"><div className="l">Incidents opened (14d)</div><div className="v">{sum(a.incidentsOpened)}</div><div className="s">{sum(a.incidentsResolved)} resolved</div></div>
          <div className="kpi"><div className="l">Mean time to resolve</div><div className="v">{a.mttrHours === null ? "—" : `${a.mttrHours}h`}</div><div className="s">resolved incidents</div></div>
          <div className={`kpi${a.slaCompliance !== null && a.slaCompliance < 95 ? " tone-warn" : ""}`}><div className="l">SLA compliance</div><div className="v">{a.slaCompliance === null ? "—" : `${a.slaCompliance}%`}</div><div className="s">target 95%</div></div>
          <div className="kpi"><div className="l">Alerts (14d)</div><div className="v">{sum(a.alerts)}</div><div className="s">{Object.keys(a.alertsBySource).length} sources</div></div>
        </div>
        <div className="grid-2">
          <Card title="Incidents opened vs resolved per day" icon="fa-fire">
            <DailyBars days={a.days} series={[
              { key: "opened", label: "Opened", color: "#2a78d6", values: a.incidentsOpened },
              { key: "resolved", label: "Resolved", color: "#eb6834", values: a.incidentsResolved },
            ]} />
          </Card>
          <Card title="Alerts per day" icon="fa-bell">
            <DailyBars days={a.days} series={[{ key: "alerts", label: "Alerts", color: "#2a78d6", values: a.alerts }]} />
          </Card>
        </div>
        <div className="grid-3">
          <Card title="Tickets by category"><BarList data={sorted(a.ticketsByCategory)} /></Card>
          <Card title="Tickets by assignment group"><BarList data={sorted(a.ticketsByGroup)} /></Card>
          <Card title="Alerts by source"><BarList data={sorted(a.alertsBySource)} /></Card>
        </div>
        <Card title="CIs with the most tickets" icon="fa-cubes" className="mt">
          <BarList data={a.topCis.map((c) => [c.name, c.count])} empty="No tickets linked to CIs yet." />
          <p className="cell-sub" style={{ marginBottom: 0 }}>Tickets raised against each CI. Frequent offenders are candidates for a problem record.</p>
        </Card>
      </>}
    </div>
  );
}
