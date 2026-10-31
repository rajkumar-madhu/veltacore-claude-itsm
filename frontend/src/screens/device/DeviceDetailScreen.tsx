import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDevice, useDeviceAction, type DeviceDetail, type SwitchPort } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Tabs } from "@/components/ui";
import { formatUptime } from "@/lib/series";
import { useToast } from "@/lib/useToast";
import { ConfirmModal, EditDeviceModal, VendorMark } from "./deviceCommon";
import { STATUS_PILL, TYPE_ICON, TYPE_LABEL, TYPE_PLURAL, downloadText, isNetworkGear } from "./deviceMeta";
import { ServerTabBody, type ServerAction, type ServerTab } from "./ServerView";
import { SwitchTabBody, type SwitchTab } from "./SwitchView";

type Pending = { kind: "edit" } | { kind: "confirm"; action: string; title: string; text: string; danger?: boolean };

function hardwareReport(d: DeviceDetail) {
  const x = d.details;
  return [
    `Hardware report — ${d.hostname} (${d.vendor} ${d.model}, S/N ${d.serial})`, `Generated ${new Date().toISOString()}`, "",
    "Temperatures:", ...(x.temps ?? []).map((t) => `  ${t.sensor}: ${t.current} °C (warn ${t.warn})`),
    "Fans:", ...(x.fans ?? []).map((f) => `  ${f.name}: ${f.rpm} RPM`),
    "Power supplies:", ...(x.psus ?? []).map((p) => `  ${p.name} ${p.model}: ${p.status} ${p.outputW}W/${p.capacityW}W`),
    "Voltages:", ...(x.voltages ?? []).map((v) => `  ${v.sensor}: ${v.current} V (${v.min}-${v.max})`),
    "Hardware events:", ...(x.hwEvents ?? []).map((e) => `  ${e.ts} ${e.severity.toUpperCase()} ${e.sensor}: ${e.message}`),
  ].join("\n");
}

