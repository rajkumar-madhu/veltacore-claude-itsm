import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { opts } from "@/lib/itsmFmt";

interface Template extends Row {
  id: number; name: string; appliesTo: string; description: string; intervalSec: number; enabled: boolean;
  checks: { name: string; metric: string; warn: number; crit: number; unit: string }[];
}

const APPLIES = ["switch", "router", "firewall", "load_balancer", "wireless", "server", "vm", "linux", "windows", "database", "kubernetes", "http"];

export default function TemplatesScreen() {
  const cfg: ResourceConfig<Template> = {
    title: "Monitoring Templates", subtitle: "Reusable check sets with warning and critical thresholds per device type", icon: "fa-clipboard-list",
    crumbs: [{ label: "Home", to: "/" }, { label: "Monitoring" }, { label: "Templates" }],
    path: "/templates/", createLabel: "Template", canDelete: true,
    defaults: { enabled: true, intervalSec: 60, checks: [{ name: "CPU", metric: "cpu_usage_pct", warn: 80, crit: 95, unit: "%" }] },
    search: (r) => `${r.name} ${r.appliesTo} ${r.description} ${r.checks.map((c) => `${c.name} ${c.metric}`).join(" ")}`,
    kpis: (rows) => [
      { label: "Templates", value: rows.length, sub: `${rows.filter((r) => r.enabled).length} enabled` },
      { label: "Checks defined", value: rows.reduce((s, r) => s + r.checks.length, 0) },
      { label: "Device types covered", value: new Set(rows.map((r) => r.appliesTo)).size },
    ],
    filters: [{ key: "appliesTo", label: "Applies to" }, { key: "enabled", label: "State", options: [{ value: "true", label: "Enabled" }, { value: "false", label: "Disabled" }] }],
    columns: [
      { key: "name", label: "Template", render: (r) => <><b>{r.name}</b><div className="cell-sub">{r.description}</div></> },
      { key: "appliesTo", label: "Applies to", render: (r) => <span className="pill info">{r.appliesTo.replace("_", " ")}</span> },
      { key: "checks", label: "Checks (warn / crit)", sortValue: (r) => r.checks.length, render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 520 }}>{r.checks.map((c) => (
          <span key={c.name} className="pill muted" title={c.metric}>{c.name} <b style={{ color: "var(--warn)" }}>{c.warn}</b>/<b style={{ color: "var(--crit)" }}>{c.crit}</b>{c.unit}</span>
        ))}</div>) },
      { key: "intervalSec", label: "Interval", render: (r) => `${r.intervalSec}s` },
      { key: "enabled", label: "State", render: (r) => <span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span> },
    ],
    fields: [
      { key: "name", label: "Name", required: true }, { key: "appliesTo", label: "Applies to", type: "select", options: opts(APPLIES), required: true },
      { key: "description", label: "Description", wide: true },
      { key: "intervalSec", label: "Interval (s)", type: "number", min: 10 }, { key: "enabled", label: "Enabled", type: "checkbox" },
      { key: "checks", label: "Checks (JSON)", type: "json", required: true, help: 'List of {"name", "metric", "warn", "crit", "unit"}' },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
