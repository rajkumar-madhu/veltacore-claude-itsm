import React from "react";
import ResourcePage, { type ResourceConfig } from "@/components/resource/ResourcePage";
import { Modal } from "@/components/ui";
import { formatDateTime } from "@/lib/series";
import { BodResults } from "./BodResults";
import { RESULT_LABEL, RESULT_TONE, type BodRun } from "./bodMeta";

export default function BodHistoryScreen() {
  const [open, setOpen] = React.useState<BodRun | null>(null);
  const cfg: ResourceConfig<BodRun> = {
    title: "Execution History", subtitle: "Every BOD and EOD run with its check results", icon: "fa-clock-rotate-left",
    crumbs: [{ label: "Home", to: "/" }, { label: "BOD / EOD" }, { label: "Execution History" }],
    path: "/bod-runs/", label: (r) => `${r.phase} run #${r.id}`,
    search: (r) => `${r.phase} ${r.status} ${r.triggeredBy} ${r.results.map((x) => x.detail).join(" ")}`,
    headerActions: (ctx) => <>
      {(["BOD", "EOD"] as const).map((p) => (
        <button key={p} className="btn" onClick={() => ctx.post("/bod-runs/", { phase: p }).then((x) => ctx.toast((x as BodRun).status === "fail" ? "err" : "ok", `${p} run: ${RESULT_LABEL[(x as BodRun).status]}`)).catch((e: Error) => ctx.toast("err", e.message))}>
          <i className="fa-solid fa-play" /> Run {p}</button>
      ))}
    </>,
    kpis: (rows) => {
      const recent = rows.slice(0, 10);
      return [
        { label: "Runs", value: rows.length },
        { label: "Passed", value: rows.filter((r) => r.status === "pass").length, tone: "ok" },
        { label: "With warnings", value: rows.filter((r) => r.status === "warn").length },
        { label: "Failed", value: rows.filter((r) => r.status === "fail").length, tone: rows.some((r) => r.status === "fail") ? "crit" : undefined, sub: recent.length ? `${recent.filter((r) => r.status === "fail").length} of last ${recent.length}` : undefined },
      ];
    },
    filters: [
      { key: "phase", label: "Phase", options: [{ value: "BOD", label: "BOD" }, { value: "EOD", label: "EOD" }] },
      { key: "status", label: "Result", options: Object.entries(RESULT_LABEL).map(([value, label]) => ({ value, label })) },
    ],
    columns: [
      { key: "id", label: "Run", render: (r) => <span className="mono">#{r.id}</span> },
      { key: "phase", label: "Phase", render: (r) => <span className="pill info">{r.phase}</span> },
      { key: "startedAt", label: "Started", render: (r) => formatDateTime(r.startedAt) },
      { key: "status", label: "Result", render: (r) => <span className={`pill ${RESULT_TONE[r.status]}`}>{RESULT_LABEL[r.status]}</span> },
      { key: "checks", label: "Checks", sortValue: (r) => r.results.filter((x) => x.status === "pass").length, render: (r) => (
        <span className="cell-sub">{r.results.filter((x) => x.status === "pass").length}/{r.results.length} passed
          {r.results.some((x) => x.status === "fail") && <> · <span className="warn-text">{r.results.filter((x) => x.status === "fail").map((x) => x.check).join(", ")}</span></>}</span>) },
      { key: "duration", label: "Duration", sortValue: (r) => new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime(), render: (r) => `${Math.max(1, new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())} ms` },
      { key: "triggeredBy", label: "Triggered by" },
    ],
    rowActions: [{ label: "View results", icon: "fa-eye", run: (r) => setOpen(r) }],
  };
  return <>
    <ResourcePage cfg={cfg} />
    {open && (
      <Modal wide title={`${open.phase} run #${open.id} · ${formatDateTime(open.startedAt)}`} onClose={() => setOpen(null)} footer={<button className="btn" onClick={() => setOpen(null)}>Close</button>}>
        <BodResults results={open.results} />
      </Modal>
    )}
  </>;
}
