import { useDomains, type DomainRow, type Health, type ServiceSnap } from "@/api/hooks";

export interface Svc extends ServiceSnap { domainId: string; domainName: string }

export function useServices(filter?: (s: Svc) => boolean) {
  const q = useDomains();
  const all: Svc[] = (q.data ?? []).flatMap((d: DomainRow) => d.services.map((s) => ({ ...s, domainId: d.id, domainName: d.name })));
  return { ...q, services: filter ? all.filter(filter) : all };
}

export const HEALTH_TONE: Record<Health, string> = { ok: "ok", warn: "warn", crit: "crit", unknown: "muted" };
export const HEALTH_LABEL: Record<Health, string> = { ok: "Healthy", warn: "Degraded", crit: "Critical", unknown: "Unknown" };

