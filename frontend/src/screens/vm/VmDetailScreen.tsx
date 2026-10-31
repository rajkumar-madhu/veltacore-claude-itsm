import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useVm, useVmAction, type VmDetail } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Tabs } from "@/components/ui";
import { VM_STATE_PILL } from "@/lib/status";
import { useToast } from "@/lib/useToast";
import { formatUptime } from "@/lib/series";
import { VmActionModal, type ModalKind } from "./VmActionModal";
import { VmOverview, type ActionId } from "./VmOverview";
import {
  AlertsTab, ConfigurationTab, EventsTab, GuestOsTab, LogsTab, NetworkTab, PerformanceTab,
  ProcessesTab, ServicesTab, SnapshotsTab, StorageTab, TopologyTab,
} from "./VmTabs";

type TabId = "overview" | "performance" | "storage" | "network" | "snapshots" | "guest" | "processes"
  | "services" | "logs" | "alerts" | "topology" | "configuration" | "events";

function downloadLogs(vm: VmDetail) {
  const lines = [
    `# ${vm.name} (${vm.ip}) — exported ${new Date().toISOString()}`, "", "## Events",
    ...vm.events.map((e) => `${e.ts}\t${e.level.toUpperCase()}\t${e.message}`), "", "## Guest log",
    ...vm.details.logs.map((l) => `${l.ts}\t${l.level}\t${l.source}\t${l.message}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${vm.name}-logs.txt` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function VmDetailScreen() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabId) || "overview";
  const setTab = (t: TabId) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const { data: vm, isLoading, isError, error, refetch } = useVm(id);
  const mutation = useVmAction(id);
  const [modal, setModal] = React.useState<ModalKind | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [toast, setToast] = useToast();

  if (isLoading) return <div className="page"><div className="loading">Loading VM…</div></div>;
  if (isError || !vm) {
    const notFound = String(error?.message ?? "").includes("404");
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines", to: "/vms" }, { label: id }]} />
        {notFound ? <div className="empty-state"><i className="fa-solid fa-cube" /><div className="t">VM “{id}” not found</div></div>
          : <ApiDown what="this VM" retry={() => refetch()} />}
      </div>
    );
  }

  const run = (body: { action: string } & Record<string, unknown>) =>
    mutation.mutate(body, {
      onSuccess: (msg) => { setModal(null); setToast({ kind: "ok", text: msg }); },
      onError: (e) => setToast({ kind: "err", text: e.message }),
    });

  const consoleUrl = `https://${vm.vcenter}/ui/webconsole.html?vmName=${encodeURIComponent(vm.name)}`;

  function onAction(a: ActionId) {
    switch (a) {
      case "power_on": return run({ action: "power_on" });
      case "power_off": return setModal({ kind: "confirm", action: "power_off", title: "Power Off", text: `Hard power-off ${vm!.name}? Running applications will stop without a clean shutdown.` });
      case "reset": return setModal({ kind: "confirm", action: "reset", title: "Reset", text: `Hard reset ${vm!.name}? This is equivalent to pressing the reset button.` });
      case "restart": return setModal({ kind: "confirm", action: "restart", title: "Restart Guest", text: `Restart the guest OS of ${vm!.name} via VMware Tools?` });
      case "suspend": return setModal({ kind: "confirm", action: "suspend", title: "Suspend", text: `Suspend ${vm!.name}? Its memory state is saved to disk.` });
      case "migrate": case "move": return setModal({ kind: "migrate" });
      case "snapshot": return setModal({ kind: "snapshot" });
      case "clone": return setModal({ kind: "clone" });
      case "settings": return setModal({ kind: "settings" });
      case "console": return void window.open(consoleUrl, "_blank", "noopener");
      case "logs": downloadLogs(vm!); return setToast({ kind: "ok", text: "Log bundle downloaded" });
    }
  }

  const pill = VM_STATE_PILL[vm.state];
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" }, { id: "performance", label: "Performance" },
    { id: "storage", label: "Storage & Disks" }, { id: "network", label: "Network" },
    { id: "snapshots", label: "Snapshots" }, { id: "guest", label: "Guest OS" },
    { id: "processes", label: "Processes" }, { id: "services", label: "Services" },
    { id: "logs", label: "Logs" }, { id: "alerts", label: "Alerts", badge: vm.details.alerts.length },
    { id: "topology", label: "Topology" }, { id: "configuration", label: "Configuration" },
    { id: "events", label: "Events" },
  ];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines", to: "/vms" }, { label: "VM Details" }]} />

      <div className="detail-head">
        <div className="detail-icon"><i className="fa-solid fa-cube" /></div>
        <div className="detail-meta">
          <div className="detail-title">
            <h1>{vm.name}</h1>
            <span className={`pill ${pill.cls}`}><i className={`fa-solid ${pill.icon}`} /> {pill.label}</span>
          </div>
          <div className="detail-sub">
            <span>{vm.hypervisor}</span><span>{vm.ip}</span><span>Site: {vm.siteName}</span>
            <span>Uptime: {formatUptime(vm.uptimeSeconds)}</span>
          </div>
          <div className="detail-sub">
            <span>Cluster: {vm.cluster}</span><span>Host: {vm.host}</span><span>Datastore: {vm.datastore.name}</span>
            <span>OS: {vm.os}</span><span>Environment: {vm.environment}</span>
          </div>
        </div>
        <div className="detail-right">
          <div className="detail-actions">
            <button className="btn" onClick={() => setModal({ kind: "settings" })}><i className="fa-solid fa-pen" /> Edit VM</button>
            <a className="btn" href={`https://${vm.vcenter}/ui/`} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-arrow-up-right-from-square" /> Open in vCenter</a>
            <button className="btn" onClick={() => setModal({ kind: "command" })} disabled={vm.state !== "running"}><i className="fa-solid fa-terminal" /> Run Command</button>
            <div className="menu-wrap">
              <button className="btn" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}><i className="fa-solid fa-ellipsis" /> More <i className="fa-solid fa-chevron-down" /></button>
              {moreOpen && (
                <div className="menu" onMouseLeave={() => setMoreOpen(false)}>
                  {([["snapshot", "fa-camera", "Take Snapshot"], ["clone", "fa-clone", "Clone VM"], ["migrate", "fa-right-left", "Migrate"], ["logs", "fa-download", "Download Logs"]] as const).map(([a, icon, label]) => (
                    <button key={a} onClick={() => { setMoreOpen(false); onAction(a); }}><i className={`fa-solid ${icon}`} /> {label}</button>
                  ))}
                  <button onClick={() => { setMoreOpen(false); refetch(); }}><i className="fa-solid fa-rotate" /> Refresh</button>
                </div>
              )}
            </div>
          </div>
          <div className="tags">
            <span className="tag"><i className="fa-solid fa-cube" /> {vm.platform}</span>
            <span className="tag warn"><i className={`fa-brands ${vm.osFamily === "Windows" ? "fa-windows" : "fa-linux"}`} /> {vm.osFamily}</span>
            <span className="tag ok"><i className="fa-solid fa-shield" /> {vm.environment}</span>
            {vm.role && <span className="tag info"><i className="fa-solid fa-globe" /> {vm.role}</span>}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="tab-panel">
        {tab === "overview" && <VmOverview vm={vm} onAction={onAction} busy={mutation.isPending} />}
        {tab === "performance" && <PerformanceTab vm={vm} />}
        {tab === "storage" && <StorageTab vm={vm} />}
        {tab === "network" && <NetworkTab vm={vm} />}
        {tab === "snapshots" && <SnapshotsTab vm={vm} onTake={() => setModal({ kind: "snapshot" })} />}
        {tab === "guest" && <GuestOsTab vm={vm} />}
        {tab === "processes" && <ProcessesTab vm={vm} />}
        {tab === "services" && <ServicesTab vm={vm} />}
        {tab === "logs" && <LogsTab vm={vm} />}
        {tab === "alerts" && <AlertsTab vm={vm} />}
        {tab === "topology" && <TopologyTab vm={vm} />}
        {tab === "configuration" && <ConfigurationTab vm={vm} />}
        {tab === "events" && <EventsTab vm={vm} />}
      </div>

      {modal && <VmActionModal key={JSON.stringify(modal)} vm={vm} modal={modal} busy={mutation.isPending} onClose={() => setModal(null)} onSubmit={run} />}
      {toast}
    </div>
  );
}
