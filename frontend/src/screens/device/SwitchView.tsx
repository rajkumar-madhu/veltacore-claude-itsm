import React from "react";
import type { DeviceDetail, SwitchPort } from "@/api/hooks";
import { Legend, LineChart, Sparkline } from "@/components/charts";
import { Card, InfoTable, LevelBadge, Meter, RangeSelect } from "@/components/ui";
import { formatShort, formatUptime, timeTicks, trendPct, type Range } from "@/lib/series";
import { niceScale } from "../vm/useVmMetrics";
import { VendorMark } from "./deviceCommon";
import { useDeviceMetrics } from "./deviceMeta";

export type SwitchTab = "overview" | "ports" | "interfaces" | "performance" | "vlans" | "stp" | "logs"
  | "config" | "hardware" | "neighbors" | "alerts" | "topology" | "inventory";

const PORT_COLOR = { up: "#16a34a", down: "#dc2626", disabled: "#f59e0b", unused: "#9ca3af" } as const;
const PORT_LABEL = { up: "Up", down: "Down", disabled: "Disabled", unused: "Unused" } as const;
const util = (p: SwitchPort) => (p.speedMbps ? Math.round((Math.max(p.inMbps, p.outMbps) / p.speedMbps) * 100) : 0);
const errTotal = (p: SwitchPort) => p.inErrors + p.outErrors + p.discards;
const pct = (v: number) => `${v}%`;

function Kpi({ icon, tint, label, value, sub, trend, spark, color }: {
  icon: string; tint: string; label: string; value: React.ReactNode; sub?: React.ReactNode; trend?: number; spark?: number[]; color?: string;
}) {
  return (
    <div className="vm-kpi">
      <div className="vm-kpi-top">
        <span className="vm-kpi-icon" style={{ background: `${tint}1a`, color: tint }}><i className={`fa-solid ${icon}`} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="vm-kpi-label">{label}</div>
          <div className="vm-kpi-value">{value}
            {trend != null && trend !== 0 && <span className={`vm-kpi-trend ${trend > 0 ? "up" : "down"}`}><i className={`fa-solid fa-arrow-${trend > 0 ? "up" : "down"}`} /> {Math.abs(trend)}%</span>}
          </div>
          {sub && <div className="cell-sub">{sub}</div>}
        </div>
      </div>
      {spark && color && <Sparkline data={spark} color={color} />}
    </div>
  );
}

