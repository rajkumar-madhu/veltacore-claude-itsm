import type { DeviceType, OnboardBody } from "@/api/hooks";


export type FormState = Omit<OnboardBody, "cmdb" | "monitoring"> & { mgmtIp: string };
export type Cmdb = NonNullable<OnboardBody["cmdb"]>;
export type Monitoring = NonNullable<OnboardBody["monitoring"]>;
export type Errors = Partial<Record<string, string>>;

export const ENVIRONMENTS = ["Production", "UAT", "DR", "Development"];
export const CRITICALITY = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"];
export const ALERT_PROFILES = ["Default", "Trading critical", "Business hours", "Silent (no paging)"];
export const INTERVALS = [{ v: 30, l: "30 seconds" }, { v: 60, l: "1 minute" }, { v: 300, l: "5 minutes" }, { v: 900, l: "15 minutes" }];
export const VENDORS = ["", "Cisco", "Dell", "HPE", "Fortinet", "Juniper", "Lenovo", "F5", "Aruba", "Other"];
export const OS_TYPES = ["", "Linux", "Windows", "IOS", "NX-OS", "FortiOS", "JunOS", "ESXi", "Other"];
export const CI_CLASS: Record<DeviceType, string> = {
  switch: "Network Switch", router: "Network Router", firewall: "Firewall", load_balancer: "Load Balancer",
  server: "Server", database: "Database Server", storage: "Storage Array", wireless: "Wireless Controller",
};

const HOSTNAME_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const isIp = (v: string) => IPV4_RE.test(v) || (v.includes(":") && /^[0-9a-fA-F:]+$/.test(v));

export function validateDevice(f: FormState): Errors {
  const e: Errors = {};
  if (!f.hostname.trim()) e.hostname = "Hostname is required.";
  else if (!HOSTNAME_RE.test(f.hostname.trim())) e.hostname = "Use letters, digits, dots and hyphens (max 63).";
  if (!f.ip.trim()) e.ip = "IP address is required.";
  else if (!isIp(f.ip.trim())) e.ip = "Enter a valid IP address.";
  if (f.mgmtIp.trim() && !isIp(f.mgmtIp.trim())) e.mgmtIp = "Enter a valid IP address.";
  if (!f.site) e.site = "Choose a site.";
  return e;
}

export function baseChecks(type: DeviceType) {
  const net = type === "switch" || type === "router" || type === "firewall";
  return ["ICMP ping", ...(net ? ["SNMP interfaces", "SNMP CPU / memory", "Syslog"] : ["Node exporter (CPU / memory / disk)"]),
    ...(type === "server" ? ["iDRAC / iLO hardware (Redfish)"] : [])];
}

