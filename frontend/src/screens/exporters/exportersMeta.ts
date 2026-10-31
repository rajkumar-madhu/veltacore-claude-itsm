import type { ExporterCategory, ExporterStatus } from "@/api/hooks";

export const CATEGORY_META: Record<ExporterCategory, { label: string; icon: string; color: string }> = {
  network: { label: "Network", icon: "fa-network-wired", color: "#2563eb" },
  firewalls: { label: "Firewalls", icon: "fa-shield-halved", color: "#dc2626" },
  servers: { label: "Servers", icon: "fa-server", color: "#7c3aed" },
  virtualization: { label: "Virtualization", icon: "fa-cubes", color: "#9333ea" },
  storage: { label: "Storage", icon: "fa-hard-drive", color: "#f59e0b" },
  databases: { label: "Databases", icon: "fa-database", color: "#1d4ed8" },
  applications: { label: "Applications", icon: "fa-window-restore", color: "#db2777" },
  kubernetes: { label: "Kubernetes", icon: "fa-dharmachakra", color: "#0ea5e9" },
  wireless: { label: "Wireless", icon: "fa-wifi", color: "#16a34a" },
  security: { label: "Security", icon: "fa-user-shield", color: "#ea580c" },
  custom: { label: "Custom", icon: "fa-gear", color: "#475569" },
};

export const STATUS_META: Record<ExporterStatus, { label: string; cls: string; icon: string; color: string }> = {
  active: { label: "Active", cls: "ok", icon: "fa-circle-check", color: "#16a34a" },
  inactive: { label: "Inactive", cls: "muted", icon: "fa-circle-pause", color: "#94a3b8" },
  error: { label: "Error", cls: "crit", icon: "fa-circle-exclamation", color: "#ef4444" },
  not_configured: { label: "Not Configured", cls: "warn", icon: "fa-circle-question", color: "#f59e0b" },
};

export const EXPORTER_TYPES = ["SNMP", "HTTP API", "Node Exporter", "Windows", "vSphere", "MySQL", "PostgreSQL", "Redis", "MongoDB",
  "RabbitMQ", "HTTP/TCP", "Kubernetes", "NetFlow", "Syslog", "Redfish", "JMX", "Nginx", "Kafka", "Custom"];

export function fmtCount(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export function relTime(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sec ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
