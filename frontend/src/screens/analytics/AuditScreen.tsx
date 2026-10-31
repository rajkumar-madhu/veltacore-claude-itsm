import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { formatDateTime } from "@/lib/series";

interface Audit extends Row { id: number; ts: string; actor: string; action: string; objectType: string; objectId: string; summary: string }

const TONE: Record<string, string> = { create: "ok", delete: "crit", update: "info", run: "warn", publish: "ok", test: "muted" };

export default function AuditScreen() {
  const cfg: ResourceConfig<Audit> = {
    title: "Audit Logs", subtitle: "Who changed what — every write across Argus (most recent 500)", icon: "fa-shield-halved",
    crumbs: [{ label: "Home", to: "/" }, { label: "Analytics" }, { label: "Audit Logs" }],
    path: "/audit/", pageSize: 25, refetchInterval: 30_000,
    search: (r) => `${r.actor} ${r.action} ${r.objectType} ${r.objectId} ${r.summary}`,
    headerActions: () => <a className="btn" href="/api/itsm/audit/" target="_blank" rel="noreferrer"><i className="fa-solid fa-code" /> JSON</a>,
    kpis: (rows) => {
      const day = rows.filter((r) => Date.now() - new Date(r.ts).getTime() < 86_400_000);
      return [
        { label: "Entries", value: rows.length },
        { label: "Last 24h", value: day.length },
        { label: "Actors", value: new Set(rows.map((r) => r.actor)).size },
        { label: "Deletions", value: rows.filter((r) => r.action === "delete").length },
      ];
    },
    filters: [{ key: "action", label: "Action" }, { key: "objectType", label: "Object" }, { key: "actor", label: "Actor" }],
    columns: [
      { key: "ts", label: "Time", render: (r) => <span className="nowrap">{formatDateTime(r.ts)}</span> },
      { key: "actor", label: "Actor", render: (r) => <b>{r.actor}</b> },
      { key: "action", label: "Action", render: (r) => <span className={`pill ${TONE[r.action] ?? "muted"}`}>{r.action}</span> },
      { key: "objectType", label: "Object", render: (r) => <>{r.objectType}<div className="cell-sub mono">{r.objectId}</div></> },
      { key: "summary", label: "Summary" },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
