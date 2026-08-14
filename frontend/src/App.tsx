import React from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import DashboardScreen from "@/screens/DashboardScreen";
import SlosScreen from "@/screens/SlosScreen";
import MonitorsScreen from "@/screens/MonitorsScreen";
import SyntheticsScreen from "@/screens/SyntheticsScreen";

const NAV = [
  { group: "Operate", items: [{ to: "/", label: "Dashboard", icon: "fa-gauge-high" }] },
  {
    group: "Observe",
    items: [
      { to: "/slos", label: "SLOs", icon: "fa-bullseye" },
      { to: "/monitors", label: "Monitors", icon: "fa-bell" },
      { to: "/synthetics", label: "Synthetics", icon: "fa-globe" },
    ],
  },
];

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">A</div>
        <div>
          <div className="name">Argus Monitoring</div>
          <div className="sub">FINSPOT TECHNOLOGY</div>
        </div>
      </div>
      {NAV.map((g) => (
        <React.Fragment key={g.group}>
          <div className="nav-group-label">{g.group}</div>
          {g.items.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-link${pathname === item.to ? " active" : ""}`}>
              <i className={`fa-solid ${item.icon}`} />
              {item.label}
            </Link>
          ))}
        </React.Fragment>
      ))}
    </nav>
  );
}

function Header() {
  return (
    <div className="header">
      <span className="title">Fyers · Live Operations</span>
      <span className="meta">Auto-refresh every 30s · Production · us-east-1</span>
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Header />
        <Routes>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/slos" element={<SlosScreen />} />
          <Route path="/monitors" element={<MonitorsScreen />} />
          <Route path="/synthetics" element={<SyntheticsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
