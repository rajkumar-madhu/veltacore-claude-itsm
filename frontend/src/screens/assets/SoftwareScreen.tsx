import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { dateTone, fmtDate, opts, relDays } from "@/lib/itsmFmt";

interface Software extends Row { id: number; name: string; vendor: string; version: string; category: string; installs: number; eolDate: string | null }

const CATEGORIES = ["Operating System", "Database", "Middleware", "Web Server", "Network OS", "Security", "Monitoring", "Backup", "DevOps", "Productivity", "Other"];

export default function SoftwareScreen() {
  const cfg: ResourceConfig<Software> = {
    title: "Software", subtitle: "Installed software catalogue with version and support status", icon: "fa-compact-disc",
    crumbs: [{ label: "Home", to: "/" }, { label: "Assets" }, { label: "Software" }],
    path: "/software/", createLabel: "Software", canDelete: true, label: (r) => `${r.name} ${r.version}`,
    headerActions: () => <Link className="btn" to="/assets/licenses"><i className="fa-solid fa-key" /> Licenses</Link>,
    kpis: (rows) => {
      const eos = rows.filter((r) => dateTone(r.eolDate, 180) === "crit").length;
      return [
        { label: "Products", value: rows.length },
        { label: "Installs", value: rows.reduce((s, r) => s + r.installs, 0) },
        { label: "Out of support", value: eos, tone: eos ? "crit" : undefined, sub: `${rows.reduce((s, r) => s + (dateTone(r.eolDate, 180) === "crit" ? r.installs : 0), 0)} installs affected` },
        { label: "End of support ≤ 180d", value: rows.filter((r) => dateTone(r.eolDate, 180) === "warn").length },
      ];
    },
    filters: [{ key: "category", label: "Category" }, { key: "vendor", label: "Vendor" }],
    columns: [
      { key: "name", label: "Product", render: (r) => <b>{r.name}</b> },
      { key: "version", label: "Version", render: (r) => <span className="mono">{r.version}</span> },
      { key: "vendor", label: "Vendor" }, { key: "category", label: "Category" },
      { key: "installs", label: "Installs" },
      { key: "eolDate", label: "End of support", render: (r) => r.eolDate ? <><span className={`pill ${dateTone(r.eolDate, 180)}`}>{fmtDate(r.eolDate)}</span><div className="cell-sub">{relDays(r.eolDate)}</div></> : <span className="cell-sub">Not announced</span> },
    ],
    fields: [
      { key: "name", label: "Name", required: true }, { key: "version", label: "Version", required: true },
      { key: "vendor", label: "Vendor", required: true }, { key: "category", label: "Category", type: "select", options: opts(CATEGORIES), required: true },
      { key: "installs", label: "Installs", type: "number", min: 0 }, { key: "eolDate", label: "End of support", type: "date" },
    ],
    defaults: { installs: 0 },
  };
  return <ResourcePage cfg={cfg} />;
}
