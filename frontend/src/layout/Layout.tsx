import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useItsmGet } from "@/api/itsm";
import { NAV, isActive } from "./nav";

const STORE_KEY = "argus.nav.open";

function loadOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); } catch { return {}; }
}

function Sidebar() {
  const { pathname, search } = useLocation();
  const [open, setOpen] = React.useState<Record<string, boolean>>(loadOpen);
  const activeGroup = NAV.find((g) => g.items?.some((i) => isActive(i.to, pathname, search)))?.id;

  React.useEffect(() => {
    if (activeGroup && !open[activeGroup]) setOpen((o) => ({ ...o, [activeGroup]: true }));
  }, [activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(open)); } catch { /* storage unavailable */ } }, [open]);

  return (
    <nav className="sidebar">
      <Link to="/" className="sidebar-brand">
        <div className="logo"><i className="fa-solid fa-eye" /></div>
        <div><div className="name">Argus</div><div className="sub">ITSM &amp; Monitoring Platform</div></div>
      </Link>
      <div className="nav-scroll">
        {NAV.map((g) => g.to ? (
          <Link key={g.id} to={g.to} className={`nav-top${isActive(g.to, pathname, search) ? " active" : ""}`}><i className={`fa-solid ${g.icon}`} />{g.label}</Link>
        ) : (
          <div key={g.id} className={`nav-group${activeGroup === g.id ? " has-active" : ""}`}>
            <button className="nav-top" aria-expanded={!!open[g.id]} onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
              <i className={`fa-solid ${g.icon}`} />{g.label}<i className={`fa-solid fa-chevron-${open[g.id] ? "up" : "down"} chev`} />
            </button>
            {open[g.id] && <div className="nav-sub">{g.items!.map((i) => (
              <Link key={i.to + i.label} to={i.to} className={`nav-link${isActive(i.to, pathname, search) ? " active" : ""}`}>{i.label}</Link>
            ))}</div>}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <div>Argus v1.0</div><div>Full-Stack Observability</div>
        <div className="ok-text"><span className="live-dot small" /> System Operational</div>
      </div>
    </nav>
  );
}

function Header() {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const { data } = useItsmGet<{ bySeverity: Record<string, number> }>("/alerts/stats/", { refetchInterval: 30_000 });
  const firing = Object.values(data?.bySeverity ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div className="header">
      <form className="header-search" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) navigate(`/investigate?q=${encodeURIComponent(q.trim())}`); }}>
        <i className="fa-solid fa-magnifying-glass" />
        <input placeholder="Search tickets, devices, CIs, alerts, logs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" />
      </form>
      <div className="header-right">
        <span className="meta">Fyers · Production</span>
        <Link to="/alerts" className="bell" title={`${firing} firing alert(s)`}><i className="fa-solid fa-bell" />{firing > 0 && <span>{firing}</span>}</Link>
        <Link to="/admin/users" className="me"><span className="avatar">A</span><span><b>Admin</b><small>Super Admin</small></span></Link>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main"><Header />{children}</div>
    </div>
  );
}
