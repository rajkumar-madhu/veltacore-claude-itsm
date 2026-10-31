import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig } from "@/components/resource/ResourcePage";
import { REL_LABEL, REL_TYPES, type CiRel } from "./cmdbMeta";

const ciOptions = { path: "/cis/", value: "id", label: (r: Record<string, unknown>) => `${r.name} (${r.ciClass})` };

export default function RelationshipsScreen() {
  const cfg: ResourceConfig<CiRel> = {
    title: "Relationships", subtitle: "Directed links between configuration items", icon: "fa-link",
    crumbs: [{ label: "Home", to: "/" }, { label: "CMDB" }, { label: "Relationships" }],
    path: "/relationships/", createLabel: "Relationship", canEdit: false, canDelete: true,
    label: (r) => `${r.sourceName} → ${r.targetName}`,
    search: (r) => `${r.sourceName} ${r.targetName} ${r.relType} ${r.sourceClass} ${r.targetClass}`,
    kpis: (rows) => [
      { label: "Relationships", value: rows.length },
      ...REL_TYPES.filter((t) => rows.some((r) => r.relType === t.value)).slice(0, 3)
        .map((t) => ({ label: t.label, value: rows.filter((r) => r.relType === t.value).length })),
    ],
    filters: [
      { key: "relType", label: "Type", options: REL_TYPES },
      { key: "sourceClass", label: "Source class" },
      { key: "targetClass", label: "Target class" },
    ],
    columns: [
      { key: "sourceName", label: "Source", render: (r) => <><Link className="link cell-strong" to={`/cmdb/cis/${r.source}`}>{r.sourceName}</Link><div className="cell-sub">{r.sourceClass}</div></> },
      { key: "relType", label: "Relationship", render: (r) => <span className="pill info"><i className="fa-solid fa-arrow-right" /> {REL_LABEL[r.relType] ?? r.relType}</span> },
      { key: "targetName", label: "Target", render: (r) => <><Link className="link cell-strong" to={`/cmdb/cis/${r.target}`}>{r.targetName}</Link><div className="cell-sub">{r.targetClass}</div></> },
      { key: "graph", label: "", render: (r) => <Link className="link" to={`/cmdb/topology?root=${r.source}&depth=1`}><i className="fa-solid fa-diagram-project" /> View</Link> },
    ],
    fields: [
      { key: "source", label: "Source CI", type: "select", optionsFrom: ciOptions, required: true },
      { key: "relType", label: "Relationship", type: "select", options: REL_TYPES, required: true },
      { key: "target", label: "Target CI", type: "select", optionsFrom: ciOptions, required: true },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
