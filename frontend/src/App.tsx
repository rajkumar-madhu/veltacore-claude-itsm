import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/layout/Layout";
import DashboardScreen from "@/screens/DashboardScreen";
import SlosScreen from "@/screens/SlosScreen";
import MonitorsScreen from "@/screens/MonitorsScreen";
import SyntheticsScreen from "@/screens/SyntheticsScreen";
import VmListScreen from "@/screens/VmListScreen";
import VmDetailScreen from "@/screens/vm/VmDetailScreen";
import DeviceListScreen from "@/screens/device/DeviceListScreen";
import DeviceDetailScreen from "@/screens/device/DeviceDetailScreen";
import OnboardingScreen from "@/screens/onboarding/OnboardingScreen";
import HeatmapScreen from "@/screens/heatmap/HeatmapScreen";
import ExportersScreen from "@/screens/exporters/ExportersScreen";

const l = (f: () => Promise<{ default: React.ComponentType }>) => React.lazy(f);

/** Lazily-loaded module screens, keyed by route path. */
const LAZY: [string, React.LazyExoticComponent<React.ComponentType>][] = [
  ["/tickets", l(() => import("@/screens/servicedesk/TicketsScreen"))],
  ["/tickets/:id", l(() => import("@/screens/servicedesk/TicketDetailScreen"))],
  ["/catalog", l(() => import("@/screens/servicedesk/CatalogScreen"))],
];

export default function App() {
  return (
    <Layout>
      <React.Suspense fallback={<div className="page"><div className="loading">Loading…</div></div>}>
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
          <Route path="/heatmap" element={<HeatmapScreen />} />
          <Route path="/exporters" element={<ExportersScreen />} />
          {LAZY.map(([path, C]) => <Route key={path} path={path} element={<C />} />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </Layout>
  );
}
