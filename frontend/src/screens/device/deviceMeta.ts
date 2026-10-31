import React from "react";
import type { DeviceDetail, DeviceStatus, DeviceType } from "@/api/hooks";
import { pointsFor, series, type Range } from "@/lib/series";

export const TYPE_LABEL: Record<DeviceType, string> = {
  switch: "Switch", router: "Router", firewall: "Firewall", load_balancer: "Load Balancer",
  server: "Physical Server", database: "Database", storage: "Storage", wireless: "Wireless",
};
export const TYPE_PLURAL: Record<DeviceType, string> = {
  switch: "Switches", router: "Routers", firewall: "Firewalls", load_balancer: "Load Balancers",
  server: "Physical Servers", database: "Databases", storage: "Storage", wireless: "Wireless",
};
export const TYPE_ICON: Record<DeviceType, string> = {
  switch: "fa-network-wired", router: "fa-route", firewall: "fa-shield-halved", load_balancer: "fa-scale-balanced",
  server: "fa-server", database: "fa-database", storage: "fa-hard-drive", wireless: "fa-wifi",
};
export const STATUS_PILL: Record<DeviceStatus, { cls: string; label: string; icon: string }> = {
  online: { cls: "ok", label: "Online", icon: "fa-circle-check" },
  offline: { cls: "crit", label: "Offline", icon: "fa-circle-xmark" },
  unknown: { cls: "muted", label: "Unknown", icon: "fa-circle-question" },
};

export const isNetworkGear = (t: DeviceType) => t === "switch" || t === "router" || t === "firewall";

export function useDeviceMetrics(d: DeviceDetail | undefined, range: Range) {
  return React.useMemo(() => {
    if (!d) return null;
    const n = pointsFor(range);
    const on = d.status === "online";
    const key = `${d.id}:${range}`;
    const zero = Array<number>(n).fill(0);
    const s = (name: string, end: number | null, jitter: number, max = 100) =>
      on && end != null ? series(`${key}:${name}`, end, { n, jitter, max }) : zero;
    const ports = d.details.ports ?? [];
    const nics = d.details.nics ?? [];
    const inNow = ports.length ? ports.reduce((a, p) => a + p.inMbps, 0) : nics.reduce((a, x) => a + x.inMbps, 0);
    const outNow = ports.length ? ports.reduce((a, p) => a + p.outMbps, 0) : nics.reduce((a, x) => a + x.outMbps, 0);
    const temps = d.details.temps ?? [];
    return {
      cpu: s("cpu", d.cpuPct, 0.35), mem: s("mem", d.memPct, 0.05), temp: s("temp", d.tempC, 0.06, 120),
      netIn: s("in", inNow, 0.25, Infinity), netOut: s("out", outNow, 0.25, Infinity),
      tempSensors: temps.slice(0, 4).map((t) => ({ label: t.sensor.replace(" Temperature", ""), data: s(`t:${t.sensor}`, t.current, 0.08, 120) })),
      fans: (d.details.fans ?? []).map((f) => ({ label: f.name, data: s(`f:${f.name}`, f.rpm, 0.04, 20000) })),
      inNow, outNow,
    };
  }, [d, range]);
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
