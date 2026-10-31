import React from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import DashboardScreen from "@/screens/DashboardScreen";
import SlosScreen from "@/screens/SlosScreen";
import MonitorsScreen from "@/screens/MonitorsScreen";
import SyntheticsScreen from "@/screens/SyntheticsScreen";
import VmListScreen from "@/screens/VmListScreen";
import VmDetailScreen from "@/screens/vm/VmDetailScreen";
import DeviceListScreen from "@/screens/device/DeviceListScreen";
import DeviceDetailScreen from "@/screens/device/DeviceDetailScreen";
import OnboardingScreen from "@/screens/onboarding/OnboardingScreen";

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
  {
    group: "Infrastructure",
    items: [
      { to: "/devices?type=switch", label: "Switches", icon: "fa-network-wired" },
      { to: "/devices?type=server", label: "Physical Servers", icon: "fa-server" },
      { to: "/vms", label: "Virtual Machines", icon: "fa-cube" },
      { to: "/devices", label: "All Devices", icon: "fa-layer-group" },
    ],
  },
  { group: "Onboarding", items: [{ to: "/onboarding", label: "Add Device", icon: "fa-circle-plus" }] },
];

function isActive(to: string, pathname: string, search: string) {
  const [path, query] = to.split("?");
  if (path === "/") return pathname === "/";
  const type = new URLSearchParams(search).get("type");
  if (query) return pathname === path && `type=${type}` === query;
  if (path === "/devices") return (pathname === "/devices" && !type) || pathname.startsWith("/devices/");
  return pathname.startsWith(path);
}

function Sidebar() {
  const { pathname, search } = useLocation();
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
            <Link key={item.to} to={item.to} className={`nav-link${isActive(item.to, pathname, search) ? " active" : ""}`}>
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
          <Route path="/vms" element={<VmListScreen />} />
          <Route path="/vms/:id" element={<VmDetailScreen />} />
          <Route path="/devices" element={<DeviceListScreen />} />
          <Route path="/devices/:id" element={<DeviceDetailScreen />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
