import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useVms, type VmState } from "@/api/hooks";
import { ApiDown, Breadcrumbs, Meter } from "@/components/ui";
import { VM_STATE_PILL } from "@/lib/status";
import { formatUptime } from "@/lib/series";

export default function VmListScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useVms();
  const [params] = useSearchParams();
  const platform = params.get("platform") ?? "";
  const PLATFORM_TITLE: Record<string, string> = { VMware: "VMware vCenter", "Hyper-V": "Hyper-V", Proxmox: "Proxmox" };
  const [q, setQ] = React.useState("");
  const [state, setState] = React.useState<"" | VmState>("");

  const scoped = (data ?? []).filter((v) => !platform || v.platform === platform);
  const vms = scoped.filter((v) =>
    (!state || v.state === state) &&
    (!q || `${v.name} ${v.ip} ${v.host} ${v.os} ${v.role}`.toLowerCase().includes(q.toLowerCase()))
  );
  const all = scoped;
  const running = all.filter((v) => v.state === "running").length;
  const vcpu = all.reduce((a, v) => a + v.vcpu, 0);
  const mem = all.reduce((a, v) => a + v.memoryGb, 0);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines", to: "/vms/overview" }, ...(platform ? [{ label: PLATFORM_TITLE[platform] ?? platform }] : [{ label: "VM List" }])]} />
      <h1 className="page-title">{platform ? PLATFORM_TITLE[platform] ?? platform : "Virtual Machines"}</h1>
      <div className="page-sub">{platform ? `${platform} inventory` : "All platforms"} · {all.length} VMs across {new Set(all.map((v) => v.cluster)).size} clusters</div>

      <div className="kpi-strip">
        <div className="kpi"><div className="l">Total VMs</div><div className="v">{all.length}</div><div className="s">inventoried</div></div>
        <div className="kpi tone-ok"><div className="l">Running</div><div className="v">{running}</div><div className="s">powered on</div></div>
        <div className={`kpi ${all.length - running ? "tone-warn" : ""}`}><div className="l">Off / Suspended</div><div className="v">{all.length - running}</div><div className="s">not serving</div></div>
        <div className="kpi"><div className="l">Allocated</div><div className="v">{vcpu} vCPU</div><div className="s">{mem} GB memory</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-box"><i className="fa-solid fa-magnifying-glass" />
            <input placeholder="Search name, IP, host, OS, role…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select-sm" value={state} onChange={(e) => setState(e.target.value as "" | VmState)}>
            <option value="">All states</option>
            <option value="running">Running</option>
            <option value="stopped">Powered Off</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {isError ? <ApiDown what="virtual machines" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading VMs…</div> : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Name</th><th>State</th><th>IP</th><th>Host / Cluster</th><th>OS</th><th>Size</th><th style={{ width: 120 }}>CPU</th><th style={{ width: 120 }}>Memory</th><th>Uptime</th></tr></thead>
              <tbody>
                {vms.map((v) => {
                  const p = VM_STATE_PILL[v.state];
                  const on = v.state === "running";
                  return (
                    <tr key={v.id} className="row-clickable" onClick={() => navigate(`/vms/${v.id}`)}>
                      <td><div className="cell-strong link">{v.name}</div><div className="cell-sub">{v.role} · {v.siteName}</div></td>
                      <td><span className={`pill ${p.cls}`}><i className={`fa-solid ${p.icon}`} /> {p.label}</span></td>
                      <td className="mono">{v.ip}</td>
                      <td><div>{v.host}</div><div className="cell-sub">{v.cluster}</div></td>
                      <td><i className={`fa-brands ${v.osFamily === "Windows" ? "fa-windows" : "fa-linux"}`} /> {v.os}</td>
                      <td>{v.vcpu} vCPU · {v.memoryGb} GB</td>
                      <td>{on ? <><Meter pct={v.cpuPct} /><span className="cell-sub">{v.cpuPct}%</span></> : "—"}</td>
                      <td>{on ? <><Meter pct={v.memPct} /><span className="cell-sub">{v.memPct}%</span></> : "—"}</td>
                      <td>{formatUptime(v.uptimeSeconds)}</td>
                    </tr>
                  );
                })}
                {!vms.length && <tr><td colSpan={9} className="empty-row">{platform && !all.length ? `No ${PLATFORM_TITLE[platform] ?? platform} VMs are inventoried yet. They appear here once that platform is connected under Administration → Integrations.` : "No VMs match these filters."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
