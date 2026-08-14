import { useQuery } from "@tanstack/react-query";

const quiet = { retry: 0, refetchOnWindowFocus: false } as const;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export interface SiteRow {
  id: string; name: string; region: string; devices: number; health: number;
  lat: number | null; lng: number | null;
}
export function useSites() {
  return useQuery({ ...quiet, queryKey: ["sites"], queryFn: () => apiGet<SiteRow[]>("/sites/") });
}

export interface SloRow {
  id: string; name: string; service: string; type: string;
  target: number; actual: number; window: string; burnRate: number;
}
export function useSlos() {
  return useQuery({ ...quiet, queryKey: ["slos"], queryFn: () => apiGet<SloRow[]>("/slos/") });
}

export interface MonitorRow {
  id: string; name: string; type: string; query: string; state: string;
  warn: number; crit: number; window: string; scope: string; since: string;
}
export function useMonitors() {
  return useQuery({ ...quiet, queryKey: ["monitors"], queryFn: () => apiGet<MonitorRow[]>("/monitors/") });
}

export interface SyntheticRow {
  id: string; name: string; type: string; target: string; uptime: number;
  p95: number; status: string; interval: string; locations: number; lastRun: string;
}
export function useSynthetics() {
  return useQuery({ ...quiet, queryKey: ["synthetics"], queryFn: () => apiGet<SyntheticRow[]>("/synthetics/") });
}
