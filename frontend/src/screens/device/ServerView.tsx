import React from "react";
import type { DeviceDetail } from "@/api/hooks";
import { Legend, LineChart, Sparkline } from "@/components/charts";
import { Card, InfoTable, LevelBadge, Meter, RangeSelect } from "@/components/ui";
import { formatShort, formatUptime, timeTicks, trendPct, type Range } from "@/lib/series";
import { niceScale } from "../vm/useVmMetrics";
import { VendorMark } from "./deviceCommon";
import { useDeviceMetrics } from "./deviceMeta";

export type ServerTab = "overview" | "cpu" | "memory" | "disks" | "network" | "processes" | "services"
  | "eventlogs" | "hardware" | "logs" | "alerts" | "topology" | "configuration";

export type ServerAction = "power_on" | "graceful_shutdown" | "force_off" | "console" | "inventory" | "firmware" | "alerts" | "report";

const SENSOR_COLORS = ["#2563eb", "#dc2626", "#f59e0b", "#16a34a", "#7c3aed", "#0ea5e9"];
const pct = (v: number) => `${v}%`;
const OkMark = ({ status }: { status: string }) => (
  <span className={status === "ok" ? "ok-text" : status === "warning" ? "warn-text" : "crit-text"}>
    <i className={`fa-solid ${status === "ok" ? "fa-circle-check" : "fa-triangle-exclamation"}`} /> {status === "ok" ? "OK" : status === "warning" ? "Warning" : "Critical"}
  </span>
);

function NoData({ what }: { what: string }) {
  return <div className="empty-row"><i className="fa-solid fa-circle-info" /> No {what} reported for this device yet — run discovery or install an exporter/agent.</div>;
}

