import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { Meter } from "@/components/ui";
import { dateTone, fmtDate, money, opts, relDays } from "@/lib/itsmFmt";

interface License extends Row {
  id: number; product: number; productName: string; licenseType: string; seatsTotal: number; seatsUsed: number;
  expiry: string | null; annualCost: string | null; contractRef: string;
}

const util = (r: License) => (r.seatsTotal ? Math.round((r.seatsUsed / r.seatsTotal) * 100) : 0);

export default function LicensesScreen() {
  const cfg: ResourceConfig<License> = {
    title: "Licenses", subtitle: "Entitlements, seat utilisation and renewal dates", icon: "fa-key",
    crumbs: [{ label: "Home", to: "/" }, { label: "Assets" }, { label: "Licenses" }],
    path: "/licenses/", createLabel: "License", canDelete: true, label: (r) => `${r.productName} license`,
    search: (r) => `${r.productName} ${r.licenseType} ${r.contractRef}`,
    kpis: (rows) => {
      const used = rows.reduce((s, r) => s + r.seatsUsed, 0), total = rows.reduce((s, r) => s + r.seatsTotal, 0);
      const exp = rows.filter((r) => dateTone(r.expiry, 60) !== "ok" && r.expiry).length;
      return [
        { label: "Licenses", value: rows.length },
        { label: "Annual spend", value: money(rows.reduce((s, r) => s + Number(r.annualCost ?? 0), 0)) },
        { label: "Seats used", value: `${used} / ${total}`, sub: total ? `${Math.round((used / total) * 100)}% utilised` : undefined },
        { label: "Expired / expiring ≤ 60d", value: exp, tone: exp ? "warn" : undefined },
      ];
    },
    filters: [{ key: "licenseType", label: "Type" }],
    columns: [
      { key: "productName", label: "Product", render: (r) => <><b>{r.productName}</b>{r.contractRef && <div className="cell-sub mono">{r.contractRef}</div>}</> },
      { key: "licenseType", label: "Type" },
      { key: "seats", label: "Seats", sortValue: util, render: (r) => (
        <div style={{ minWidth: 150 }}><div className="cell-sub">{r.seatsUsed} / {r.seatsTotal} · {util(r)}%</div>
          <Meter pct={util(r)} color={util(r) >= 95 ? "var(--crit)" : util(r) >= 80 ? "#f59e0b" : "var(--ok)"} /></div>) },
      { key: "annualCost", label: "Annual cost", sortValue: (r) => Number(r.annualCost ?? 0), render: (r) => money(r.annualCost) },
      { key: "expiry", label: "Expiry", render: (r) => r.expiry ? <><span className={`pill ${dateTone(r.expiry, 60)}`}>{fmtDate(r.expiry)}</span><div className="cell-sub">{relDays(r.expiry)}</div></> : <span className="cell-sub">Perpetual</span> },
    ],
    fields: [
      { key: "product", label: "Software product", type: "select", required: true, optionsFrom: { path: "/software/", value: "id", label: (r) => `${r.name} ${r.version}` } },
      { key: "licenseType", label: "License type", type: "select", required: true, options: opts(["Subscription", "Perpetual", "Per-core", "Per-user", "Enterprise", "Open source"]) },
      { key: "seatsTotal", label: "Seats purchased", type: "number", min: 1, required: true },
      { key: "seatsUsed", label: "Seats used", type: "number", min: 0 },
      { key: "expiry", label: "Expiry", type: "date" }, { key: "annualCost", label: "Annual cost (₹)", type: "number", min: 0 },
      { key: "contractRef", label: "Contract reference", wide: true },
    ],
    defaults: { seatsUsed: 0 },
  };
  return <ResourcePage cfg={cfg} />;
}
