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