function HardwareTab({ d, busy, onAction }: { d: DeviceDetail; busy: boolean; onAction: (a: ServerAction) => void }) {
  const [range, setRange] = React.useState<Range>("24h");
  const m = useDeviceMetrics(d, range)!;
  const { bmc, health, temps = [], fans = [], psus = [], voltages = [], hwEvents = [] } = d.details;
  const on = d.status === "online";
  if (!bmc) return <Card title="Hardware (iDRAC / iLO)"><div className="empty-row"><i className="fa-solid fa-circle-info" /> No iDRAC or iLO is configured for {d.hostname}. Add the BMC address during onboarding to collect hardware sensors.</div></Card>;
  const isDell = bmc.kind === "iDRAC";
  const fanMax = niceScale(m.fans.flatMap((f) => f.data));

  return (
    <>
      <div className="hw-toolbar">
        <div className="seg">
          <button className={isDell ? "active" : ""} disabled={!isDell} title={isDell ? "" : "No Dell iDRAC on this server"}>Dell iDRAC</button>
          <button className={!isDell ? "active" : ""} disabled={isDell} title={!isDell ? "" : "No HPE iLO on this server"}>HPE iLO</button>
        </div>
        <RangeSelect value={range} onChange={setRange} />
      </div>

      <div className="hw-grid">
        <Card title={`${bmc.kind} Overview`} icon="fa-microchip">
          <div className="device-hero">
            <VendorMark vendor={d.vendor} size={22} />
            <div style={{ flex: 1 }}>
              <div className="cell-strong">{d.vendor} {bmc.version}</div>
              <span className={`pill ${bmc.connected ? "ok" : "crit"}`} style={{ marginTop: 4 }}><i className="fa-solid fa-circle-check" /> {bmc.connected ? "Connected" : "Disconnected"}</span>
            </div>
            <div className="chassis server">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
          </div>
          <InfoTable rows={[
            [`${bmc.kind} IP`, bmc.ip], ["Firmware", bmc.firmware], [isDell ? "Service Tag" : "Serial Number", d.serial], ["Model", d.model],
            ["Lifecycle Controller", bmc.lifecycleController], [`${bmc.kind} License`, <span className="ok-text"><i className="fa-solid fa-circle-check" /> {bmc.license}</span>],
            ["Last Updated", bmc.lastUpdated],
          ]} />
        </Card>

        <Card title="System Health" icon="fa-heart-pulse">
          {health ? (
            <div className="health-wrap">
              <div className="health-big">
                <span className={`health-ring ${health.overall}`}><i className={`fa-solid ${health.overall === "ok" ? "fa-check" : "fa-triangle-exclamation"}`} /></span>
                <div className={`health-word ${health.overall}`}>{health.overall === "ok" ? "Healthy" : "Degraded"}</div>
                <div className="cell-sub">{health.overall === "ok" ? "All components are normal" : `${health.components.filter((c) => c.status !== "ok").length} component(s) need attention`}</div>
              </div>
              <div className="health-tiles">
                {health.components.map((c) => (
                  <div key={c.name} className={`health-tile ${c.status}`}>
                    <div className="cell-sub">{c.name}</div>
                    <div><i className={`fa-solid ${c.status === "ok" ? "fa-circle-check" : "fa-triangle-exclamation"}`} /> {c.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : <NoData what="health summary" />}
        </Card>

        <Card title="Quick Actions" icon="fa-bolt">
          <div className="qa-grid">
            <a className="qa primary" href={`https://${bmc.ip}/`} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-display" /> Open {bmc.kind} Console <i className="fa-solid fa-chevron-right" /></a>
            <button className="qa" onClick={() => onAction("inventory")}><i className="fa-solid fa-list-check" /> View Hardware Inventory <i className="fa-solid fa-chevron-right" /></button>
            <button className="qa ok" disabled={busy || on} onClick={() => onAction("power_on")}><i className="fa-solid fa-power-off" /> Power On</button>
            <button className="qa" onClick={() => onAction("firmware")}><i className="fa-solid fa-upload" /> Update Firmware <i className="fa-solid fa-chevron-right" /></button>
            <button className="qa warn" disabled={busy || !on} onClick={() => onAction("graceful_shutdown")}><i className="fa-solid fa-power-off" /> Graceful Shutdown</button>
            <button className="qa" onClick={() => onAction("alerts")}><i className="fa-solid fa-bell" /> Configure Alerts <i className="fa-solid fa-chevron-right" /></button>
            <button className="qa crit" disabled={busy || !on} onClick={() => onAction("force_off")}><i className="fa-solid fa-power-off" /> Force Power Off</button>
            <button className="qa" onClick={() => onAction("report")}><i className="fa-solid fa-download" /> Download Reports <i className="fa-solid fa-chevron-right" /></button>
          </div>
        </Card>
      </div>

      <div className="hw-grid">
        <Card title="Temperature Sensors" icon="fa-temperature-half" bodyPad={false}>
          <table className="list compact"><thead><tr><th>Sensor</th><th>Current</th><th>Threshold</th><th>Status</th></tr></thead>
            <tbody>{temps.map((t) => (
              <tr key={t.sensor}><td>{t.sensor}</td><td>{t.current} °C</td><td>Warn: {t.warn} °C</td>
                <td><span className={t.current >= t.warn ? "crit-text" : "ok-text"}><i className="fa-solid fa-circle-check" /> {t.current >= t.warn ? "High" : "Normal"}</span></td></tr>
            ))}</tbody></table>
        </Card>
        <Card title="Fan Speed" icon="fa-fan" bodyPad={false}>
          <table className="list compact"><thead><tr><th>Fan</th><th>Current Speed</th><th>Status</th></tr></thead>
            <tbody>{fans.map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.rpm.toLocaleString()} RPM</td><td><span className="ok-text"><i className="fa-solid fa-circle-check" /> Normal</span></td></tr>)}</tbody></table>
        </Card>
        <div className="stack">
          <Card title="Power Supply" icon="fa-plug" bodyPad={false}>
            <table className="list compact"><thead><tr><th>PSU</th><th>Model</th><th>Status</th><th>Input</th><th>Output</th><th style={{ width: 90 }}>Usage</th></tr></thead>
              <tbody>{psus.map((p) => {
                const u = Math.round((p.outputW / p.capacityW) * 100);
                return <tr key={p.name}><td>{p.name}</td><td>{p.model}</td><td><OkMark status={p.status} /></td><td>{p.inputV}V</td><td>{p.outputW}W</td>
                  <td><div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ flex: 1 }}><Meter pct={u} /></div><span className="cell-sub">{u}%</span></div></td></tr>;
              })}</tbody></table>
          </Card>
          <Card title="Voltage Sensors" icon="fa-bolt" bodyPad={false}>
            <table className="list compact"><thead><tr><th>Sensor</th><th>Current</th><th>Range</th><th>Status</th></tr></thead>
              <tbody>{voltages.map((v) => {
                const okv = v.current >= v.min && v.current <= v.max;
                return <tr key={v.sensor}><td>{v.sensor}</td><td>{v.current} V</td><td>{v.min} – {v.max} V</td><td><span className={okv ? "ok-text" : "crit-text"}><i className="fa-solid fa-circle-check" /> {okv ? "Normal" : "Out of range"}</span></td></tr>;
              })}</tbody></table>
          </Card>
        </div>
      </div>

      <div className="hw-grid">
        <Card title="Temperature Trend" icon="fa-temperature-half">
          <LineChart height={170} xTicks={timeTicks(range, 6)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={(v) => `${v}`}
            series={m.tempSensors.map((s, i) => ({ label: s.label, color: SENSOR_COLORS[i], data: s.data }))} />
          <Legend items={m.tempSensors.map((s, i) => ({ label: s.label, color: SENSOR_COLORS[i] }))} />
        </Card>
        <Card title="Fan Speed Trend" icon="fa-fan">
          <LineChart height={170} xTicks={timeTicks(range, 6)} yMax={fanMax.max} yTicks={fanMax.ticks} formatY={(v) => (v >= 1000 ? `${v / 1000}K` : `${v}`)}
            series={m.fans.map((f, i) => ({ label: f.label, color: SENSOR_COLORS[i % 6], data: f.data }))} />
          <Legend items={m.fans.map((f, i) => ({ label: f.label, color: SENSOR_COLORS[i % 6] }))} />
        </Card>
        <Card title="Recent Hardware Events" icon="fa-bell" bodyPad={false}>
          <table className="list compact"><thead><tr><th>Time</th><th>Severity</th><th>Sensor</th><th>Message</th></tr></thead>
            <tbody>{hwEvents.map((e, i) => <tr key={i}><td className="nowrap">{e.ts}</td><td><LevelBadge level={e.severity} /></td><td>{e.sensor}</td><td>{e.message}</td></tr>)}</tbody></table>
        </Card>
      </div>
    </>
  );
}

function ServerOverview({ d }: { d: DeviceDetail }) {
  const k = useDeviceMetrics(d, "1h")!;
  const [range, setRange] = React.useState<Range>("6h");
  const m = useDeviceMetrics(d, range)!;
  const on = d.status === "online";
  const { cpu, dimms = [], storage, health, bmc } = d.details;
  const memTotal = dimms.reduce((a, x) => a + x.sizeGb, 0);
  const inlet = d.details.temps?.[0];
  const sel = <RangeSelect value={range} onChange={setRange} />;
  return (
    <>
      <div className="vm-kpis">
        <div className="vm-kpi"><div className="vm-kpi-top">
          <span className={`vm-status-icon ${on ? "running" : "stopped"}`}><i className={`fa-solid ${on ? "fa-check" : "fa-xmark"}`} /></span>
          <div><div className="vm-kpi-label">Status</div><div className={`vm-status-text ${on ? "running" : "stopped"}`}>{on ? "Online" : d.status === "offline" ? "Offline" : "Unknown"}</div>
            <div className="cell-sub">Last seen {d.lastSeen ? formatShort(d.lastSeen) : "never"}</div></div>
        </div></div>
        <div className="vm-kpi"><div className="vm-kpi-top"><span className="vm-kpi-icon" style={{ background: "#0ea5e91a", color: "#0ea5e9" }}><i className="fa-solid fa-clock" /></span>
          <div><div className="vm-kpi-label">Uptime</div><div className="vm-kpi-value">{on ? formatUptime(d.uptimeSeconds).split(",")[0] : "—"}</div></div></div></div>
        {[
          { label: "CPU Usage", icon: "fa-microchip", color: "#2563eb", val: d.cpuPct, data: k.cpu },
          { label: "Memory Usage", icon: "fa-memory", color: "#16a34a", val: d.memPct, data: k.mem },
        ].map(({ label, icon, color, val, data }) => {
          const t = trendPct(data);
          return (
            <div className="vm-kpi" key={label}>
              <div className="vm-kpi-top"><span className="vm-kpi-icon" style={{ background: `${color}1a`, color }}><i className={`fa-solid ${icon}`} /></span>
                <div><div className="vm-kpi-label">{label}</div><div className="vm-kpi-value">{on && val != null ? `${val}%` : "—"}
                  {on && val != null && t !== 0 && <span className={`vm-kpi-trend ${t > 0 ? "up" : "down"}`}><i className={`fa-solid fa-arrow-${t > 0 ? "up" : "down"}`} /> {Math.abs(t)}%</span>}</div></div></div>
              <Sparkline data={data} color={color} />
            </div>
          );
        })}
        <div className="vm-kpi"><div className="vm-kpi-top"><span className="vm-kpi-icon" style={{ background: "#dc26261a", color: "#dc2626" }}><i className="fa-solid fa-temperature-half" /></span>
          <div><div className="vm-kpi-label">Inlet Temperature</div><div className="vm-kpi-value">{inlet ? `${inlet.current} °C` : "—"}</div>{inlet && <div className="cell-sub">warn at {inlet.warn} °C</div>}</div></div></div>
        <div className="vm-kpi"><div className="vm-kpi-top"><span className="vm-kpi-icon" style={{ background: "#16a34a1a", color: "#16a34a" }}><i className="fa-solid fa-heart-pulse" /></span>
          <div><div className="vm-kpi-label">Hardware Health</div><div className={`vm-kpi-value ${health?.overall === "ok" ? "ok-text" : health ? "warn-text" : ""}`}>{health ? (health.overall === "ok" ? "Healthy" : "Degraded") : "—"}</div>
            <div className="cell-sub">{bmc ? `via ${bmc.kind}` : "No BMC configured"}</div></div></div></div>
      </div>
      <div className="grid-2">
        <Card title="System Information">
          <InfoTable rows={[
            ["Hostname", d.hostname], ["IP Address", d.ip], ["Management IP", d.mgmtIp], ["MAC Address", d.mac],
            ["Vendor / Model", `${d.vendor} ${d.model}`], ["Serial / Service Tag", d.serial], ["OS", `${d.osType} ${d.osVersion}`.trim()],
            ["CPU", cpu ? `${cpu.sockets} x ${cpu.model} (${cpu.sockets * cpu.coresPerSocket} cores)` : null],
            ["Memory", memTotal ? `${memTotal} GB` : null], ["Disk", storage ? `${storage.physicalDisks.length} x ${storage.physicalDisks[0]?.model} (${storage.virtualDisks[0]?.raid})` : null],
            ["Site / Location", `${d.siteName}${d.location ? ` - ${d.location}` : ""}`], ["Role", d.role], ["Contact", d.contact], ["Description", d.description],
          ]} />
        </Card>
        <div className="stack">
          <Card title="CPU & Memory" right={sel}>
            <LineChart height={150} xTicks={timeTicks(range, 6)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct}
              series={[{ label: "CPU", color: "#2563eb", data: m.cpu }, { label: "Memory", color: "#16a34a", data: m.mem }]} />
            <Legend items={[{ label: "CPU", color: "#2563eb", value: on && d.cpuPct != null ? `${d.cpuPct}%` : "—" }, { label: "Memory", color: "#16a34a", value: on && d.memPct != null ? `${d.memPct}%` : "—" }]} />
          </Card>
          <Card title="Recent Events" bodyPad={false}>
            {d.events.length ? <table className="list compact"><thead><tr><th>Time</th><th>Severity</th><th>Source</th><th>Message</th></tr></thead>
              <tbody>{d.events.slice(0, 5).map((e) => <tr key={e.id}><td className="nowrap">{formatShort(e.ts)}</td><td><LevelBadge level={e.severity} /></td><td>{e.source}</td><td>{e.message}</td></tr>)}</tbody></table>
              : <div className="empty-row">No events.</div>}
          </Card>
        </div>
      </div>
    </>
  );
}

export function ServerTabBody({ tab, d, busy, onAction }: { tab: ServerTab; d: DeviceDetail; busy: boolean; onAction: (a: ServerAction) => void }) {
  const [range, setRange] = React.useState<Range>("6h");
  const m = useDeviceMetrics(d, range)!;
  const { cpu, dimms, storage, nics, processes, services, logs, alerts, config } = d.details;
  const rangeSel = <RangeSelect value={range} onChange={setRange} />;

  switch (tab) {
    case "overview": return <ServerOverview d={d} />;
    case "hardware": return <HardwareTab d={d} busy={busy} onAction={onAction} />;
    case "cpu": return (
      <div className="grid-2">
        <Card title="Processor">{cpu ? <InfoTable rows={[["Model", cpu.model], ["Sockets", cpu.sockets], ["Cores / socket", cpu.coresPerSocket], ["Threads", cpu.threads], ["Base clock", `${cpu.baseGhz} GHz`]]} /> : <NoData what="CPU inventory" />}</Card>
        <Card title="CPU Utilization" right={rangeSel}><LineChart xTicks={timeTicks(range)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "CPU", color: "#2563eb", data: m.cpu, fill: true }]} /></Card>
      </div>
    );
    case "memory": return (
      <div className="grid-2">
        <Card title={`DIMMs (${dimms?.length ?? 0})`} bodyPad={false}>{dimms?.length ? (
          <table className="list compact"><thead><tr><th>Slot</th><th>Size</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>{dimms.map((x) => <tr key={x.slot}><td>{x.slot}</td><td>{x.sizeGb} GB</td><td>{x.type}</td><td><OkMark status={x.status} /></td></tr>)}</tbody></table>
        ) : <NoData what="DIMM inventory" />}</Card>
        <Card title="Memory Utilization" right={rangeSel}><LineChart xTicks={timeTicks(range)} yMax={100} yTicks={[0, 25, 50, 75, 100]} formatY={pct} series={[{ label: "Memory", color: "#16a34a", data: m.mem, fill: true }]} /></Card>
      </div>
    );
    case "disks": return storage ? (
      <div className="stack">
        <div className="grid-2">
          <Card title={`Virtual Disks — ${storage.controller}`} bodyPad={false}>
            <table className="list compact"><thead><tr><th>Name</th><th>RAID</th><th>Size</th><th>Status</th></tr></thead>
              <tbody>{storage.virtualDisks.map((v) => <tr key={v.name}><td>{v.name}</td><td>{v.raid}</td><td>{v.sizeTb} TB</td><td><OkMark status={v.status} /></td></tr>)}</tbody></table>
          </Card>
          <Card title="Physical Disks" bodyPad={false}>
            <table className="list compact"><thead><tr><th>Slot</th><th>Model</th><th>Wear</th><th>Status</th></tr></thead>
              <tbody>{storage.physicalDisks.map((p) => <tr key={p.slot}><td>{p.slot}</td><td>{p.model}</td><td>{p.wearPct}%</td><td><OkMark status={p.status} /></td></tr>)}</tbody></table>
          </Card>
        </div>
        <Card title="Filesystems" bodyPad={false}>
          <table className="list"><thead><tr><th>Mount</th><th>FS</th><th>Size</th><th style={{ width: 220 }}>Used</th></tr></thead>
            <tbody>{storage.filesystems.map((f) => { const p = Math.round((f.usedGb / f.sizeGb) * 100); return (
              <tr key={f.mount}><td className="mono">{f.mount}</td><td>{f.fs}</td><td>{f.sizeGb} GB</td><td><Meter pct={p} /><span className="cell-sub">{f.usedGb} GB ({p}%)</span></td></tr>); })}</tbody></table>
        </Card>
      </div>
    ) : <Card title="Disks"><NoData what="storage inventory" /></Card>;
    case "network": {
      const sc = niceScale([...m.netIn, ...m.netOut]);
      return (
        <div className="stack">
          <Card title={`Network Interfaces (${nics?.length ?? 0})`} bodyPad={false}>{nics?.length ? (
            <table className="list"><thead><tr><th>Interface</th><th>IP</th><th>MAC</th><th>Speed</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
              <tbody>{nics.map((n) => <tr key={n.name}><td className="mono cell-strong">{n.name}</td><td className="mono">{n.ip || "—"}</td><td className="mono">{n.mac}</td><td>{n.speedGbps} Gbps</td>
                <td><span className={`pill ${n.status === "up" ? "ok" : "crit"}`}>{n.status}</span></td><td>{n.inMbps} Mb/s</td><td>{n.outMbps} Mb/s</td></tr>)}</tbody></table>
          ) : <NoData what="network interfaces" />}</Card>
          <Card title="Throughput" right={rangeSel}><LineChart xTicks={timeTicks(range)} yMax={sc.max} yTicks={sc.ticks} formatY={(v) => `${v} Mb/s`}
            series={[{ label: "Inbound", color: "#2563eb", data: m.netIn }, { label: "Outbound", color: "#f97316", data: m.netOut }]} /></Card>
        </div>
      );
    }
    case "processes": return <Card title={`Processes (${processes?.length ?? 0})`} bodyPad={false}>{processes?.length ? (
      <table className="list"><thead><tr><th>PID</th><th>Name</th><th>User</th><th style={{ width: 160 }}>CPU</th><th>Memory</th><th>Threads</th></tr></thead>
        <tbody>{[...processes].sort((a, b) => b.cpu - a.cpu).map((p) => <tr key={p.pid}><td className="mono">{p.pid}</td><td className="mono cell-strong">{p.name}</td><td>{p.user}</td>
          <td><Meter pct={p.cpu} /><span className="cell-sub">{p.cpu}%</span></td><td>{p.memMb >= 1024 ? `${(p.memMb / 1024).toFixed(1)} GB` : `${p.memMb} MB`}</td><td>{p.threads}</td></tr>)}</tbody></table>
    ) : <NoData what="process list" />}</Card>;
    case "services": return <Card title={`Services (${services?.length ?? 0})`} bodyPad={false}>{services?.length ? (
      <table className="list"><thead><tr><th>Service</th><th>Port</th><th>Status</th><th>Description</th></tr></thead>
        <tbody>{services.map((s) => <tr key={s.name}><td className="mono cell-strong">{s.name}</td><td>{s.port}</td><td><span className={`pill ${s.status === "running" ? "ok" : "muted"}`}>{s.status}</span></td><td>{s.description}</td></tr>)}</tbody></table>
    ) : <NoData what="services" />}</Card>;
    case "eventlogs": return <Card title={`Event Log (${d.events.length})`} bodyPad={false}>{d.events.length ? (
      <table className="list"><thead><tr><th>Time</th><th>Severity</th><th>Source</th><th>Message</th></tr></thead>
        <tbody>{d.events.map((e) => <tr key={e.id}><td className="nowrap">{formatShort(e.ts)}</td><td><LevelBadge level={e.severity} /></td><td>{e.source}</td><td>{e.message}</td></tr>)}</tbody></table>
    ) : <div className="empty-row">No events.</div>}</Card>;
    case "logs": return <Card title="System Logs" bodyPad={false}>{logs?.length ? (
      <div className="log-view">{logs.map((l, i) => <div key={i} className={`log-line ${l.level.toLowerCase()}`}><span className="ts">{l.ts}</span><span className="lv">{l.level}</span><span className="src">{l.source}</span><span>{l.message}</span></div>)}</div>
    ) : <NoData what="logs" />}</Card>;
    case "alerts": return <Card title={`Alerts (${alerts?.length ?? 0})`} bodyPad={false}>{alerts?.length ? (
      <table className="list"><thead><tr><th>Severity</th><th>Alert</th><th>Source</th><th>Since</th></tr></thead>
        <tbody>{alerts.map((a, i) => <tr key={i}><td><LevelBadge level={a.severity} /></td><td className="cell-strong">{a.title ?? a.message}</td><td>{a.source}</td><td>{a.since ?? a.ts}</td></tr>)}</tbody></table>
    ) : <div className="empty-row"><i className="fa-solid fa-circle-check ok-text" /> No open alerts.</div>}</Card>;
    case "topology": {
      const nodes = [
        { icon: "fa-building", label: d.siteName, sub: "Site" }, { icon: "fa-table-cells", label: d.location || "—", sub: "Rack" },
        { icon: "fa-network-wired", label: "NCE-SW-01", sub: "Access switch" }, { icon: "fa-server", label: d.hostname, sub: d.ip, self: true },
        ...(d.details.bmc ? [{ icon: "fa-microchip", label: d.details.bmc.kind, sub: d.details.bmc.ip }] : []),
      ];
      return (
        <Card title="Topology"><div className="topo">{nodes.map((n, i) => (
          <React.Fragment key={n.label + i}>{i > 0 && <div className="topo-link"><i className="fa-solid fa-arrow-right" /></div>}
            <div className={`topo-node${"self" in n && n.self ? " self" : ""}`}><i className={`fa-solid ${n.icon}`} /><b>{n.label}</b><span>{n.sub}</span></div></React.Fragment>
        ))}</div></Card>
      );
    }
    case "configuration": return (
      <div className="grid-2">
        <Card title="Platform Settings">{config ? <InfoTable rows={Object.entries(config)} /> : <NoData what="configuration" />}</Card>
        <Card title="Asset"><InfoTable rows={[["Vendor", d.vendor], ["Model", d.model], ["Serial", d.serial], ["Environment", d.environment], ["Onboarded", formatShort(d.onboardedAt)], ["Contact", d.contact]]} /></Card>
      </div>
    );
  }
}
