import { Link } from "react-router-dom";
import { useItsmGet } from "@/api/itsm";
import { useDomains } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { HEALTH_LABEL, HEALTH_TONE } from "./observeMeta";

interface Overview {
  domains: Record<string, number>; devices: { total: number; online: number }; vms: { total: number; running: number };
  exporters: { total: number; active: number }; alerts: Record<string, number>; tickets: { open: number; p1: number };
  uptime: { total: number; up: number }; slos: { total: number; breaching: number }; cis: number;
}

export default function ObserveOverviewScreen() {
  const { data: o, isError, isLoading, refetch } = useItsmGet<Overview>("/overview/", { refetchInterval: 30_000 });
  const { data: domains = [] } = useDomains();
  const tiles: { to: string; icon: string; label: string; value: string; sub: string; tone?: string }[] = o ? [
    { to: "/devices", icon: "fa-network-wired", label: "Devices online", value: `${o.devices.online}/${o.devices.total}`, sub: "network & servers", tone: o.devices.online < o.devices.total ? "warn" : "ok" },
    { to: "/vms", icon: "fa-cube", label: "VMs running", value: `${o.vms.running}/${o.vms.total}`, sub: "all platforms", tone: o.vms.running < o.vms.total ? "warn" : "ok" },
    { to: "/exporters", icon: "fa-gear", label: "Exporters active", value: `${o.exporters.active}/${o.exporters.total}`, sub: "metrics & logs collectors" },
    { to: "/alerts", icon: "fa-bell", label: "Critical alerts", value: String(o.alerts.critical ?? 0), sub: `${o.alerts.warning ?? 0} warning firing`, tone: o.alerts.critical ? "crit" : "ok" },
    { to: "/uptime", icon: "fa-heart-pulse", label: "Uptime checks up", value: `${o.uptime.up}/${o.uptime.total}`, sub: "HTTP & TCP", tone: o.uptime.up < o.uptime.total ? "warn" : "ok" },
    { to: "/slos", icon: "fa-bullseye", label: "SLOs breaching", value: String(o.slos.breaching), sub: `of ${o.slos.total}`, tone: o.slos.breaching ? "crit" : "ok" },
    { to: "/tickets?type=incident", icon: "fa-fire", label: "Open P1 tickets", value: String(o.tickets.p1), sub: `${o.tickets.open} open tickets`, tone: o.tickets.p1 ? "crit" : "ok" },
    { to: "/cmdb/cis", icon: "fa-cubes", label: "Configuration items", value: String(o.cis), sub: "in the CMDB" },
  ] : [];
  const areas = [
    ["/observe/applications", "fa-window-restore", "Applications"], ["/observe/kubernetes", "fa-dharmachakra", "Kubernetes"], ["/observe/databases", "fa-database", "Databases"],
    ["/observe/middleware", "fa-layer-group", "Middleware"], ["/observe/network", "fa-network-wired", "Network"], ["/observe/availability", "fa-heart-pulse", "Availability"],
    ["/observe/metrics", "fa-chart-column", "Metrics Explorer"], ["/observe/logs", "fa-file-lines", "Logs"], ["/observe/traces", "fa-route", "Traces"],
  ];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Observe" }, { label: "Overview" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-eye" /><div><h1 className="page-title">Observability Overview</h1>
        <div className="page-sub">Live state of every signal Argus collects, one click from the detail</div></div></div></div>
      {isError ? <ApiDown what="the overview" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : <>
        <div className="status-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {tiles.map((t) => (
            <Link key={t.label} to={t.to} className={`status-tile ${t.tone ?? ""}`} style={{ padding: "14px 16px" }}>
              <div className="cell-sub"><i className={`fa-solid ${t.icon}`} /> {t.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, margin: "4px 0" }}>{t.value}</div><div className="cell-sub">{t.sub}</div>
            </Link>
          ))}
        </div>
        <div className="grid-2">
          <Card title="Business domains" icon="fa-table-cells" right={<Link className="link-btn" to="/heatmap">Heatmap</Link>}>
            <ul className="stat-list">{domains.map((d) => (
              <li key={d.id}><Link className="link" to={`/heatmap?domain=${d.id}`}><i className={`fa-solid ${d.icon}`} style={{ width: 18 }} /> {d.name}</Link>
                <span><span className="cell-sub">{d.serviceCount} services · {d.availability ?? "—"}% </span><span className={`pill ${HEALTH_TONE[d.health]}`}>{HEALTH_LABEL[d.health]}</span></span></li>
            ))}</ul>
          </Card>
          <Card title="Explore" icon="fa-compass">
            <div className="status-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {areas.map(([to, icon, label]) => <Link key={to} to={to} className="status-tile" style={{ textAlign: "center", padding: 14 }}><i className={`fa-solid ${icon}`} style={{ fontSize: 18, color: "var(--link)" }} /><div className="t" style={{ marginTop: 6 }}>{label}</div></Link>)}
            </div>
          </Card>
        </div>
      </>}
    </div>
  );
}
