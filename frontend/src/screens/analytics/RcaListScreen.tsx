import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { formatShort } from "@/lib/series";

export interface Rca extends Row {
  id: number; number: string; title: string; problem: number | null; problemNumber: string | null; incidents: string[]; status: string;
  summary: string; rootCause: string; impact: string; timeline: { ts: string; event: string }[];
  actions: { action: string; owner: string; due: string; done: boolean }[]; author: string; createdAt: string; publishedAt: string | null;
}
const TONE: Record<string, string> = { draft: "muted", review: "warn", published: "ok" };
const LABEL: Record<string, string> = { draft: "Draft", review: "In review", published: "Published" };

export default function RcaListScreen() {
  const cfg: ResourceConfig<Rca> = {
    title: "RCA Reports", subtitle: "Root-cause analyses for problems and major incidents", icon: "fa-magnifying-glass-chart",
    crumbs: [{ label: "Home", to: "/" }, { label: "Analytics" }, { label: "RCA Reports" }],
    path: "/rca/", createLabel: "RCA", canEdit: false, canDelete: (r) => r.status !== "published",
    rowLink: (r) => `/reports/rca/${r.id}`, label: (r) => `${r.number} ${r.title}`,
    search: (r) => `${r.number} ${r.title} ${r.summary} ${r.rootCause} ${r.author}`,
    kpis: (rows) => [
      { label: "Reports", value: rows.length },
      { label: "Published", value: rows.filter((r) => r.status === "published").length, tone: "ok" },
      { label: "Drafts / in review", value: rows.filter((r) => r.status !== "published").length },
      { label: "Open actions", value: rows.reduce((s, r) => s + r.actions.filter((a) => !a.done).length, 0) },
    ],
    filters: [{ key: "status", label: "Status", options: Object.entries(LABEL).map(([value, label]) => ({ value, label })) }],
    columns: [
      { key: "number", label: "Number", render: (r) => <span className="link mono cell-strong">{r.number}</span> },
      { key: "title", label: "Title", render: (r) => <><b>{r.title}</b><div className="cell-sub">{r.summary.slice(0, 110)}</div></> },
      { key: "problemNumber", label: "Problem", render: (r) => (r.problem ? <Link className="link mono" onClick={(e) => e.stopPropagation()} to={`/tickets/${r.problem}`}>{r.problemNumber}</Link> : "—") },
      { key: "status", label: "Status", render: (r) => <span className={`pill ${TONE[r.status]}`}>{LABEL[r.status]}</span> },
      { key: "actions", label: "Actions", sortValue: (r) => r.actions.filter((a) => !a.done).length, render: (r) => <span className="cell-sub">{r.actions.filter((a) => a.done).length}/{r.actions.length} done</span> },
      { key: "author", label: "Author" },
      { key: "createdAt", label: "Created", render: (r) => <span className="cell-sub">{formatShort(r.createdAt)}</span> },
    ],
    fields: [
      { key: "title", label: "Title", required: true, wide: true },
      { key: "problem", label: "Problem record", type: "select", optionsFrom: { path: "/tickets/?ticket_type=problem", value: "id", label: (r) => `${r.number} · ${r.title}` } },
      { key: "summary", label: "Summary", type: "textarea" },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