export function PortGrid({ ports, selected, onSelect }: { ports: SwitchPort[]; selected?: string; onSelect: (p: SwitchPort) => void }) {
  return (
    <div className="port-grid">
      {ports.map((p) => {
        const hasErr = p.status === "up" && errTotal(p) >= 20;
        return (
          <button key={p.name} className={`port${selected === p.name ? " sel" : ""}`} onClick={() => onSelect(p)}
            title={`${p.name} · ${PORT_LABEL[p.status]}${p.status === "up" ? ` · ${util(p)}%` : ""}${hasErr ? " · errors" : ""}`}>
            <span className="port-face" style={{ background: hasErr ? "#c2410c" : PORT_COLOR[p.status] }}><span /></span>
            <span className="port-num">{p.number}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PortPanel({ port, busy, onToggle }: { port: SwitchPort; busy: boolean; onToggle: (p: SwitchPort, enable: boolean) => void }) {
  return (
    <div className="port-panel">
      <div><b>{port.name}</b> <span className="cell-sub">{port.description || "no description"}</span></div>
      <div className="port-panel-stats">
        <span>Status <b style={{ color: PORT_COLOR[port.status] }}>{PORT_LABEL[port.status]}</b></span>
        <span>VLAN <b>{port.vlan}</b> ({port.mode})</span>
        <span>In <b>{port.inMbps} Mb/s</b></span><span>Out <b>{port.outMbps} Mb/s</b></span>
        <span>Errors <b>{port.inErrors}/{port.outErrors}</b></span>
      </div>
      {port.status === "disabled"
        ? <button className="btn sm" disabled={busy} onClick={() => onToggle(port, true)}><i className="fa-solid fa-plug" /> Enable port</button>
        : port.status !== "unused" && <button className="btn sm" disabled={busy} onClick={() => onToggle(port, false)}><i className="fa-solid fa-ban" /> Shut down port</button>}
    </div>
  );
}

function ChartCard({ title, d, render }: { title: string; d: DeviceDetail; render: (m: NonNullable<ReturnType<typeof useDeviceMetrics>>, r: Range) => React.ReactNode }) {
  const [range, setRange] = React.useState<Range>("24h");
  const m = useDeviceMetrics(d, range);
  return <Card title={title} right={<RangeSelect value={range} onChange={setRange} />}>{m && render(m, range)}</Card>;
}

function TopTraffic({ ports }: { ports: SwitchPort[] }) {
  const top = [...ports].filter((p) => p.status === "up" || p.status === "down")
    .sort((a, b) => util(b) - util(a) || (a.status === "down" ? -1 : 1)).slice(0, 5);
  return (
    <table className="list compact">
      <thead><tr><th>Interface</th><th>Status</th><th>In (Mbps)</th><th>Out (Mbps)</th><th style={{ width: 130 }}>Utilization</th></tr></thead>
      <tbody>{top.map((p) => (
        <tr key={p.name}><td className="link">{p.name}</td>
          <td><span className={`lvl ${p.status === "up" ? "ok-text" : "crit"}`}><i className={`fa-solid fa-circle-${p.status === "up" ? "check" : "xmark"}`} /> {PORT_LABEL[p.status]}</span></td>
          <td>{p.inMbps}</td><td>{p.outMbps}</td>
          <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1 }}><Meter pct={util(p)} /></div><span className="cell-sub">{util(p)}%</span></div></td></tr>
      ))}</tbody>
    </table>
  );
}

function TopErrors({ ports }: { ports: SwitchPort[] }) {
  const top = [...ports].filter((p) => errTotal(p) > 0).sort((a, b) => errTotal(b) - errTotal(a)).slice(0, 5);
  if (!top.length) return <div className="empty-row">No interface errors.</div>;
  return (
    <table className="list compact">
      <thead><tr><th>Interface</th><th>In Errors</th><th>Out Errors</th><th>Discards</th></tr></thead>
      <tbody>{top.map((p) => (
        <tr key={p.name}><td className="link">{p.name}</td><td className={p.inErrors >= 10 ? "crit-text" : ""}>{p.inErrors}</td><td className={p.outErrors >= 5 ? "crit-text" : ""}>{p.outErrors}</td><td>{p.discards}</td></tr>
      ))}</tbody>
    </table>
  );
}

export function SwitchOverview({ d, onPortToggle, busy }: { d: DeviceDetail; onPortToggle: (p: SwitchPort, enable: boolean) => void; busy: boolean }) {
  const kpi = useDeviceMetrics(d, "1h")!;
  const ports = d.details.ports ?? [];
  const [sel, setSel] = React.useState<string>();
  const selPort = ports.find((p) => p.name === sel);
  const on = d.status === "online";
  const counts = { up: 0, down: 0, disabled: 0, unused: 0 };
  ports.forEach((p) => counts[p.status]++);
  const active = counts.up;
  const temp = d.details.hardware?.sensors?.[0];

  return (
    <>
      <div className="vm-kpis">
        <div className="vm-kpi"><div className="vm-kpi-top">
          <span className={`vm-status-icon ${on ? "running" : "stopped"}`}><i className={`fa-solid ${on ? "fa-check" : "fa-xmark"}`} /></span>
          <div><div className="vm-kpi-label">Device Status</div><div className={`vm-status-text ${on ? "running" : "stopped"}`}>{on ? "Online" : d.status === "offline" ? "Offline" : "Unknown"}</div>
            <div className="cell-sub">Last seen: {d.lastSeen ? formatShort(d.lastSeen) : "never"}</div></div>
        </div></div>
        <Kpi icon="fa-clock" tint="#2563eb" label="Uptime" value={on ? formatUptime(d.uptimeSeconds).split(",")[0] : "—"} />
        <Kpi icon="fa-microchip" tint="#16a34a" label="CPU Usage" value={d.cpuPct != null && on ? `${d.cpuPct}%` : "—"} trend={on ? trendPct(kpi.cpu) : undefined} spark={kpi.cpu} color="#16a34a" />
        <Kpi icon="fa-memory" tint="#2563eb" label="Memory Usage" value={d.memPct != null && on ? `${d.memPct}%` : "—"} trend={on ? trendPct(kpi.mem) : undefined} spark={kpi.mem} color="#2563eb" />
        <Kpi icon="fa-temperature-half" tint="#dc2626" label="Temperature" value={d.tempC != null && on ? `${d.tempC} °C` : "—"} spark={kpi.temp} color="#16a34a"
          sub={temp ? `warn at ${temp.warnC} °C` : undefined} />
        <Kpi icon="fa-ethernet" tint="#0ea5e9" label="Active Ports" value={`${active} / ${ports.length}`}
          sub={ports.length ? <span className="ok-text"><i className="fa-solid fa-arrow-up" /> {Math.round((active / ports.length) * 100)}% in use</span> : undefined} />
      </div>

      <div className="sw-grid">
        <Card title="Device Information">
          <div className="device-hero"><VendorMark vendor={d.vendor} size={22} /><div className="chassis">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div></div>
          <InfoTable rows={[
            ["Hostname", d.hostname], ["IP Address", d.ip], ["Management IP", d.mgmtIp], ["MAC Address", d.mac], ["Serial Number", d.serial],
            ["Model", d.model], [`${d.osType || "OS"} Version`, d.osVersion], ["Site / Location", `${d.siteName}${d.location ? ` - ${d.location}` : ""}`],
            ["Role", d.role], ["Contact", d.contact], ["Description", d.description],
          ]} />
        </Card>

        <Card title={`Port Status (${ports.length} Ports)`}>
          <div className="port-legend">
            {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
              <span key={k}><span className="sw" style={{ background: PORT_COLOR[k] }} />{PORT_LABEL[k]} ({counts[k]})</span>
            ))}
          </div>
          <PortGrid ports={ports} selected={sel} onSelect={(p) => setSel(p.name === sel ? undefined : p.name)} />
          {selPort ? <PortPanel port={selPort} busy={busy} onToggle={onPortToggle} /> : <div className="cell-sub" style={{ marginTop: 10 }}>Click a port for details and enable/shutdown.</div>}
        </Card>

        <div className="stack">
          <Card title="Interface Traffic (Top 5)" bodyPad={false}><TopTraffic ports={ports} /></Card>
          <Card title="Interface Errors (Top 5)" bodyPad={false}><TopErrors ports={ports} /></Card>
        </div>
      </div>

      <div className="charts-4">
        <ChartCard title="CPU Utilization" d={d} render={(m, r) => (<>
          <LineChart height={140} xTicks={timeTicks(r, 6)} yMax={100} yTicks={[0, 20, 40, 60, 80, 100]} formatY={pct} series={[{ label: "CPU", color: "#2563eb", data: m.cpu, fill: true }]} />
          <Legend items={[{ label: "CPU", color: "#2563eb", value: on && d.cpuPct != null ? `${d.cpuPct}%` : "—" }]} /></>)} />
        <ChartCard title="Memory Usage" d={d} render={(m, r) => (<>
          <LineChart height={140} xTicks={timeTicks(r, 6)} yMax={100} yTicks={[0, 20, 40, 60, 80, 100]} formatY={pct} series={[{ label: "Memory", color: "#16a34a", data: m.mem, fill: true }]} />
          <Legend items={[{ label: "Memory", color: "#16a34a", value: on && d.memPct != null ? `${d.memPct}%` : "—" }]} /></>)} />
        <ChartCard title="Network Throughput (All Interfaces)" d={d} render={(m, r) => {
          const sc = niceScale([...m.netIn, ...m.netOut]);
          const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10} Gb/s` : `${v} Mb/s`);
          return (<>
            <LineChart height={140} xTicks={timeTicks(r, 6)} yMax={sc.max} yTicks={sc.ticks} formatY={fmt}
              series={[{ label: "Inbound", color: "#2563eb", data: m.netIn, fill: true }, { label: "Outbound", color: "#f97316", data: m.netOut }]} />
            <Legend items={[{ label: "Inbound", color: "#2563eb", value: fmt(m.inNow) }, { label: "Outbound", color: "#f97316", value: fmt(m.outNow) }]} /></>);
        }} />
        <ChartCard title="Temperature Trend" d={d} render={(m, r) => (<>
          <LineChart height={140} xTicks={timeTicks(r, 6)} yMax={60} yTicks={[0, 15, 30, 45, 60]} formatY={(v) => `${v} °C`} series={[{ label: "Switch Temp", color: "#dc2626", data: m.temp }]} />
          <Legend items={[{ label: "Switch Temp", color: "#dc2626", value: on && d.tempC != null ? `${d.tempC} °C` : "—" }]} /></>)} />
      </div>

      <div className="vm-grid-3">
        <AlertsCard d={d} limit={5} />
        <Card title="VLAN Information" bodyPad={false}><VlanTable d={d} /></Card>
        <Card title="Neighbors (CDP/LLDP)" bodyPad={false}><NeighborTable d={d} compact /></Card>
      </div>
    </>
  );
}

function AlertsCard({ d, limit }: { d: DeviceDetail; limit?: number }) {
  const alerts = (d.details.alerts ?? []).slice(0, limit);
  return (
    <Card title={limit ? "Recent Alerts" : `Alerts (${alerts.length})`} bodyPad={false}>
      {alerts.length ? (
        <table className="list compact">
          <thead><tr><th>Time</th><th>Severity</th><th>Interface</th><th>Message</th></tr></thead>
          <tbody>{alerts.map((a, i) => (
            <tr key={i}><td className="nowrap">{a.ts ?? a.since}</td><td><LevelBadge level={a.severity} /></td><td className="mono">{a.source}</td><td>{a.message ?? a.title}</td></tr>
          ))}</tbody>
        </table>
      ) : <div className="empty-row">No alerts.</div>}
    </Card>
  );
}

function VlanTable({ d }: { d: DeviceDetail }) {
  return (
    <table className="list compact">
      <thead><tr><th>VLAN ID</th><th>Name</th><th>Status</th><th>Ports</th><th>Description</th></tr></thead>
      <tbody>{(d.details.vlans ?? []).map((v) => (
        <tr key={v.id}><td>{v.id}</td><td>{v.name}</td><td><span className="lvl ok-text"><i className="fa-solid fa-circle-check" /> Active</span></td><td>{v.ports}</td><td>{v.description}</td></tr>
      ))}</tbody>
    </table>
  );
}

function NeighborTable({ d, compact }: { d: DeviceDetail; compact?: boolean }) {
  return (
    <table className={`list${compact ? " compact" : ""}`}>
      <thead><tr><th>Neighbor Device</th><th>Port</th>{!compact && <th>Remote Port</th>}<th>Platform</th><th>IP Address</th>{!compact && <th>Protocol</th>}</tr></thead>
      <tbody>{(d.details.neighbors ?? []).map((n) => (
        <tr key={n.device}><td className="cell-strong">{n.device}</td><td className="mono">{n.localPort}</td>{!compact && <td className="mono">{n.remotePort}</td>}
          <td>{n.platform}</td><td className="mono">{n.ip}</td>{!compact && <td>{n.protocol}</td>}</tr>
      ))}</tbody>
    </table>
  );
}

export function SwitchTabBody({ tab, d, busy, onPortToggle }: {
  tab: SwitchTab; d: DeviceDetail; busy: boolean; onPortToggle: (p: SwitchPort, enable: boolean) => void;
}) {
  const ports = d.details.ports ?? [];
  const [sel, setSel] = React.useState<string>();
  const [range, setRange] = React.useState<Range>("24h");
  const m = useDeviceMetrics(d, range)!;
  const [portFilter, setPortFilter] = React.useState("");

  switch (tab) {
    case "overview": return <SwitchOverview d={d} onPortToggle={onPortToggle} busy={busy} />;
    case "ports": {
      const selPort = ports.find((p) => p.name === sel);
      return (
        <Card title={`Ports (${ports.length})`}>
          <PortGrid ports={ports} selected={sel} onSelect={(p) => setSel(p.name === sel ? undefined : p.name)} />
          {selPort && <PortPanel port={selPort} busy={busy} onToggle={onPortToggle} />}
        </Card>
      );
    }
    case "interfaces": {
      const shown = ports.filter((p) => !portFilter || p.status === portFilter);
      return (
        <Card title={`Interfaces (${shown.length})`} bodyPad={false} right={
          <select className="select-sm" value={portFilter} onChange={(e) => setPortFilter(e.target.value)}>
            <option value="">All statuses</option><option value="up">Up</option><option value="down">Down</option><option value="disabled">Disabled</option><option value="unused">Unused</option>
          </select>}>
          <div className="table-wrap"><table className="list compact">
            <thead><tr><th>Interface</th><th>Description</th><th>Status</th><th>VLAN</th><th>Mode</th><th>Speed</th><th>Duplex</th><th>In</th><th>Out</th><th>Util</th><th>In Err</th><th>Out Err</th><th>Discards</th><th></th></tr></thead>
            <tbody>{shown.map((p) => (
              <tr key={p.name}><td className="mono cell-strong">{p.name}</td><td>{p.description || "—"}</td>
                <td><span style={{ color: PORT_COLOR[p.status], fontWeight: 600 }}>{PORT_LABEL[p.status]}</span></td>
                <td>{p.vlan}</td><td>{p.mode}</td><td>{p.speedMbps ? `${p.speedMbps / 1000}G` : "—"}</td><td>{p.duplex}</td>
                <td>{p.inMbps}</td><td>{p.outMbps}</td><td>{util(p)}%</td><td>{p.inErrors}</td><td>{p.outErrors}</td><td>{p.discards}</td>
                <td>{p.status === "disabled"
                  ? <button className="link-btn" disabled={busy} onClick={() => onPortToggle(p, true)}>Enable</button>
                  : p.status !== "unused" && <button className="link-btn" disabled={busy} onClick={() => onPortToggle(p, false)}>Shut</button>}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      );
    }
    case "performance": {
      const sc = niceScale([...m.netIn, ...m.netOut]);
      const rangeSel = <RangeSelect value={range} onChange={setRange} />;
      return (
        <div className="grid-2">
          <Card title="CPU" right={rangeSel}><LineChart xTicks={timeTicks(range)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "CPU", color: "#2563eb", data: m.cpu, fill: true }]} /></Card>
          <Card title="Memory" right={rangeSel}><LineChart xTicks={timeTicks(range)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "Memory", color: "#16a34a", data: m.mem, fill: true }]} /></Card>
          <Card title="Throughput" right={rangeSel} className="span-2"><LineChart xTicks={timeTicks(range)} yMax={sc.max} yTicks={sc.ticks} formatY={(v) => `${v} Mb/s`}
            series={[{ label: "Inbound", color: "#2563eb", data: m.netIn }, { label: "Outbound", color: "#f97316", data: m.netOut }]} /></Card>
        </div>
      );
    }
    case "vlans": return <Card title={`VLANs (${d.details.vlans?.length ?? 0})`} bodyPad={false}><VlanTable d={d} /></Card>;
    case "stp": {
      const stp = d.details.stp;
      if (!stp) return <Card title="Spanning Tree"><div className="empty-row">No STP data.</div></Card>;
      return (
        <Card title={`Spanning Tree — ${stp.mode}`} bodyPad={false}>
          <table className="list">
            <thead><tr><th>VLAN</th><th>Root Bridge</th><th>Root Priority</th><th>This Switch Is Root</th><th>Root Port</th><th>Topology Changes</th></tr></thead>
            <tbody>{stp.instances.map((s) => (
              <tr key={s.vlan}><td>{s.vlan}</td><td className="cell-strong">{s.rootBridge}</td><td>{s.rootPriority}</td><td>{s.isRoot ? <span className="ok-text">Yes</span> : "No"}</td>
                <td className="mono">{s.rootPort}</td><td className={s.topologyChanges ? "warn-text" : ""}>{s.topologyChanges}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      );
    }
    case "logs": return (
      <Card title="Syslog" bodyPad={false}>
        <div className="log-view">{(d.details.logs ?? []).map((l, i) => (
          <div key={i} className={`log-line ${l.level.toLowerCase()}`}><span className="ts">{l.ts}</span><span className="lv">{l.level}</span><span className="src">{l.source}</span><span>{l.message}</span></div>
        ))}</div>
      </Card>
    );
    case "config": return (
      <Card title="Running Configuration" bodyPad={false} right={<span className="cell-sub">Secrets masked</span>}>
        <pre className="config-view">{d.details.runningConfig ?? "No configuration captured."}</pre>
      </Card>
    );
    case "hardware": {
      const hw = d.details.hardware;
      if (!hw) return <Card title="Hardware"><div className="empty-row">No hardware data.</div></Card>;
      return (
        <div className="grid-2">
          <Card title="Chassis"><InfoTable rows={[["Chassis", hw.chassis], ["CPU", hw.cpu], ["Memory", `${hw.memoryMb} MB`], ["Flash", `${hw.flashMb} MB`], ["Serial", d.serial]]} /></Card>
          <Card title="Environment" bodyPad={false}>
            <table className="list compact"><thead><tr><th>Component</th><th>Reading</th><th>Status</th></tr></thead>
              <tbody>
                {hw.psus.map((p) => <tr key={p.name}><td>{p.name} ({p.model})</td><td>{p.watts} W</td><td><span className="ok-text">OK</span></td></tr>)}
                {hw.fans.map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.rpm} RPM</td><td><span className="ok-text">OK</span></td></tr>)}
                {hw.sensors.map((s) => <tr key={s.name}><td>{s.name} temperature</td><td>{s.valueC} °C (warn {s.warnC})</td><td><span className={s.valueC >= s.warnC ? "crit-text" : "ok-text"}>{s.valueC >= s.warnC ? "High" : "OK"}</span></td></tr>)}
              </tbody></table>
          </Card>
        </div>
      );
    }
    case "neighbors": return <Card title={`Neighbors (${d.details.neighbors?.length ?? 0})`} bodyPad={false}><NeighborTable d={d} /></Card>;
    case "alerts": return <AlertsCard d={d} />;
    case "topology": return <Card title="Topology (CDP/LLDP)"><StarTopology d={d} /></Card>;
    case "inventory": return (
      <Card title="Inventory" bodyPad={false}>
        <table className="list"><thead><tr><th>Name</th><th>Description</th><th>PID</th><th>Serial</th></tr></thead>
          <tbody>{(d.details.inventory ?? []).map((it) => <tr key={it.name}><td className="cell-strong">{it.name}</td><td>{it.description}</td><td className="mono">{it.pid}</td><td className="mono">{it.serial}</td></tr>)}</tbody>
        </table>
      </Card>
    );
  }
}

function StarTopology({ d }: { d: DeviceDetail }) {
  const ns = d.details.neighbors ?? [];
  const W = 760, H = 380, cx = W / 2, cy = H / 2, r = 150;
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block", margin: "0 auto" }}>
        {ns.map((n, i) => {
          const a = (i / ns.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(a) * r * 1.6, y = cy + Math.sin(a) * r;
          return (
            <g key={n.device}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={2} />
              <text x={(cx + x) / 2} y={(cy + y) / 2 - 4} fontSize={10} fill="#64748b" textAnchor="middle">{n.localPort}</text>
              <rect x={x - 62} y={y - 22} width={124} height={44} rx={8} fill="white" stroke="#cbd5e1" />
              <text x={x} y={y - 4} fontSize={12} fontWeight={700} textAnchor="middle" fill="#0f1c3f">{n.device}</text>
              <text x={x} y={y + 12} fontSize={10} textAnchor="middle" fill="#64748b">{n.platform}</text>
            </g>
          );
        })}
        <rect x={cx - 70} y={cy - 26} width={140} height={52} rx={10} fill="#eff6ff" stroke="#2563eb" strokeWidth={2} />
        <text x={cx} y={cy - 4} fontSize={13} fontWeight={800} textAnchor="middle" fill="#1d4ed8">{d.hostname}</text>
        <text x={cx} y={cy + 13} fontSize={10.5} textAnchor="middle" fill="#475569">{d.ip}</text>
      </svg>
    </div>
  );
}
