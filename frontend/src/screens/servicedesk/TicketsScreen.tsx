import { Link, useSearchParams } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import type { FieldDef } from "@/components/resource/ResourceForm";
import { PriorityBadge, SlaBadge, StatePill } from "@/components/itsmBadges";
import { stateLabel } from "@/lib/status";
import { formatShort } from "@/lib/series";

export interface Ticket extends Row {
  id: number; number: string; ticketType: string; title: string; description: string; priority: string; state: string;
  category: string; assignmentGroup: string; assignee: string; requester: string; ci: number | null; ciName: string | null;
  domain: string | null; domainName: string | null; catalogItem: number | null; catalogItemName: string | null;
  slaDue: string | null; slaStatus: string; createdAt: string; updatedAt: string; resolvedAt: string | null; extra: Record<string, unknown>;
}

const TYPES: Record<string, { title: string; label: string; icon: string; sub: string }> = {
  incident: { title: "Incidents", label: "Incident", icon: "fa-fire", sub: "Unplanned interruptions and degradations" },
  problem: { title: "Problems", label: "Problem", icon: "fa-bug", sub: "Root causes behind recurring incidents" },
  change: { title: "Changes", label: "Change", icon: "fa-code-pull-request", sub: "Planned changes through CAB approval" },
  request: { title: "Service Requests", label: "Request", icon: "fa-inbox", sub: "Catalog requests and fulfilment" },
};
const PRIORITIES = ["P1", "P2", "P3", "P4"].map((p) => ({ value: p, label: { P1: "P1 - Critical", P2: "P2 - High", P3: "P3 - Medium", P4: "P4 - Low" }[p]! }));
const OPEN_DONE = new Set(["resolved", "closed", "cancelled", "rejected", "fulfilled", "implemented"]);

export default function TicketsScreen() {
  const [params] = useSearchParams();
  const type = params.get("type") && TYPES[params.get("type")!] ? params.get("type")! : "incident";
  const t = TYPES[type];

  const base: FieldDef[] = [
    { key: "title", label: "Title", required: true, wide: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITIES, required: true },
    { key: "category", label: "Category", placeholder: "Application, Network, …" },
    { key: "assignmentGroup", label: "Assignment group", placeholder: "NOC" },
    { key: "assignee", label: "Assignee" },
    { key: "requester", label: "Requester / caller" },
    { key: "ci", label: "Configuration item", type: "select", optionsFrom: { path: "/cis/", value: "id", label: (r) => `${r.name} (${r.ciClass})` } },
  ];
  const changeFields: FieldDef[] = [
    { key: "x_risk", label: "Risk", type: "select", options: ["Low", "Medium", "High"].map((v) => ({ value: v, label: v })) },
    { key: "x_impact", label: "Impact", type: "select", options: ["Low", "Medium", "High"].map((v) => ({ value: v, label: v })) },
    { key: "x_plannedStart", label: "Planned start", type: "datetime" },
    { key: "x_plannedEnd", label: "Planned end", type: "datetime" },
    { key: "x_backoutPlan", label: "Backout plan", type: "textarea" },
  ];
  const problemFields: FieldDef[] = [
    { key: "x_rootCause", label: "Root cause", type: "textarea" },
    { key: "x_workaround", label: "Workaround", type: "textarea" },
  ];
  const fields = [...base, ...(type === "change" ? changeFields : type === "problem" ? problemFields : [])];

  const cfg: ResourceConfig<Ticket> = {
    title: t.title, subtitle: t.sub, icon: t.icon,
    crumbs: [{ label: "Home", to: "/" }, { label: "Service Desk" }, { label: t.title }],
    path: "/tickets/", params: { ticket_type: type },
    createLabel: t.label,
    canCreate: type !== "request",
    headerActions: () => type === "request" ? <Link className="btn primary" to="/catalog"><i className="fa-solid fa-store" /> Request from catalog</Link> : null,
    defaults: { priority: "P3", ticketType: type },
    fields,
    transform: (v) => {
      const extra: Record<string, unknown> = {};
      const body: Record<string, unknown> = { ticketType: type };
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith("x_")) { if (val !== null && val !== "") extra[k.slice(2)] = val; } else body[k] = val;
      }
      if (Object.keys(extra).length) body.extra = extra;
      return body;
    },
    toForm: (r) => ({ ...r, ...Object.fromEntries(Object.entries(r.extra ?? {}).map(([k, v]) => [`x_${k}`, v])) }),
    canEdit: (r) => !OPEN_DONE.has(r.state) || r.state === "resolved",
    rowLink: (r) => `/tickets/${r.id}`,
    search: (r) => `${r.number} ${r.title} ${r.assignee} ${r.requester} ${r.ciName ?? ""} ${r.category}`,
    filters: [
      { key: "state", label: "State", fromRows: (r) => r.state },
      { key: "priority", label: "Priority", options: PRIORITIES },
      { key: "open", label: "Status", options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }], match: (r, v) => (v === "open") !== OPEN_DONE.has(r.state) },
      { key: "assignee", label: "Assignee", fromRows: (r) => r.assignee || "Unassigned" , match: (r, v) => (r.assignee || "Unassigned") === v },
      { key: "slaStatus", label: "SLA", fromRows: (r) => r.slaStatus },
    ],
    kpis: (rows) => {
      const open = rows.filter((r) => !OPEN_DONE.has(r.state));
      return [
        { label: "Open", value: open.length, sub: `${rows.length} total` },
        { label: "P1 / P2 open", value: open.filter((r) => r.priority === "P1" || r.priority === "P2").length, tone: open.some((r) => r.priority === "P1") ? "crit" : "ok" },
        { label: "Unassigned", value: open.filter((r) => !r.assignee).length, tone: open.some((r) => !r.assignee) ? "warn" : "ok" },
        { label: "SLA breached", value: rows.filter((r) => r.slaStatus === "breached").length, tone: rows.some((r) => r.slaStatus === "breached") ? "crit" : "ok" },
      ];
    },
    columns: [
      { key: "number", label: "Number", render: (r) => <span className="link cell-strong mono">{r.number}</span> },
      { key: "title", label: "Title", render: (r) => <div><div className="cell-strong">{r.title}</div><div className="cell-sub">{r.category || "—"}{r.catalogItemName ? ` · ${r.catalogItemName}` : ""}</div></div> },
      { key: "priority", label: "Priority", render: (r) => <PriorityBadge p={r.priority} /> },
      { key: "state", label: "State", render: (r) => <StatePill state={r.state} />, sortValue: (r) => stateLabel(r.state) },
      { key: "assignee", label: "Assigned to", render: (r) => r.assignee ? <div>{r.assignee}<div className="cell-sub">{r.assignmentGroup}</div></div> : <span className="warn-text">Unassigned</span> },
      { key: "ciName", label: "CI", render: (r) => r.ciName ?? "—" },
      ...(type === "change" ? [{ key: "x", label: "Planned", render: (r: Ticket) => r.extra?.plannedStart ? formatShort(String(r.extra.plannedStart)) : "—" }] : [
        { key: "slaStatus", label: "SLA", render: (r: Ticket) => <SlaBadge s={r.slaStatus} /> }]),
      { key: "createdAt", label: "Opened", render: (r) => <span className="nowrap">{formatShort(r.createdAt)}</span> },
    ],
    label: (r) => r.number,
    emptyText: `No ${t.title.toLowerCase()} match.`,
  };
  return <ResourcePage key={type} cfg={cfg} />;
}
