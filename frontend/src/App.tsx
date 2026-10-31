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
  ["/cmdb/topology", l(() => import("@/screens/cmdb/TopologyScreen"))],
  ["/cmdb/cis", l(() => import("@/screens/cmdb/CisScreen"))],
  ["/cmdb/cis/:id", l(() => import("@/screens/cmdb/CiDetailScreen"))],
  ["/cmdb/relationships", l(() => import("@/screens/cmdb/RelationshipsScreen"))],
  ["/assets", l(() => import("@/screens/assets/AssetsScreen"))],
  ["/assets/software", l(() => import("@/screens/assets/SoftwareScreen"))],
  ["/assets/licenses", l(() => import("@/screens/assets/LicensesScreen"))],
  ["/assets/lifecycle", l(() => import("@/screens/assets/LifecycleScreen"))],
  ["/alerts", l(() => import("@/screens/monitoring/AlertsScreen"))],
  ["/uptime", l(() => import("@/screens/monitoring/UptimeScreen"))],
  ["/monitoring/nagios", l(() => import("@/screens/monitoring/NagiosScreen"))],
  ["/monitoring/prometheus", l(() => import("@/screens/monitoring/PrometheusScreen"))],
  ["/monitoring/templates", l(() => import("@/screens/monitoring/TemplatesScreen"))],
  ["/bod", l(() => import("@/screens/bod/BodStatusScreen"))],
  ["/bod/checks", l(() => import("@/screens/bod/BodChecksScreen"))],
  ["/bod/history", l(() => import("@/screens/bod/BodHistoryScreen"))],
  ["/automation/runbooks", l(() => import("@/screens/automation/RunbooksScreen"))],
  ["/automation/workflows", l(() => import("@/screens/automation/WorkflowsScreen"))],
  ["/automation/executions", l(() => import("@/screens/automation/ExecutionsScreen"))],
  ["/automation/stackstorm", l(() => import("@/screens/automation/StackStormScreen"))],
  ["/analytics", l(() => import("@/screens/analytics/AnalyticsScreen"))],
  ["/reports", l(() => import("@/screens/analytics/ReportsScreen"))],
  ["/reports/rca", l(() => import("@/screens/analytics/RcaListScreen"))],
  ["/reports/rca/:id", l(() => import("@/screens/analytics/RcaDetailScreen"))],
  ["/audit", l(() => import("@/screens/analytics/AuditScreen"))],
  ["/admin/users", l(() => import("@/screens/admin/UsersScreen"))],
  ["/admin/sites", l(() => import("@/screens/admin/SitesScreen"))],
  ["/admin/integrations", l(() => import("@/screens/admin/IntegrationsScreen"))],
  ["/admin/notifications", l(() => import("@/screens/admin/NotificationsScreen"))],
  ["/admin/thresholds", l(() => import("@/screens/admin/ThresholdsScreen"))],
  ["/admin/settings", l(() => import("@/screens/admin/SettingsScreen"))],
  ["/observe", l(() => import("@/screens/observe/ObserveOverviewScreen"))],
  ["/observe/applications", l(() => import("@/screens/observe/ApplicationsScreen"))],
  ["/observe/kubernetes", l(() => import("@/screens/observe/KubernetesScreen"))],
  ["/observe/databases", l(() => import("@/screens/observe/DatabasesScreen"))],
  ["/observe/middleware", l(() => import("@/screens/observe/MiddlewareScreen"))],
  ["/observe/network", l(() => import("@/screens/observe/NetworkScreen"))],
  ["/observe/availability", l(() => import("@/screens/observe/AvailabilityScreen"))],
  ["/observe/metrics", l(() => import("@/screens/observe/MetricsExplorerScreen"))],
  ["/observe/logs", l(() => import("@/screens/observe/LogsScreen"))],
  ["/observe/traces", l(() => import("@/screens/observe/TracesScreen"))],
  ["/vms/overview", l(() => import("@/screens/vmx/VmOverviewScreen"))],
  ["/vms/new", l(() => import("@/screens/vmx/VmNewScreen"))],
  ["/vms/templates", l(() => import("@/screens/vmx/VmTemplatesScreen"))],
  ["/vms/monitoring", l(() => import("@/screens/vmx/VmMonitoringScreen"))],
  ["/investigate", l(() => import("@/screens/investigate/InvestigationScreen"))],
  ["/investigate/health", l(() => import("@/screens/investigate/HealthRcaScreen"))],
  ["/act/remediation", l(() => import("@/screens/investigate/RemediationScreen"))],
  ["/onboarding/import", l(() => import("@/screens/onboarding/ImportScreen"))],
  ["/onboarding/discovery", l(() => import("@/screens/onboarding/DiscoveryScreen"))],
  ["/onboarding/provisioning", l(() => import("@/screens/onboarding/ProvisioningScreen"))],
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
