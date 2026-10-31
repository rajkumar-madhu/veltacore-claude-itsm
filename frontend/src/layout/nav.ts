export interface NavItem { to: string; label: string }
export interface NavGroup { id: string; label: string; icon: string; to?: string; items?: NavItem[] }

export const NAV: NavGroup[] = [
  { id: "dashboard", label: "Dashboard", icon: "fa-gauge-high", to: "/" },
  { id: "servicedesk", label: "Service Desk", icon: "fa-headset", items: [
    { to: "/tickets?type=incident", label: "Incidents" }, { to: "/tickets?type=problem", label: "Problems" },
    { to: "/tickets?type=change", label: "Changes" }, { to: "/tickets?type=request", label: "Service Requests" },
    { to: "/catalog", label: "Service Catalog" },
  ] },
  { id: "assets", label: "Assets", icon: "fa-boxes-stacked", items: [
    { to: "/assets", label: "IT Assets" }, { to: "/assets/software", label: "Software" },
    { to: "/assets/licenses", label: "Licenses" }, { to: "/assets/lifecycle", label: "Lifecycle" },
  ] },
  { id: "cmdb", label: "CMDB", icon: "fa-diagram-project", items: [
    { to: "/cmdb/topology", label: "Topology" }, { to: "/cmdb/cis", label: "Configuration Items" },
    { to: "/cmdb/relationships", label: "Relationships" },
  ] },
  { id: "observe", label: "Observe", icon: "fa-eye", items: [
    { to: "/observe", label: "Overview" }, { to: "/heatmap", label: "Heatmap & Domains" },
    { to: "/observe/applications", label: "Applications" }, { to: "/observe/kubernetes", label: "Kubernetes" },
    { to: "/observe/databases", label: "Databases" }, { to: "/observe/middleware", label: "Middleware" },
    { to: "/observe/network", label: "Network" }, { to: "/observe/availability", label: "Availability" },
    { to: "/observe/metrics", label: "Metrics Explorer" }, { to: "/observe/logs", label: "Logs" },
    { to: "/observe/traces", label: "Traces" }, { to: "/slos", label: "SLOs" },
    { to: "/monitors", label: "Monitors" }, { to: "/synthetics", label: "Synthetics" },
  ] },
  { id: "monitoring", label: "Monitoring", icon: "fa-desktop", items: [
    { to: "/alerts", label: "Alert Manager" }, { to: "/uptime?kind=http", label: "URL Checker" },
    { to: "/uptime?kind=tcp", label: "Telnet Monitoring" }, { to: "/uptime", label: "Uptime Checks" },
    { to: "/monitoring/nagios", label: "Nagios Status" }, { to: "/monitoring/prometheus", label: "Prometheus Metrics" },
    { to: "/exporters", label: "Exporters, Logs & Events" }, { to: "/monitoring/templates", label: "Templates" },
  ] },
  { id: "network", label: "Network Devices", icon: "fa-network-wired", items: [
    { to: "/devices?type=switch", label: "Switches" }, { to: "/devices?type=router", label: "Routers" },
    { to: "/devices?type=firewall", label: "Firewalls" }, { to: "/devices?type=load_balancer", label: "Load Balancers" },
    { to: "/devices?type=wireless", label: "Wireless" }, { to: "/devices?type=server", label: "Physical Servers" },
    { to: "/devices", label: "All Devices" },
  ] },
  { id: "vms", label: "Virtual Machines", icon: "fa-cube", items: [
    { to: "/vms/overview", label: "Overview" }, { to: "/vms", label: "VM List" }, { to: "/vms/new", label: "Add VM" },
    { to: "/vms/templates", label: "VM Templates" }, { to: "/vms?platform=VMware", label: "VMware vCenter" },
    { to: "/vms?platform=Hyper-V", label: "Hyper-V" }, { to: "/vms?platform=Proxmox", label: "Proxmox" },
    { to: "/vms/monitoring", label: "VM Monitoring" },
  ] },
  { id: "investigate", label: "Investigate", icon: "fa-magnifying-glass-chart", items: [
    { to: "/investigate/health", label: "Health / RCA" }, { to: "/investigate", label: "Investigation" },
  ] },
  { id: "act", label: "Act", icon: "fa-screwdriver-wrench", items: [
    { to: "/act/remediation", label: "Remediation & Verify" }, { to: "/tickets?type=incident", label: "Incidents" },
  ] },
  { id: "bod", label: "BOD / EOD", icon: "fa-calendar-check", items: [
    { to: "/bod", label: "Status Dashboard" }, { to: "/bod/checks", label: "Key Validation" }, { to: "/bod/history", label: "Execution History" },
  ] },
  { id: "automation", label: "Automation", icon: "fa-robot", items: [
    { to: "/automation/runbooks", label: "Runbooks" }, { to: "/automation/workflows", label: "Workflows" },
    { to: "/automation/executions", label: "Executions" }, { to: "/automation/stackstorm", label: "StackStorm" },
  ] },
  { id: "onboarding", label: "Onboarding", icon: "fa-circle-plus", items: [
    { to: "/onboarding", label: "Add Device" }, { to: "/onboarding/import", label: "Import Devices" },
    { to: "/onboarding/discovery", label: "Discovery" }, { to: "/onboarding/provisioning", label: "Provisioning" },
  ] },
  { id: "analytics", label: "Analytics", icon: "fa-chart-pie", items: [
    { to: "/analytics", label: "Dashboards" }, { to: "/reports", label: "Reports" },
    { to: "/reports/rca", label: "RCA Reports" }, { to: "/audit", label: "Audit Logs" },
  ] },
  { id: "admin", label: "Administration", icon: "fa-gear", items: [
    { to: "/admin/users", label: "Users & Roles" }, { to: "/admin/sites", label: "Sites / Locations" },
    { to: "/admin/integrations", label: "Integrations" }, { to: "/admin/notifications", label: "Notifications" },
    { to: "/admin/thresholds", label: "Thresholds / SLOs" }, { to: "/admin/settings", label: "System Settings" },
  ] },
];

/** Exact path match, plus query keys in the nav link must match the URL. */
export function isActive(to: string, pathname: string, search: string) {
  const [path, query] = to.split("?");
  const params = new URLSearchParams(search);
  if (query) {
    const want = new URLSearchParams(query);
    return pathname === path && [...want].every(([k, v]) => params.get(k) === v);
  }
  if (path === "/") return pathname === "/";
  // list pages own their detail pages, but not sibling sub-pages that have their own nav entry
  const sameOrDetail = pathname === path || (pathname.startsWith(`${path}/`) && !ALL_PATHS.has(pathname));
  const filtered = ["type", "platform", "kind"].some((k) => params.get(k));
  return sameOrDetail && !(pathname === path && filtered);
}

const ALL_PATHS = new Set(NAV.flatMap((g) => [g.to, ...(g.items ?? []).map((i) => i.to.split("?")[0])]).filter(Boolean) as string[]);
