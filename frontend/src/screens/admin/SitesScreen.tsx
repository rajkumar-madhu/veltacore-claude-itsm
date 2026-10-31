import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { opts } from "@/lib/itsmFmt";

interface Site extends Row { id: string; name: string; region: string; devices: number; health: number; lat: number; lng: number; usage: { vms: number; devices: number; exporters: number } }

export default function SitesScreen() {
  const cfg: ResourceConfig<Site> = {
    title: "Sites / Locations", subtitle: "Data centres and branches that devices, VMs and exporters belong to", icon: "fa-location-dot",
    crumbs: [{ label: "Home", to: "/" }, { label: "Administration" }, { label: "Sites / Locations" }],
    path: "/sites/", createLabel: "Site", canDelete: (r) => !r.usage.vms && !r.usage.devices && !r.usage.exporters,
    defaults: { health: 100, devices: 0 },
    kpis: (rows) => [
      { label: "Sites", value: rows.length }, { label: "Regions", value: new Set(rows.map((r) => r.region)).size },
      { label: "Managed devices", value: rows.reduce((s, r) => s + r.usage.devices, 0) },
      { label: "Exporters", value: rows.reduce((s, r) => s + r.usage.exporters, 0) },
    ],
    filters: [{ key: "region", label: "Region" }],
    columns: [
      { key: "name", label: "Site", render: (r) => <><b>{r.name}</b><div className="cell-sub mono">{r.id}</div></> },
      { key: "region", label: "Region" },
      { key: "usage", label: "In use by", sortValue: (r) => r.usage.devices + r.usage.vms + r.usage.exporters,
        render: (r) => <span className="cell-sub">{r.usage.devices} devices · {r.usage.vms} VMs · {r.usage.exporters} exporters</span> },
      { key: "devices", label: "Inventory count", render: (r) => r.devices },
      { key: "health", label: "Health", render: (r) => <span className={`pill ${r.health >= 95 ? "ok" : r.health >= 85 ? "warn" : "crit"}`}>{r.health}%</span> },
      { key: "coords", label: "Coordinates", render: (r) => <span className="cell-sub mono">{r.lat.toFixed(2)}, {r.lng.toFixed(2)}</span> },
    ],
    fields: [
      { key: "id", label: "Site id", required: true, createOnly: true, placeholder: "dc-hyd-1", help: "Lowercase letters, numbers and dashes; can't be changed later" },
      { key: "name", label: "Name", required: true }, { key: "region", label: "Region", type: "select", options: opts(["APAC", "EMEA", "AMER"]), required: true },
      { key: "lat", label: "Latitude", type: "number", min: -90, max: 90, required: true }, { key: "lng", label: "Longitude", type: "number", min: -180, max: 180, required: true },
      { key: "devices", label: "Inventory count", type: "number", min: 0 }, { key: "health", label: "Health (%)", type: "number", min: 0, max: 100 },
    ],
    emptyText: "No sites yet.",
  };
  return <ResourcePage cfg={cfg} />;
}
