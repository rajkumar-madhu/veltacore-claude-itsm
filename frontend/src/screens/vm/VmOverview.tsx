import React from "react";
import type { VmDetail } from "@/api/hooks";
import { Legend, LineChart, Sparkline } from "@/components/charts";
import { Card, InfoTable, LevelBadge, RangeSelect } from "@/components/ui";
import { formatDateTime, formatShort, formatUptime, timeTicks, trendPct, type Range } from "@/lib/series";
import { niceScale, useVmMetrics } from "./useVmMetrics";

const C = { cpu: "#2563eb", mem: "#16a34a", disk: "#f59e0b", net: "#7c3aed", in: "#2563eb", out: "#f97316", free: "#16a34a" };
const pct = (v: number) => `${v}%`;

export type ActionId =
  | "power_on" | "power_off" | "restart" | "suspend" | "reset" | "migrate"
  | "console" | "snapshot" | "clone" | "settings" | "move" | "logs";

function Kpi({ icon, tint, label, value, trend, spark, color }: {
  icon: string; tint: string; label: string; value: React.ReactNode; trend?: number; spark?: number[]; color?: string;
}) {
  return (
    <div className="vm-kpi">
      <div className="vm-kpi-top">
        <span className="vm-kpi-icon" style={{ background: `${tint}1a`, color: tint }}><i className={`fa-solid ${icon}`} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="vm-kpi-label">{label}</div>
          <div className="vm-kpi-value">{value}
            {trend != null && trend !== 0 && (
              <span className={`vm-kpi-trend ${trend > 0 ? "up" : "down"}`}>
                <i className={`fa-solid fa-arrow-${trend > 0 ? "up" : "down"}`} /> {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </div>
      {spark && color && <Sparkline data={spark} color={color} />}
    </div>
  );
}

function ChartCard({ title, vm, render }: {
  title: string; vm: VmDetail;
  render: (m: NonNullable<ReturnType<typeof useVmMetrics>>, range: Range) => React.ReactNode;
}) {
  const [range, setRange] = React.useState<Range>("1h");
  const m = useVmMetrics(vm, range);
  return <Card title={title} right={<RangeSelect value={range} onChange={setRange} />}>{m && render(m, range)}</Card>;
}

export function VmOverview({ vm, onAction, busy }: { vm: VmDetail; onAction: (a: ActionId) => void; busy: boolean }) {
  const kpi = useVmMetrics(vm, "1h")!;
  const on = vm.state === "running";
  const ds = vm.datastore;
  const dsPct = Math.round((ds.usedGb / ds.capacityGb) * 1000) / 10;
  const netTotal = Math.round((vm.netInMbps + vm.netOutMbps) * 10) / 10;
  const net = kpi.netIn.map((v, i) => v + kpi.netOut[i]);

  const actions: { id: ActionId; label: string; icon: string; tone?: string; enabled: boolean }[] = [
    { id: "power_on", label: "Power On", icon: "fa-play", tone: "ok", enabled: vm.state !== "running" },
    { id: "power_off", label: "Power Off", icon: "fa-stop", tone: "crit", enabled: vm.state !== "stopped" },
    { id: "restart", label: "Restart", icon: "fa-rotate-right", tone: "warn", enabled: on },
    { id: "suspend", label: "Suspend", icon: "fa-pause", enabled: on },
    { id: "reset", label: "Reset", icon: "fa-arrows-rotate", enabled: on },
    { id: "migrate", label: "Migrate", icon: "fa-right-left", enabled: vm.details.clusterHosts.length > 1 },
    { id: "console", label: "Open Console", icon: "fa-display", enabled: on && !!vm.vcenter },
    { id: "snapshot", label: "Take Snapshot", icon: "fa-camera", enabled: true },
    { id: "clone", label: "Clone VM", icon: "fa-clone", enabled: true },
    { id: "settings", label: "Edit Settings", icon: "fa-gear", enabled: true },
    { id: "move", label: "Move to Host", icon: "fa-server", enabled: vm.details.clusterHosts.length > 1 },
    { id: "logs", label: "Download Logs", icon: "fa-download", enabled: true },
  ];

  return (
    <>
      <div className="vm-kpis">
        <Kpi icon="fa-microchip" tint={C.cpu} label="CPU Usage" value={on ? `${vm.cpuPct}%` : "—"} trend={on ? trendPct(kpi.cpu) : undefined} spark={kpi.cpu} color={C.cpu} />
        <Kpi icon="fa-memory" tint={C.mem} label="Memory Usage" value={on ? `${vm.memPct}%` : "—"} trend={on ? trendPct(kpi.mem) : undefined} spark={kpi.mem} color={C.mem} />
        <Kpi icon="fa-hard-drive" tint={C.disk} label="Disk Usage (Total)" value={`${vm.diskPct}%`} trend={trendPct(kpi.disk)} spark={kpi.disk} color={C.disk} />
        <Kpi icon="fa-network-wired" tint={C.net} label="Network (Total)" value={on ? `${netTotal} Mb/s` : "—"} trend={on ? trendPct(net) : undefined} spark={net} color={C.net} />
        <Kpi icon="fa-clock" tint="#0ea5e9" label="Uptime" value={on ? formatUptime(vm.uptimeSeconds).split(",")[0] : "—"} />
        <div className="vm-kpi">
          <div className="vm-kpi-top">
            <span className={`vm-status-icon ${vm.state}`}><i className={`fa-solid ${on ? "fa-check" : vm.state === "suspended" ? "fa-pause" : "fa-power-off"}`} /></span>
            <div>
              <div className="vm-kpi-label">Status</div>
              <div className={`vm-status-text ${vm.state}`}>{on ? "Running" : vm.state === "suspended" ? "Suspended" : "Powered Off"}</div>
              <div className="cell-sub">HA: {vm.haProtected ? "Protected" : "Not protected"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="vm-grid">
        <Card title="VM Information" className="vm-info">
          <div className="vendor-logo">{vm.platform === "VMware" ? <><span className="vm-logo-mark">vm</span>ware</> : vm.platform}</div>
          <InfoTable rows={[
            ["VM Name", vm.name], ["IP Address", vm.ip], ["vCenter", vm.vcenter], ["Cluster", vm.cluster],
            ["Host", `${vm.host}${vm.hostIp ? ` (${vm.hostIp})` : ""}`], ["Datastore", `${ds.name} (${ds.type.includes("SSD") ? "SSD" : ds.type})`],
            ["vCPU", `${vm.vcpu} vCPU`], ["Memory", `${vm.memoryGb} GB`], ["OS", vm.os],
            ["Tools Status", <span className={on ? "ok-text" : "muted-text"}><i className={`fa-solid ${on ? "fa-circle-check" : "fa-circle-minus"}`} /> {vm.toolsStatus}</span>],
            ["VM State", <span className={on ? "ok-text" : "crit-text"}><i className={`fa-solid ${on ? "fa-circle-check" : "fa-circle-xmark"}`} /> {on ? "Powered On" : vm.state === "suspended" ? "Suspended" : "Powered Off"}</span>],
            ["Created On", formatDateTime(vm.createdAt)],
            ["Description", vm.description || "—"],
          ]} />
        </Card>

        <ChartCard title="Resource Utilization" vm={vm} render={(m, r) => (<>
          <LineChart xTicks={timeTicks(r)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct}
            series={[{ label: "CPU", color: C.cpu, data: m.cpu }, { label: "Memory", color: C.mem, data: m.mem }, { label: "Disk", color: C.disk, data: m.disk }]} />
          <Legend items={[{ label: "CPU", color: C.cpu, value: on ? `${vm.cpuPct}%` : "—" }, { label: "Memory", color: C.mem, value: on ? `${vm.memPct}%` : "—" }, { label: "Disk", color: C.disk, value: `${vm.diskPct}%` }]} />
        </>)} />

        <Card title="VM Actions" className="vm-actions-card">
          <div className="vm-actions">
            {actions.map((a) => (
              <button key={a.id} className={`vm-action ${a.tone ?? ""}`} disabled={!a.enabled || busy} onClick={() => onAction(a.id)}>
                <i className={`fa-solid ${a.icon}`} /> {a.label}
              </button>
            ))}
          </div>
          <div className="cell-sub" style={{ marginTop: 10 }}>
            <i className="fa-solid fa-circle-info" /> Actions are recorded by Argus; no live vCenter is connected in this environment.
          </div>
        </Card>

        <ChartCard title="Disk Usage" vm={vm} render={(m, r) => (<>
          <LineChart xTicks={timeTicks(r)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct}
            series={[{ label: "Used", color: C.cpu, data: m.disk, fill: true }, { label: "Free", color: C.free, data: m.diskFree }]} />
          <Legend items={[
            { label: "Used", color: C.cpu, value: `${vm.diskPct}% (${vm.diskUsedGb} GB)` },
            { label: "Free", color: C.free, value: `${Math.round((100 - vm.diskPct) * 10) / 10}% (${vm.diskProvisionedGb - vm.diskUsedGb} GB)` },
          ]} />
        </>)} />

        <ChartCard title="Network Traffic" vm={vm} render={(m, r) => {
          const sc = niceScale([...m.netIn, ...m.netOut]);
          return (<>
            <LineChart xTicks={timeTicks(r)} yMax={sc.max} yTicks={sc.ticks} formatY={(v) => `${v} Mb/s`}
              series={[{ label: "Inbound", color: C.in, data: m.netIn }, { label: "Outbound", color: C.out, data: m.netOut }]} />
            <Legend items={[{ label: "Inbound", color: C.in, value: on ? `${vm.netInMbps} Mb/s` : "—" }, { label: "Outbound", color: C.out, value: on ? `${vm.netOutMbps} Mb/s` : "—" }]} />
          </>);
        }} />
      </div>

      <div className="vm-grid-3">
        <Card title="Datastore Details" icon="fa-database">
          <InfoTable rows={[
            ["Datastore", ds.name], ["Type", ds.type], ["Total Capacity", ds.capacityGb >= 1000 ? `${ds.capacityGb / 1000} TB` : `${ds.capacityGb} GB`],
            ["Used Space", `${ds.usedGb} GB (${dsPct}%)`], ["Free Space", `${ds.capacityGb - ds.usedGb} GB (${Math.round((100 - dsPct) * 10) / 10}%)`],
            ["Provisioning", ds.provisioning],
            ["Datastore Status", <span className={ds.status === "ok" ? "ok-text" : "warn-text"}><i className="fa-solid fa-circle-check" /> {ds.status === "ok" ? "Healthy" : "Warning"}</span>],
          ]} />
        </Card>

        <Card title="Snapshots" right={<button className="link-btn" onClick={() => onAction("snapshot")}>Take snapshot <i className="fa-solid fa-plus" /></button>}>
          {vm.snapshots.length ? (
            <table className="list compact">
              <thead><tr><th>Name</th><th>Created On</th><th>Size</th><th>Description</th></tr></thead>
              <tbody>{vm.snapshots.slice(0, 5).map((s) => (
                <tr key={s.id}><td className="cell-strong">{s.name}</td><td>{formatShort(s.createdAt)}</td><td>{s.sizeGb} GB</td><td>{s.description || "—"}</td></tr>
              ))}</tbody>
            </table>
          ) : <div className="empty-row">No snapshots.</div>}
        </Card>

        <Card title="Recent Events">
          <table className="list compact">
            <thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead>
            <tbody>{vm.events.slice(0, 5).map((e) => (
              <tr key={e.id}><td className="nowrap">{formatShort(e.ts)}</td><td><LevelBadge level={e.level} /></td><td>{e.message}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
