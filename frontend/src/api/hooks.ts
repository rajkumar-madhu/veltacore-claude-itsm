import { useQuery } from "@tanstack/react-query";
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
