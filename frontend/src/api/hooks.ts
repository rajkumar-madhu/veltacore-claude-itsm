import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SEED_MONITORS, SEED_SITES, SEED_SLOS, SEED_SYNTHETICS } from "@/lib/seed";

const quiet = { retry: 0, refetchOnWindowFocus: false, refetchInterval: 30_000 } as const;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Every list endpoint here is a small fixed catalog with a matching local
// seed constant, so the API-down/loading/empty-DB fallback lives once, here,
// rather than being re-decided (and re-diverging) in every consumer.
function withSeedFallback<T>(data: T[] | undefined, seed: T[]): T[] {
  return data && data.length > 0 ? data : seed;
}

export interface SiteRow {
  id: string; name: string; region: string; devices: number; health: number;
  lat: number | null; lng: number | null;
}
export function useSites() {
  const query = useQuery({ ...quiet, queryKey: ["sites"], queryFn: () => apiGet<SiteRow[]>("/sites/") });
  return { ...query, data: withSeedFallback(query.data, SEED_SITES) };
}

export interface SloRow {
  id: string; name: string; service: string; type: string;
  target: number; actual: number; window: string; burnRate: number;
}
export function useSlos() {
  const query = useQuery({ ...quiet, queryKey: ["slos"], queryFn: () => apiGet<SloRow[]>("/slos/") });
  return { ...query, data: withSeedFallback(query.data, SEED_SLOS) };
}

export interface MonitorRow {
  id: string; name: string; type: string; query: string; state: string;
  warn: number; crit: number; window: string; scope: string; since: string;
}
export function useMonitors() {
  const query = useQuery({ ...quiet, queryKey: ["monitors"], queryFn: () => apiGet<MonitorRow[]>("/monitors/") });
  return { ...query, data: withSeedFallback(query.data, SEED_MONITORS) };
}

export interface SyntheticRow {
  id: string; name: string; type: string; target: string; uptime: number;
  p95: number; status: string; interval: string; locations: number; lastRun: string;
}
export function useSynthetics() {
  const query = useQuery({ ...quiet, queryKey: ["synthetics"], queryFn: () => apiGet<SyntheticRow[]>("/synthetics/") });
  return { ...query, data: withSeedFallback(query.data, SEED_SYNTHETICS) };
}

// VMs have no local seed fallback: their inventory is large and lives only
// in the backend seed, so screens show an explicit "can't reach API" state.
export type VmState = "running" | "stopped" | "suspended";

export interface VmRow {
  id: string; name: string; ip: string; platform: string; cluster: string; host: string;
  siteName: string; os: string; osFamily: string; environment: string; role: string;
  vcpu: number; memoryGb: number; state: VmState; cpuPct: number; memPct: number; diskPct: number;
  uptimeSeconds: number | null;
}

export interface VmDisk { name: string; mount: string; fs: string; sizeGb: number; usedGb: number; datastore: string; provisioning: string; controller: string }
export interface VmNic { name: string; mac: string; portgroup: string; ip: string; type: string; connected: boolean; speedGbps: number }
export interface VmProcess { pid: number; name: string; user: string; cpu: number; memMb: number; threads: number }
export interface VmService { name: string; status: string; startup: string; description: string }
export interface VmAlert { severity: string; title: string; since: string; source: string }
export interface VmLogLine { ts: string; level: string; source: string; message: string }

export interface VmDetail extends VmRow {
  hypervisor: string; vcenter: string; hostIp: string | null; toolsStatus: string;
  createdAt: string; poweredOnAt: string | null; description: string; haProtected: boolean;
  diskUsedGb: number; diskProvisionedGb: number; netInMbps: number; netOutMbps: number;
  datastore: { id: string; name: string; type: string; capacityGb: number; usedGb: number; provisioning: string; status: string };
  details: {
    disks: VmDisk[]; nics: VmNic[]; processes: VmProcess[]; services: VmService[];
    alerts: VmAlert[]; logs: VmLogLine[]; config: Record<string, string>;
    clusterHosts: { name: string; ip: string }[];
    guest: Record<string, string | number | null>;
  };
  snapshots: { id: number; name: string; createdAt: string; sizeGb: number; description: string }[];
  events: { id: number; ts: string; level: string; message: string }[];
}

export function useVms() {
  return useQuery({ ...quiet, queryKey: ["vms"], queryFn: () => apiGet<VmRow[]>("/vms/") });
}

export function useVm(id: string) {
  return useQuery({ ...quiet, queryKey: ["vms", id], queryFn: () => apiGet<VmDetail>(`/vms/${id}/`) });
}

export function useVmAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { action: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/vms/${id}/action/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? `Request failed (${res.status})`);
      return data.detail as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["vms"] }),
  });
}

// ---- Network devices (switches, firewalls, physical servers, …) ----
export type DeviceType = "switch" | "router" | "firewall" | "load_balancer" | "server" | "database" | "storage" | "wireless";
export type DeviceStatus = "online" | "offline" | "unknown";

