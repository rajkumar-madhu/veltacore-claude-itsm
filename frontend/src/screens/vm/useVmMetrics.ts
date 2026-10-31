import React from "react";
import type { VmDetail } from "@/api/hooks";
import { pointsFor, series, type Range } from "@/lib/series";

export function useVmMetrics(vm: VmDetail | undefined, range: Range) {
  return React.useMemo(() => {
    const n = pointsFor(range);
    if (!vm) return null;
    const on = vm.state === "running";
    const zero = () => Array<number>(n).fill(0);
    const key = `${vm.id}:${range}`;
    const s = (name: string, end: number, jitter: number, max = 100) =>
      on ? series(`${key}:${name}`, end, { n, jitter, max }) : zero();
    const disk = series(`${key}:disk`, vm.diskPct, { n, jitter: 0.015, max: 100 });
    return {
      cpu: s("cpu", vm.cpuPct, 0.3),
      mem: s("mem", vm.memPct, 0.06),
      disk,
      diskFree: disk.map((v) => 100 - v),
      netIn: s("in", vm.netInMbps, 0.35, Infinity),
      netOut: s("out", vm.netOutMbps, 0.35, Infinity),
      diskIops: s("iops", vm.diskPct * 9, 0.4, Infinity),
      diskLatency: s("lat", 1.8, 0.4, Infinity),
    };
  }, [vm, range]);
}

/** Round up to a "nice" chart ceiling and 4 even ticks. */
export function niceScale(values: number[]) {
  const max = Math.max(1, ...values);
  const mag = 10 ** Math.floor(Math.log10(max));
  const ceil = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= max * 1.1) ?? 10 * mag;
  return { max: ceil, ticks: [0, ceil / 4, ceil / 2, (ceil * 3) / 4, ceil] };
}
