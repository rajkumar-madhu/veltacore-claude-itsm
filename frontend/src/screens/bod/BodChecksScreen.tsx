import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { pairs } from "@/lib/itsmFmt";
import { RESULT_LABEL } from "./bodMeta";

interface Check extends Row {
  id: number; name: string; phase: string; category: string; kind: string; params: Record<string, unknown>;
  critical: boolean; enabled: boolean; sortOrder: number;
}

const KINDS = pairs([["domain_health", "Domain health"], ["device_online", "Devices online"], ["vm_running", "VMs running"], ["uptime", "Uptime checks"],
  ["exporters", "Exporters active"], ["slo", "SLO compliance"], ["no_critical_alerts", "No critical alerts"], ["open_p1", "No open P1 incidents"]]);
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));
const PHASES = pairs([["BOD", "Beginning of day"], ["EOD", "End of day"], ["BOTH", "Both"]]);

const PARAM_HELP = 'Parameters per type — domain_health: {"domains": ["trading"], "accept": ["ok","warn"]} · device_online: {"types": ["switch"]} or {"devices": ["nse-sw-01"]} · '
  + 'vm_running: {"vms": ["vm-app-01"]} · uptime: {"tag": "exchange"} · exporters: {"minPct": 80} · slo: {"slos": [1,2]} or {} for all';

function paramSummary(r: Check) {
  const p = r.params ?? {};
  const parts = Object.entries(p).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  return parts.join(" · ") || "—";
}

export default function BodChecksScreen() {
  const cfg: ResourceConfig<Check> = {
    title: "Key Validations", subtitle: "The checks that make up each BOD and EOD run", icon: "fa-list-check",
    crumbs: [{ label: "Home", to: "/" }, { label: "BOD / EOD" }, { label: "Key Validation" }],
    path: "/bod-checks/", createLabel: "Check", canDelete: true,
    defaults: { phase: "BOTH", critical: true, enabled: true, sortOrder: 100, params: {} },
    search: (r) => `${r.name} ${r.category} ${r.kind}`,
    kpis: (rows) => [
      { label: "Checks", value: rows.length, sub: `${rows.filter((r) => r.enabled).length} enabled` },
      { label: "Critical", value: rows.filter((r) => r.critical).length },
      { label: "BOD", value: rows.filter((r) => r.phase !== "EOD").length },
      { label: "EOD", value: rows.filter((r) => r.phase !== "BOD").length },
    ],
    filters: [{ key: "phase", label: "Phase", options: PHASES }, { key: "category", label: "Category" }, { key: "kind", label: "Type", options: KINDS }],
    columns: [
      { key: "sortOrder", label: "#", render: (r) => <span className="cell-sub">{r.sortOrder}</span> },
      { key: "name", label: "Check", render: (r) => <><b>{r.name}</b><div className="cell-sub">{KIND_LABEL[r.kind] ?? r.kind}</div></> },
      { key: "category", label: "Category" },
      { key: "phase", label: "Phase", render: (r) => <span className="pill info">{r.phase}</span> },
      { key: "params", label: "Parameters", render: (r) => <span className="cell-sub mono" style={{ fontSize: 11.5 }}>{paramSummary(r)}</span> },
      { key: "critical", label: "Severity", render: (r) => <span className={`pill ${r.critical ? "crit" : "warn"}`}>{r.critical ? "Blocks run" : "Warn only"}</span> },
      { key: "enabled", label: "State", render: (r) => <span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span> },
    ],
    rowActions: [{
      label: "Evaluate now", icon: "fa-play",
      run: (r, ctx) => ctx.post(`/bod-checks/${r.id}/evaluate/`).then((x) => {
        const res = x as { status: string; detail: string };
        ctx.toast(res.status === "pass" ? "ok" : "err", `${r.name}: ${RESULT_LABEL[res.status]} — ${res.detail}`);
      }).catch((e: Error) => ctx.toast("err", e.message)),
    }],
    fields: [
      { key: "name", label: "Name", required: true, wide: true },
      { key: "kind", label: "Type", type: "select", options: KINDS, required: true },
      { key: "phase", label: "Phase", type: "select", options: PHASES, required: true },
      { key: "category", label: "Category", required: true, placeholder: "Trading" },
      { key: "sortOrder", label: "Order", type: "number", min: 0 },
      { key: "critical", label: "Critical (failure blocks the run)", type: "checkbox" }, { key: "enabled", label: "Enabled", type: "checkbox" },
      { key: "params", label: "Parameters (JSON)", type: "json", help: PARAM_HELP },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
