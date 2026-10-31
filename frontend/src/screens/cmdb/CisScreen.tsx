import ResourcePage, { type ResourceConfig } from "@/components/resource/ResourcePage";
import { PriorityBadge } from "@/components/itsmBadges";
import { ago } from "@/lib/itsmFmt";
import { CI_FIELDS, CI_SOURCE, CI_STATUS, CI_STATUS_TONE, type Ci } from "./cmdbMeta";

export default function CisScreen() {
  const cfg: ResourceConfig<Ci> = {
    title: "Configuration Items", subtitle: "Every managed component, synced from inventory or added manually", icon: "fa-cubes",
    crumbs: [{ label: "Home", to: "/" }, { label: "CMDB" }, { label: "Configuration Items" }],
    path: "/cis/", createLabel: "CI", rowLink: (r) => `/cmdb/cis/${r.id}`,
    search: (r) => `${r.ciId} ${r.name} ${r.ciClass} ${r.ip} ${r.owner}`,
    label: (r) => `${r.ciId} ${r.name}`,
    defaults: { status: "operational", environment: "Production", criticality: "P3" },
    canEdit: true, canDelete: (r) => r.source === "manual",
    headerActions: (ctx) => (
      <button className="btn" onClick={() => ctx.post("/cis/sync/").then((r) => {
        const s = r as { created: number; updated: number; total: number };
        ctx.toast("ok", `Synced inventory: ${s.created} created, ${s.updated} updated (${s.total} CIs)`);
      }).catch((e: Error) => ctx.toast("err", e.message))}><i className="fa-solid fa-arrows-rotate" /> Sync from inventory</button>
    ),
    kpis: (rows) => [
      { label: "Total CIs", value: rows.length },
      { label: "Degraded", value: rows.filter((r) => r.status === "degraded").length, tone: rows.some((r) => r.status === "degraded") ? "warn" : undefined },
      { label: "Critical (P1)", value: rows.filter((r) => r.criticality === "P1").length },
      { label: "Discovered", value: rows.filter((r) => r.source !== "manual").length, sub: `${rows.filter((r) => r.source === "manual").length} manual` },
    ],
    filters: [
      { key: "ciClass", label: "Class" },
      { key: "status", label: "Status", options: CI_STATUS },
      { key: "environment", label: "Environment" },
      { key: "source", label: "Source", options: Object.entries(CI_SOURCE).map(([value, label]) => ({ value, label })) },
    ],
    columns: [
      { key: "ciId", label: "CI ID", render: (r) => <span className="link cell-strong mono">{r.ciId}</span> },
      { key: "name", label: "Name", render: (r) => <><b>{r.name}</b>{r.ip && <div className="cell-sub mono">{r.ip}</div>}</> },
      { key: "ciClass", label: "Class" },
      { key: "status", label: "Status", render: (r) => <span className={`pill ${CI_STATUS_TONE[r.status] ?? "muted"}`}>{CI_STATUS.find((s) => s.value === r.status)?.label ?? r.status}</span> },
      { key: "criticality", label: "Criticality", render: (r) => <PriorityBadge p={r.criticality} /> },
      { key: "environment", label: "Env" },
      { key: "siteName", label: "Site", render: (r) => r.siteName ?? "—" },
      { key: "source", label: "Source", render: (r) => <span className="cell-sub">{CI_SOURCE[r.source] ?? r.source}</span> },
      { key: "updatedAt", label: "Updated", render: (r) => <span className="cell-sub">{ago(r.updatedAt)}</span> },
    ],
    fields: CI_FIELDS,
  };
  return <ResourcePage cfg={cfg} />;
}