export default function DeviceDetailScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: d, isLoading, isError, error, refetch } = useDevice(id);
  const mutation = useDeviceAction(id);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [menu, setMenu] = React.useState(false);
  const [toast, setToast] = useToast();

  if (isLoading) return <div className="page"><div className="loading">Loading device…</div></div>;
  if (isError || !d) {
    const notFound = String(error?.message ?? "").includes("404");
    return <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Network Devices", to: "/devices" }, { label: id }]} />
      {notFound ? <div className="empty-state"><i className="fa-solid fa-server" /><div className="t">Device “{id}” not found</div></div> : <ApiDown what="this device" retry={() => refetch()} />}
    </div>;
  }

  const net = isNetworkGear(d.deviceType);
  const tab = params.get("tab") || "overview";
  const setTab = (t: string) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const run = (body: { action: string } & Record<string, unknown>) => mutation.mutate(body, {
    onSuccess: (msg) => { setPending(null); setToast({ kind: "ok", text: msg }); },
    onError: (e) => setToast({ kind: "err", text: e.message }),
  });

  const onPortToggle = (p: SwitchPort, enable: boolean) => enable
    ? run({ action: "set_port", port: p.name, enabled: true })
    : setPending({ kind: "confirm", action: `port:${p.name}`, title: `Shut down ${p.name}`, text: `Administratively disable ${p.name} (${p.description || "no description"})? Anything connected loses link.`, danger: true });

  const bmc = d.details.bmc;
  function onServerAction(a: ServerAction) {
    switch (a) {
      case "power_on": return run({ action: "power_on" });
      case "graceful_shutdown": return setPending({ kind: "confirm", action: a, title: "Graceful Shutdown", text: `Send an ACPI shutdown to ${d!.hostname}? The OS will shut down cleanly.` });
      case "force_off": return setPending({ kind: "confirm", action: a, title: "Force Power Off", text: `Immediately cut power to ${d!.hostname}? Unsaved data will be lost.`, danger: true });
      case "console": case "firmware": return void window.open(`https://${bmc?.ip}/`, "_blank", "noopener");
      case "inventory": return setTab("configuration");
      case "alerts": return navigate("/monitors");
      case "report": downloadText(`${d!.hostname}-hardware.txt`, hardwareReport(d!)); return setToast({ kind: "ok", text: "Hardware report downloaded" });
    }
  }

  function confirmPending() {
    if (pending?.kind !== "confirm") return;
    if (pending.action.startsWith("port:")) run({ action: "set_port", port: pending.action.slice(5), enabled: false });
    else run({ action: pending.action });
  }

  const pill = STATUS_PILL[d.status];
  const switchTabs: { id: SwitchTab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" }, { id: "ports", label: `Ports (${d.details.ports?.length ?? 0})` }, { id: "interfaces", label: "Interfaces" },
    { id: "performance", label: "Performance" }, { id: "vlans", label: "VLANs" }, { id: "stp", label: "STP" }, { id: "logs", label: "Logs" },
    { id: "config", label: "Config" }, { id: "hardware", label: "Hardware" }, { id: "neighbors", label: "Neighbors" },
    { id: "alerts", label: "Alerts", badge: d.details.alerts?.length }, { id: "topology", label: "Topology" }, { id: "inventory", label: "Inventory" },
  ];
  const serverTabs: { id: ServerTab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" }, { id: "cpu", label: "CPU" }, { id: "memory", label: "Memory" }, { id: "disks", label: "Disks" },
    { id: "network", label: "Network" }, { id: "processes", label: "Processes" }, { id: "services", label: "Services" },
    { id: "eventlogs", label: "Event Logs" }, { id: "hardware", label: `Hardware (${bmc ? bmc.kind : "iDRAC/iLO"})` }, { id: "logs", label: "Logs" },
    { id: "alerts", label: "Alerts", badge: d.details.alerts?.length }, { id: "topology", label: "Topology" }, { id: "configuration", label: "Configuration" },
  ];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Network Devices", to: "/devices" },
        { label: TYPE_PLURAL[d.deviceType], to: `/devices?type=${d.deviceType}` }, { label: d.hostname }]} />

      <div className="detail-head">
        <div className="detail-icon vendor-box">{d.vendor ? <VendorMark vendor={d.vendor} size={16} /> : <i className={`fa-solid ${TYPE_ICON[d.deviceType]}`} />}</div>
        <div className="detail-meta">
          <div className="detail-title"><h1>{d.hostname}</h1><span className={`pill ${pill.cls}`}><i className={`fa-solid ${pill.icon}`} /> {pill.label}</span></div>
          <div className="detail-sub"><span>{d.vendor} {d.model}</span><span>{d.ip}</span><span>Site: {d.siteName}</span><span>Uptime: {formatUptime(d.uptimeSeconds)}</span></div>
          <div className="detail-sub">
            <span>{net ? "SN" : "Service Tag"}: {d.serial || "—"}</span>
            {net ? <span>{d.osType}: {d.osVersion}</span> : bmc ? <span>{bmc.kind} IP: {bmc.ip}</span> : <span>Mgmt IP: {d.mgmtIp ?? "—"}</span>}
            {!net && <span>OS: {d.osVersion || "—"}</span>}
            {d.location && <span><i className="fa-solid fa-location-dot" /> {d.location}</span>}
            <span>Environment: {d.environment}</span>
          </div>
        </div>
        <div className="detail-right">
          <div className="detail-actions">
            <button className="btn" onClick={() => setPending({ kind: "edit" })}><i className="fa-solid fa-pen" /> Edit Device</button>
            <button className="btn" disabled={mutation.isPending} onClick={() => run({ action: "run_discovery" })}>
              <i className={`fa-solid fa-rotate${mutation.isPending ? " fa-spin" : ""}`} /> Run Discovery</button>
            <button className="btn" onClick={() => setTab("topology")}><i className="fa-solid fa-diagram-project" /> Open in Topology</button>
            <div className="menu-wrap">
              <button className="btn" aria-label="More" onClick={() => setMenu((o) => !o)}><i className="fa-solid fa-ellipsis" /></button>
              {menu && <div className="menu" onMouseLeave={() => setMenu(false)}>
                {net && d.details.runningConfig && <button onClick={() => { setMenu(false); downloadText(`${d.hostname}-running-config.txt`, d.details.runningConfig!); }}><i className="fa-solid fa-download" /> Download config</button>}
                {!net && bmc && <button onClick={() => { setMenu(false); onServerAction("report"); }}><i className="fa-solid fa-download" /> Hardware report</button>}
                <button onClick={() => { setMenu(false); refetch(); }}><i className="fa-solid fa-rotate" /> Refresh</button>
              </div>}
            </div>
          </div>
          <div className="tags">
            <span className="tag"><i className={`fa-solid ${TYPE_ICON[d.deviceType]}`} /> {TYPE_LABEL[d.deviceType]}</span>
            {d.vendor && <span className="tag info">{d.vendor}{!net && d.model ? ` ${d.model.split(" ")[0]}` : ""}</span>}
            {net && <span className="tag ok"><i className="fa-solid fa-signal" /> SNMP</span>}
            {bmc && <span className="tag info"><i className="fa-solid fa-microchip" /> {bmc.kind}</span>}
            {!net && d.osType && <span className="tag warn"><i className="fa-brands fa-linux" /> {d.osType}</span>}
            <span className="tag ok"><i className="fa-solid fa-shield" /> {d.environment}</span>
          </div>
        </div>
      </div>

      {net
        ? <Tabs tabs={switchTabs} active={tab as SwitchTab} onChange={setTab} />
        : <Tabs tabs={serverTabs} active={tab as ServerTab} onChange={setTab} />}

      <div className="tab-panel">
        {net
          ? <SwitchTabBody key={tab} tab={tab as SwitchTab} d={d} busy={mutation.isPending} onPortToggle={onPortToggle} />
          : <ServerTabBody key={tab} tab={tab as ServerTab} d={d} busy={mutation.isPending} onAction={onServerAction} />}
      </div>

      {pending?.kind === "edit" && <EditDeviceModal d={d} busy={mutation.isPending} onClose={() => setPending(null)} onSubmit={run} />}
      {pending?.kind === "confirm" && <ConfirmModal title={pending.title} text={pending.text} danger={pending.danger} busy={mutation.isPending} onClose={() => setPending(null)} onConfirm={confirmPending} />}
      {toast}
    </div>
  );
}
