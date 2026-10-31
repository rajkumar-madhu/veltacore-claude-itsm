import React from "react";
import type { VmDetail } from "@/api/hooks";
import { Legend, LineChart } from "@/components/charts";
import { Card, InfoTable, LevelBadge, Meter, RangeSelect } from "@/components/ui";
import { formatDateTime, formatShort, timeTicks, type Range } from "@/lib/series";
import { niceScale, useVmMetrics } from "./useVmMetrics";

const pct = (v: number) => `${v}%`;

function useRange() { return React.useState<Range>("6h"); }

export function PerformanceTab({ vm }: { vm: VmDetail }) {
  const [range, setRange] = useRange();
  const m = useVmMetrics(vm, range)!;
  const ticks = timeTicks(range);
  const net = niceScale([...m.netIn, ...m.netOut]);
  const iops = niceScale(m.diskIops);
  const lat = niceScale(m.diskLatency);
  const sel = <RangeSelect value={range} onChange={setRange} />;
  return (
    <div className="grid-2">
      <Card title="CPU Utilization" right={sel}><LineChart xTicks={ticks} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "CPU", color: "#2563eb", data: m.cpu, fill: true }]} />
        <Legend items={[{ label: `CPU (${vm.vcpu} vCPU)`, color: "#2563eb", value: `${vm.cpuPct}%` }]} /></Card>
      <Card title="Memory Utilization" right={sel}><LineChart xTicks={ticks} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "Memory", color: "#16a34a", data: m.mem, fill: true }]} />
        <Legend items={[{ label: `Memory (${vm.memoryGb} GB)`, color: "#16a34a", value: `${vm.memPct}%` }]} /></Card>
      <Card title="Disk IOPS" right={sel}><LineChart xTicks={ticks} yMax={iops.max} yTicks={iops.ticks} series={[{ label: "IOPS", color: "#f59e0b", data: m.diskIops }]} /></Card>
      <Card title="Disk Latency (ms)" right={sel}><LineChart xTicks={ticks} yMax={lat.max} yTicks={lat.ticks} formatY={(v) => `${v}ms`} series={[{ label: "Latency", color: "#dc2626", data: m.diskLatency }]} /></Card>
      <Card title="Network Throughput" right={sel} className="span-2"><LineChart xTicks={ticks} yMax={net.max} yTicks={net.ticks} formatY={(v) => `${v} Mb/s`}
        series={[{ label: "Inbound", color: "#2563eb", data: m.netIn }, { label: "Outbound", color: "#f97316", data: m.netOut }]} />
        <Legend items={[{ label: "Inbound", color: "#2563eb", value: `${vm.netInMbps} Mb/s` }, { label: "Outbound", color: "#f97316", value: `${vm.netOutMbps} Mb/s` }]} /></Card>
    </div>
  );
}

export function StorageTab({ vm }: { vm: VmDetail }) {
  return (
    <Card title={`Virtual Disks (${vm.details.disks.length})`} bodyPad={false}>
      <div className="table-wrap"><table className="list">
        <thead><tr><th>Disk</th><th>Mount</th><th>Filesystem</th><th>Size</th><th style={{ width: 180 }}>Used</th><th>Datastore</th><th>Provisioning</th><th>Controller</th></tr></thead>
        <tbody>{vm.details.disks.map((d) => {
          const p = Math.round((d.usedGb / d.sizeGb) * 100);
          return (
            <tr key={d.name}><td className="cell-strong">{d.name}</td><td className="mono">{d.mount}</td><td>{d.fs}</td><td>{d.sizeGb} GB</td>
              <td><Meter pct={p} /><span className="cell-sub">{d.usedGb} GB ({p}%)</span></td><td>{d.datastore}</td><td>{d.provisioning}</td><td className="mono">{d.controller}</td></tr>
          );
        })}</tbody>
      </table></div>
      <div className="card-foot">Provisioned {vm.diskProvisionedGb} GB · Used {vm.diskUsedGb} GB · Datastore {vm.datastore.name} ({vm.datastore.capacityGb - vm.datastore.usedGb} GB free)</div>
    </Card>
  );
}

export function NetworkTab({ vm }: { vm: VmDetail }) {
  return (
    <div className="stack">
      <Card title={`Network Adapters (${vm.details.nics.length})`} bodyPad={false}>
        <div className="table-wrap"><table className="list">
          <thead><tr><th>Adapter</th><th>Port Group</th><th>IP Address</th><th>MAC</th><th>Type</th><th>Speed</th><th>Status</th></tr></thead>
          <tbody>{vm.details.nics.map((n) => (
            <tr key={n.name}><td className="cell-strong">{n.name}</td><td>{n.portgroup}</td><td className="mono">{n.ip || "—"}</td><td className="mono">{n.mac}</td><td>{n.type}</td><td>{n.speedGbps} Gbps</td>
              <td><span className={`pill ${n.connected && vm.state === "running" ? "ok" : "muted"}`}>{n.connected && vm.state === "running" ? "Connected" : "Disconnected"}</span></td></tr>
          ))}</tbody>
        </table></div>
      </Card>
      <PerformanceNetOnly vm={vm} />
    </div>
  );
}

