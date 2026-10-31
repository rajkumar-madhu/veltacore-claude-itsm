import { opts, pairs } from "@/lib/itsmFmt";
import type { FieldDef } from "@/components/resource/ResourceForm";
import type { Row } from "@/components/resource/ResourcePage";

export interface Ci extends Row {
  id: number; ciId: string; name: string; ciClass: string; status: string; environment: string; owner: string;
  criticality: string; source: string; sourceId: string; ip: string; attributes: Record<string, unknown>;
  updatedAt: string; site: string | null; siteName: string | null;
}

export interface CiRel extends Row {
  id: number; source: number; sourceName: string; sourceClass: string; relType: string; target: number; targetName: string; targetClass: string;
}

export const CI_STATUS = pairs([["operational", "Operational"], ["degraded", "Degraded"], ["maintenance", "Maintenance"], ["retired", "Retired"]]);
export const CI_STATUS_TONE: Record<string, string> = { operational: "ok", degraded: "warn", maintenance: "info", retired: "muted" };
export const CI_SOURCE: Record<string, string> = { device: "Network device", vm: "Virtual machine", service: "Domain service", manual: "Manual" };
export const REL_TYPES = pairs([["runs_on", "Runs on"], ["depends_on", "Depends on"], ["connects_to", "Connects to"], ["hosts", "Hosts"], ["uses", "Uses"], ["member_of", "Member of"]]);
export const REL_LABEL = Object.fromEntries(REL_TYPES.map((r) => [r.value, r.label]));

/** Colour per CI class family, used by the topology graph and legends. */
export function classColor(ciClass: string) {
  const c = ciClass.toLowerCase();
  if (c.includes("business") || c.includes("application")) return "#7c3aed";
  if (c.includes("virtual")) return "#2563eb";
  if (c.includes("hypervisor") || c.includes("server")) return "#0891b2";
  if (c.includes("datastore") || c.includes("storage") || c.includes("database")) return "#ca8a04";
  if (c.includes("switch") || c.includes("router") || c.includes("network") || c.includes("wireless")) return "#059669";
  if (c.includes("firewall") || c.includes("load")) return "#dc2626";
  return "#64748b";
}

export const CLASS_LEGEND: [string, string][] = [
  ["Services", "#7c3aed"], ["Virtual machines", "#2563eb"], ["Servers / hosts", "#0891b2"], ["Storage / DB", "#ca8a04"],
  ["Network", "#059669"], ["Security / LB", "#dc2626"], ["Other", "#64748b"],
];

const CLASSES = ["Business Service", "Application Service", "Virtual Machine", "Hypervisor Host", "Datastore", "Physical Server",
  "Network Switch", "Network Router", "Firewall", "Load Balancer", "Wireless Controller", "Database Server", "Storage Array", "Other"];

export const CI_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "ciClass", label: "Class", type: "select", options: opts(CLASSES), required: true },
  { key: "status", label: "Status", type: "select", options: CI_STATUS, required: true },
  { key: "criticality", label: "Criticality", type: "select", options: pairs([["P1", "P1 - Critical"], ["P2", "P2 - High"], ["P3", "P3 - Medium"], ["P4", "P4 - Low"]]), required: true },
  { key: "environment", label: "Environment", type: "select", options: opts(["Production", "DR", "UAT", "Development"]) },
  { key: "site", label: "Site", type: "select", optionsFrom: { path: "/sites/", value: "id", label: (r) => String(r.name) } },
  { key: "ip", label: "IP address", placeholder: "10.0.0.10" },
  { key: "owner", label: "Owner / team" },
  { key: "attributes", label: "Attributes (JSON)", type: "json", placeholder: '{"os": "RHEL 9"}' },
];
