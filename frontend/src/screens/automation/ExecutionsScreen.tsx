import React from "react";
import ResourcePage, { type ResourceConfig } from "@/components/resource/ResourcePage";
import { Modal } from "@/components/ui";
import { formatDateTime } from "@/lib/series";
import { ExecutionSteps } from "./ExecutionSteps";
import { EXEC_TONE, type Execution } from "./automationMeta";

export default function ExecutionsScreen() {
  const [open, setOpen] = React.useState<Execution | null>(null);
  const cfg: ResourceConfig<Execution> = {
    title: "Executions", subtitle: "Every runbook run — manual or triggered by a workflow — with step-level results", icon: "fa-clock-rotate-left",
    crumbs: [{ label: "Home", to: "/" }, { label: "Automation" }, { label: "Executions" }],
    path: "/executions/", refetchInterval: 30_000, label: (r) => `Execution #${r.id}`,
    search: (r) => `${r.runbookName} ${r.triggeredBy} ${r.status}`,
    emptyText: "No runbook has run yet. Run one from Runbooks, or let a workflow trigger it.",
    kpis: (rows) => [
      { label: "Executions", value: rows.length },
      { label: "Succeeded", value: rows.filter((r) => r.status === "success").length, tone: "ok" },
      { label: "Failed", value: rows.filter((r) => r.status === "failed").length, tone: rows.some((r) => r.status === "failed") ? "crit" : undefined },
      { label: "Automatic", value: rows.filter((r) => !r.triggeredBy.startsWith("manual")).length, sub: "triggered by workflows" },
    ],
    filters: [
      { key: "runbookName", label: "Runbook" },
      { key: "status", label: "Status", options: [{ value: "success", label: "Success" }, { value: "failed", label: "Failed" }] },
      { key: "trigger", label: "Trigger", options: [{ value: "manual", label: "Manual" }, { value: "auto", label: "Workflow" }], match: (r, v) => r.triggeredBy.startsWith("manual") === (v === "manual") },
    ],
    columns: [
      { key: "id", label: "#", render: (r) => <span className="mono">#{r.id}</span> },
      { key: "runbookName", label: "Runbook", render: (r) => <b>{r.runbookName}</b> },
      { key: "status", label: "Status", render: (r) => <span className={`pill ${EXEC_TONE[r.status] ?? "muted"}`}>{r.status}</span> },
      { key: "steps", label: "Steps", render: (r) => {
        const n = (s: string) => r.stepResults.filter((x) => x.status === s).length;
        return <span className="cell-sub">{n("passed")} passed · {n("failed")} failed · {n("skipped")} dry run</span>;
      } },
      { key: "mode", label: "Mode", render: (r) => <span className="pill muted">{r.mode.replace("_", " ")}</span> },
      { key: "triggeredBy", label: "Triggered by" },
      { key: "startedAt", label: "Started", render: (r) => formatDateTime(r.startedAt) },
    ],
    rowActions: [{ label: "View steps", icon: "fa-eye", run: (r) => setOpen(r) }],
  };
  return <>
    <ResourcePage cfg={cfg} />
    {open && (
      <Modal wide title={`${open.runbookName} — execution #${open.id}`} onClose={() => setOpen(null)} footer={<button className="btn" onClick={() => setOpen(null)}>Close</button>}>
        <p className="cell-sub" style={{ marginTop: 0 }}>{formatDateTime(open.startedAt)} · {open.triggeredBy}</p>
        <ExecutionSteps steps={open.stepResults} />
      </Modal>
    )}
  </>;
}