function PerformanceNetOnly({ vm }: { vm: VmDetail }) {
  const [range, setRange] = useRange();
  const m = useVmMetrics(vm, range)!;
  const sc = niceScale([...m.netIn, ...m.netOut]);
  return (
    <Card title="Traffic" right={<RangeSelect value={range} onChange={setRange} />}>
      <LineChart xTicks={timeTicks(range)} yMax={sc.max} yTicks={sc.ticks} formatY={(v) => `${v} Mb/s`}
        series={[{ label: "Inbound", color: "#2563eb", data: m.netIn }, { label: "Outbound", color: "#f97316", data: m.netOut }]} />
    </Card>
  );
}

export function SnapshotsTab({ vm, onTake }: { vm: VmDetail; onTake: () => void }) {
  const total = vm.snapshots.reduce((a, s) => a + s.sizeGb, 0);
  return (
    <Card title={`Snapshots (${vm.snapshots.length})`} bodyPad={false}
      right={<button className="btn primary sm" onClick={onTake}><i className="fa-solid fa-camera" /> Take Snapshot</button>}>
      {vm.snapshots.length ? (
        <table className="list">
          <thead><tr><th>Name</th><th>Created On</th><th>Size</th><th>Description</th></tr></thead>
          <tbody>{vm.snapshots.map((s) => (
            <tr key={s.id}><td className="cell-strong">{s.name}</td><td>{formatDateTime(s.createdAt)}</td><td>{s.sizeGb} GB</td><td>{s.description || "—"}</td></tr>
          ))}</tbody>
        </table>
      ) : <div className="empty-row">No snapshots yet.</div>}
      <div className="card-foot">{total} GB consumed by snapshots on {vm.datastore.name}{vm.snapshots.length > 2 && " · VMware recommends keeping ≤ 2–3 snapshots per VM"}</div>
    </Card>
  );
}

export function GuestOsTab({ vm }: { vm: VmDetail }) {
  const g = vm.details.guest;
  const rows: [string, React.ReactNode][] = [
    ["Operating System", g.os], ["Kernel / Build", g.kernel], ["Architecture", g.arch], ["Hostname", g.hostname],
    ["Time Zone", g.timezone], ["Last Boot", vm.state === "running" ? g.lastBoot : "—"], ["Load Average", vm.state === "running" ? g.loadAvg : "—"],
    ["Logged-in Users", vm.state === "running" ? g.users : 0], ["Installed Packages", g.packages], ["Pending Updates", g.pendingUpdates],
    ["SELinux", g.selinux], ["Firewall", g.firewall], ["VMware Tools", vm.toolsStatus],
  ];
  return <div className="grid-2"><Card title="Guest Operating System"><InfoTable rows={rows} /></Card>
    <Card title="Patch Status"><div className="big-stat"><span className={Number(g.pendingUpdates) > 0 ? "warn-text" : "ok-text"}>{g.pendingUpdates}</span> pending updates</div>
      <div className="cell-sub">Reported by the guest package manager on last inventory scan.</div></Card></div>;
}

export function ProcessesTab({ vm }: { vm: VmDetail }) {
  const procs = [...vm.details.processes].sort((a, b) => b.cpu - a.cpu);
  if (vm.state !== "running") return <Card title="Processes"><div className="empty-row">VM is not running — no live process list.</div></Card>;
  return (
    <Card title={`Top Processes (${procs.length})`} bodyPad={false}>
      <table className="list">
        <thead><tr><th>PID</th><th>Name</th><th>User</th><th style={{ width: 160 }}>CPU</th><th>Memory</th><th>Threads</th></tr></thead>
        <tbody>{procs.map((p) => (
          <tr key={p.pid}><td className="mono">{p.pid}</td><td className="cell-strong mono">{p.name}</td><td>{p.user}</td>
            <td><Meter pct={p.cpu} /><span className="cell-sub">{p.cpu}%</span></td><td>{p.memMb >= 1024 ? `${(p.memMb / 1024).toFixed(1)} GB` : `${p.memMb} MB`}</td><td>{p.threads}</td></tr>
        ))}</tbody>
      </table>
    </Card>
  );
}

export function ServicesTab({ vm }: { vm: VmDetail }) {
  const on = vm.state === "running";
  return (
    <Card title={`Services (${vm.details.services.length})`} bodyPad={false}>
      <table className="list">
        <thead><tr><th>Service</th><th>Status</th><th>Startup</th><th>Description</th></tr></thead>
        <tbody>{vm.details.services.map((s) => {
          const running = on && s.status === "running";
          return (
            <tr key={s.name}><td className="cell-strong mono">{s.name}</td>
              <td><span className={`pill ${running ? "ok" : "muted"}`}><i className={`fa-solid ${running ? "fa-circle-check" : "fa-circle-stop"}`} /> {running ? "Running" : "Stopped"}</span></td>
              <td>{s.startup}</td><td>{s.description}</td></tr>
          );
        })}</tbody>
      </table>
    </Card>
  );
}