export interface DeviceRow {
  id: string; hostname: string; deviceType: DeviceType; vendor: string; model: string; ip: string;
  siteId: string; siteName: string; environment: string; role: string; status: DeviceStatus;
  lastSeen: string | null; onboardedAt: string; uptimeSeconds: number | null;
}

export interface SwitchPort {
  name: string; number: number; status: "up" | "down" | "disabled" | "unused"; speedMbps: number; duplex: string;
  vlan: number; mode: string; inMbps: number; outMbps: number; inErrors: number; outErrors: number; discards: number;
  description: string; mac: string;
}
export interface DeviceAlert { ts?: string; since?: string; severity: string; source: string; message?: string; title?: string }
export interface DiscoveryResult {
  ip: string; reachable: boolean; reverseDns: string | null; portsScanned: number; durationMs: number;
  discoveredAt: string; method: string;
  services: { service: string; port: number; status: string; latencyMs: number; version: string | null; description: string }[];
}

export interface DeviceDetails {
  ports?: SwitchPort[];
  vlans?: { id: number; name: string; status: string; ports: string; description: string }[];
  neighbors?: { device: string; localPort: string; remotePort: string; platform: string; ip: string; protocol: string }[];
  alerts?: DeviceAlert[];
  stp?: { mode: string; instances: { vlan: number; rootBridge: string; rootPriority: number; isRoot: boolean; rootPort: string; topologyChanges: number }[] };
  hardware?: { chassis: string; memoryMb: number; flashMb: number; cpu: string;
    psus: { name: string; model: string; status: string; watts: number }[];
    fans: { name: string; status: string; rpm: number }[];
    sensors: { name: string; valueC: number; warnC: number }[] };
  inventory?: { name: string; description: string; pid: string; serial: string }[];
  runningConfig?: string;
  logs?: VmLogLine[];
  bmc?: { kind: "iDRAC" | "iLO"; version: string; ip: string; firmware: string; license: string; lifecycleController: string; connected: boolean; lastUpdated: string };
  health?: { overall: string; components: { name: string; status: string; value: string }[] };
  temps?: { sensor: string; current: number; warn: number }[];
  fans?: { name: string; rpm: number; status: string }[];
  psus?: { name: string; model: string; status: string; inputV: number; outputW: number; capacityW: number }[];
  voltages?: { sensor: string; current: number; min: number; max: number }[];
  hwEvents?: { ts: string; severity: string; sensor: string; message: string }[];
  cpu?: { model: string; sockets: number; coresPerSocket: number; threads: number; baseGhz: number };
  dimms?: { slot: string; sizeGb: number; type: string; status: string }[];
  storage?: { controller: string;
    virtualDisks: { name: string; raid: string; sizeTb: number; status: string }[];
    physicalDisks: { slot: string; model: string; status: string; wearPct: number }[];
    filesystems: { mount: string; fs: string; sizeGb: number; usedGb: number }[] };
  nics?: { name: string; mac: string; ip: string; speedGbps: number; status: string; inMbps: number; outMbps: number }[];
  processes?: VmProcess[];
  services?: { name: string; port: number; status: string; description: string }[];
  config?: Record<string, string>;
  lastDiscovery?: DiscoveryResult;
}

export interface DeviceDetail extends DeviceRow {
  serial: string; mgmtIp: string | null; mac: string; osType: string; osVersion: string; location: string;
  contact: string; description: string; cpuPct: number | null; memPct: number | null; tempC: number | null;
  details: DeviceDetails;
  events: { id: number; ts: string; severity: string; source: string; message: string }[];
}

export function useDevices(params: { type?: string; sort?: "recent" } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ ...quiet, queryKey: ["devices", qs], queryFn: () => apiGet<DeviceRow[]>(`/devices/${qs ? `?${qs}` : ""}`) });
}

export function useDevice(id: string) {
  return useQuery({ ...quiet, queryKey: ["devices", "detail", id], queryFn: () => apiGet<DeviceDetail>(`/devices/${id}/`) });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof data.detail === "string" ? data.detail : `Request failed (${res.status})`) as Error & { fields?: Record<string, string[]> };
    if (!data.detail) err.fields = data;
    throw err;
  }
  return data as T;
}

export function useDeviceAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string } & Record<string, unknown>) => apiPost<{ detail: string }>(`/devices/${id}/action/`, body).then((r) => r.detail),
    onSettled: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export interface OnboardBody {
  deviceType: DeviceType; hostname: string; ip: string; mgmtIp?: string; site: string; environment: string;
  vendor: string; model: string; osType: string; osVersion: string; role: string; description: string;
  cmdb?: { ciClass: string; businessService: string; criticality: string; supportGroup: string };
  monitoring?: { checks: string[]; intervalSec: number; alertProfile: string };
}

export function useOnboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardBody) => apiPost<DeviceDetail>("/devices/", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Record<string, string>[]) =>
      apiPost<{ created: string[]; errors: { row: number; errors: Record<string, string[]> }[] }>("/devices/bulk/", { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useDiscover() {
  return useMutation({ mutationFn: (ip: string) => apiPost<DiscoveryResult>("/devices/discover/", { ip }) });
}
