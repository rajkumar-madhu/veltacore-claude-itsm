import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { dateTone, fmtDate, money, opts, pairs, relDays } from "@/lib/itsmFmt";

interface Asset extends Row {
  id: number; assetTag: string; name: string; assetType: string; vendor: string; model: string; serial: string; status: string;
  assignedTo: string; location: string; purchaseDate: string | null; cost: string | null; warrantyEnd: string | null; eolDate: string | null;
  ci: number | null; ciName: string | null;
}

const STATUS = pairs([["in_use", "In use"], ["in_stock", "In stock"], ["repair", "In repair"], ["retired", "Retired"]]);
const STATUS_TONE: Record<string, string> = { in_use: "ok", in_stock: "info", repair: "warn", retired: "muted" };
const TYPES = ["Server", "Switch", "Router", "Firewall", "Load Balancer", "Wireless", "Storage", "Laptop", "Desktop", "Monitor", "Other"];

export default function AssetsScreen() {
  const cfg: ResourceConfig<Asset> = {
    title: "IT Assets", subtitle: "Hardware inventory with ownership, cost, warranty and end-of-life", icon: "fa-boxes-stacked",
    crumbs: [{ label: "Home", to: "/" }, { label: "Assets" }, { label: "IT Assets" }],
    path: "/assets/", createLabel: "Asset", canDelete: true, label: (r) => `${r.assetTag} ${r.name}`,
    search: (r) => `${r.assetTag} ${r.name} ${r.vendor} ${r.model} ${r.serial} ${r.assignedTo} ${r.location}`,
    defaults: { status: "in_use" },
    kpis: (rows) => {
      const live = rows.filter((r) => r.status !== "retired");
      const soon = live.filter((r) => dateTone(r.warrantyEnd) !== "ok" && r.warrantyEnd).length;
      return [
        { label: "Assets", value: rows.length, sub: `${live.length} active` },
        { label: "Total value", value: money(rows.reduce((s, r) => s + Number(r.cost ?? 0), 0)) },
        { label: "Warranty ≤ 90 days / expired", value: soon, tone: soon ? "warn" : undefined },
        { label: "In repair", value: rows.filter((r) => r.status === "repair").length },
      ];
    },
    filters: [
      { key: "assetType", label: "Type" }, { key: "status", label: "Status", options: STATUS }, { key: "vendor", label: "Vendor" },
      { key: "warranty", label: "Warranty", options: pairs([["expired", "Expired"], ["soon", "Expiring ≤ 90d"], ["ok", "Covered"]]),
        match: (r, v) => (v === "expired" ? dateTone(r.warrantyEnd) === "crit" : v === "soon" ? dateTone(r.warrantyEnd) === "warn" : dateTone(r.warrantyEnd) === "ok") },
    ],
    columns: [
      { key: "assetTag", label: "Tag", render: (r) => <span className="mono cell-strong">{r.assetTag}</span> },
      { key: "name", label: "Asset", render: (r) => <><b>{r.name}</b><div className="cell-sub">{[r.vendor, r.model].filter(Boolean).join(" ")}</div></> },
      { key: "assetType", label: "Type" },
      { key: "status", label: "Status", render: (r) => <span className={`pill ${STATUS_TONE[r.status]}`}>{STATUS.find((s) => s.value === r.status)?.label}</span> },
      { key: "assignedTo", label: "Owner / location", render: (r) => <>{r.assignedTo || "—"}<div className="cell-sub">{r.location}</div></> },
      { key: "ciName", label: "CI", render: (r) => (r.ci ? <Link className="link" onClick={(e) => e.stopPropagation()} to={`/cmdb/cis/${r.ci}`}>{r.ciName}</Link> : "—") },
      { key: "cost", label: "Cost", sortValue: (r) => Number(r.cost ?? 0), render: (r) => money(r.cost) },
      { key: "warrantyEnd", label: "Warranty", render: (r) => r.warrantyEnd ? <><span className={`pill ${dateTone(r.warrantyEnd)}`}>{fmtDate(r.warrantyEnd)}</span><div className="cell-sub">{relDays(r.warrantyEnd)}</div></> : "—" },
      { key: "eolDate", label: "End of life", render: (r) => <span className={r.eolDate && dateTone(r.eolDate, 180) !== "ok" ? "warn-text" : ""}>{fmtDate(r.eolDate)}</span> },
    ],
    fields: [
      { key: "assetTag", label: "Asset tag", required: true, placeholder: "AST-10050" },
      { key: "name", label: "Name", required: true },
      { key: "assetType", label: "Type", type: "select", options: opts(TYPES), required: true },
      { key: "status", label: "Status", type: "select", options: STATUS, required: true },
      { key: "vendor", label: "Vendor" }, { key: "model", label: "Model" }, { key: "serial", label: "Serial number" },
      { key: "assignedTo", label: "Assigned to" }, { key: "location", label: "Location" },
      { key: "ci", label: "Configuration item", type: "select", optionsFrom: { path: "/cis/", value: "id", label: (r) => `${r.name} (${r.ciClass})` } },
      { key: "purchaseDate", label: "Purchase date", type: "date" }, { key: "cost", label: "Cost (₹)", type: "number", min: 0 },
      { key: "warrantyEnd", label: "Warranty end", type: "date" }, { key: "eolDate", label: "End of life", type: "date" },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