export function LogsTab({ vm }: { vm: VmDetail }) {
  const [level, setLevel] = React.useState("");
  const logs = vm.details.logs.filter((l) => !level || l.level === level);
  return (
    <Card title="Guest Logs" bodyPad={false} right={
      <select className="select-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
        <option value="">All levels</option><option>INFO</option><option>WARN</option><option>ERROR</option>
      </select>}>
      {logs.length ? (
        <div className="log-view">{logs.map((l, i) => (
          <div key={i} className={`log-line ${l.level.toLowerCase()}`}><span className="ts">{l.ts}</span><span className="lv">{l.level}</span><span className="src">{l.source}</span><span>{l.message}</span></div>
        ))}</div>
      ) : <div className="empty-row">No log lines{level && ` at ${level}`}.</div>}
    </Card>
  );
}

export function AlertsTab({ vm }: { vm: VmDetail }) {
  return (
    <Card title={`Open Alerts (${vm.details.alerts.length})`} bodyPad={false}>
      {vm.details.alerts.length ? (
        <table className="list">
          <thead><tr><th>Severity</th><th>Alert</th><th>Source</th><th>Since</th></tr></thead>
          <tbody>{vm.details.alerts.map((a) => (
            <tr key={a.title}><td><LevelBadge level={a.severity} /></td><td className="cell-strong">{a.title}</td><td className="mono">{a.source}</td><td>{a.since}</td></tr>
          ))}</tbody>
        </table>
      ) : <div className="empty-row"><i className="fa-solid fa-circle-check ok-text" /> No open alerts.</div>}
    </Card>
  );
}

export function TopologyTab({ vm }: { vm: VmDetail }) {
  const nodes = [
    { icon: "fa-building", label: vm.vcenter || "vCenter", sub: "vCenter Server" },
    { icon: "fa-layer-group", label: vm.cluster, sub: `${vm.details.clusterHosts.length} hosts` },
    { icon: "fa-server", label: vm.host, sub: vm.hostIp ?? "" },
    { icon: "fa-cube", label: vm.name, sub: vm.ip, self: true },
    { icon: "fa-database", label: vm.datastore.name, sub: vm.datastore.type },
  ];
  return (
    <Card title="Topology">
      <div className="topo">
        {nodes.map((n, i) => (
          <React.Fragment key={n.label}>
            {i > 0 && <div className="topo-link"><i className="fa-solid fa-arrow-right" /></div>}
            <div className={`topo-node${n.self ? " self" : ""}`}><i className={`fa-solid ${n.icon}`} /><b>{n.label}</b><span>{n.sub}</span></div>
          </React.Fragment>
        ))}
      </div>
      <div className="topo-sub">
        <div className="cell-sub" style={{ marginBottom: 6 }}>Network</div>
        {vm.details.nics.map((n) => <span key={n.name} className="chip"><i className="fa-solid fa-ethernet" /> {n.portgroup}</span>)}
        <div className="cell-sub" style={{ margin: "12px 0 6px" }}>Other hosts in {vm.cluster}</div>
        {vm.details.clusterHosts.filter((h) => h.name !== vm.host).map((h) => <span key={h.name} className="chip"><i className="fa-solid fa-server" /> {h.name}</span>)}
      </div>
    </Card>
  );
}

export function ConfigurationTab({ vm }: { vm: VmDetail }) {
  return (
    <div className="grid-2">
      <Card title="Hardware"><InfoTable rows={[
        ["Hypervisor", vm.hypervisor], ["vCPU", vm.vcpu], ["Memory", `${vm.memoryGb} GB`],
        ["Disks", `${vm.details.disks.length} (${vm.diskProvisionedGb} GB provisioned)`], ["Network adapters", vm.details.nics.length],
        ["HA protection", vm.haProtected ? "Protected" : "Not protected"], ["Environment", vm.environment], ["Role", vm.role],
      ]} /></Card>
      <Card title="Advanced Settings"><InfoTable rows={Object.entries(vm.details.config)} /></Card>
    </div>
  );
}

export function EventsTab({ vm }: { vm: VmDetail }) {
  return (
    <Card title={`Events (${vm.events.length})`} bodyPad={false}>
      <table className="list">
        <thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead>
        <tbody>{vm.events.map((e) => (
          <tr key={e.id}><td className="nowrap">{formatShort(e.ts)}</td><td><LevelBadge level={e.level} /></td><td>{e.message}</td></tr>
        ))}</tbody>
      </table>
    </Card>
  );
}
