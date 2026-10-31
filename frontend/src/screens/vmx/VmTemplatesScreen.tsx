import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { opts } from "@/lib/itsmFmt";
import { formatShort } from "@/lib/series";

export interface VmTemplate extends Row { id: number; name: string; platform: string; os: string; vcpu: number; memoryGb: number; diskGb: number; description: string; updatedAt: string }

export default function VmTemplatesScreen() {
  const cfg: ResourceConfig<VmTemplate> = {
    title: "VM Templates", subtitle: "Standard builds that new VM requests start from", icon: "fa-clone",
    crumbs: [{ label: "Home", to: "/" }, { label: "Virtual Machines" }, { label: "VM Templates" }],
    path: "/vm-templates/", createLabel: "Template", canDelete: true, defaults: { platform: "VMware", vcpu: 2, memoryGb: 4, diskGb: 60 },
    kpis: (rows) => [{ label: "Templates", value: rows.length }, { label: "Platforms", value: new Set(rows.map((r) => r.platform)).size }],
    filters: [{ key: "platform", label: "Platform" }],
    columns: [
      { key: "name", label: "Template", render: (r) => <><b className="mono">{r.name}</b><div className="cell-sub">{r.description}</div></> },
      { key: "platform", label: "Platform" }, { key: "os", label: "OS" },
      { key: "size", label: "Size", sortValue: (r) => r.vcpu * 1000 + r.memoryGb, render: (r) => `${r.vcpu} vCPU · ${r.memoryGb} GB · ${r.diskGb} GB disk` },
      { key: "updatedAt", label: "Updated", render: (r) => <span className="cell-sub">{formatShort(r.updatedAt)}</span> },
      { key: "use", label: "", render: (r) => <Link className="btn sm" onClick={(e) => e.stopPropagation()} to={`/vms/new?template=${r.id}`}>Request VM</Link> },
    ],
    fields: [
      { key: "name", label: "Name", required: true }, { key: "platform", label: "Platform", type: "select", options: opts(["VMware", "Hyper-V", "Proxmox"]), required: true },
      { key: "os", label: "Operating system", required: true, wide: true },
      { key: "vcpu", label: "vCPU", type: "number", min: 1, max: 128, required: true }, { key: "memoryGb", label: "Memory (GB)", type: "number", min: 1, required: true },
      { key: "diskGb", label: "Disk (GB)", type: "number", min: 1, required: true }, { key: "description", label: "Description", wide: true },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
