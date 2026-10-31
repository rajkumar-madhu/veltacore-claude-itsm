import { Link } from "react-router-dom";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";
import { formatDateTime } from "@/lib/series";
import { BodResults } from "./BodResults";
import { RESULT_ICON, RESULT_LABEL, RESULT_TONE, type BodRun } from "./bodMeta";

const PHASES = { BOD: { title: "Beginning of Day", icon: "fa-sun" }, EOD: { title: "End of Day", icon: "fa-moon" } } as const;

export default function BodStatusScreen() {
  const { data, isError, isLoading, refetch } = useItsmGet<Record<"BOD" | "EOD", BodRun | null>>("/bod-runs/latest/");
  const run = useItsmMutation<{ phase: "BOD" | "EOD" }, BodRun>("POST", () => "/bod-runs/");
  const [toast, setToast] = useToast();

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "BOD / EOD" }, { label: "Status Dashboard" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-calendar-check" /><div><h1 className="page-title">BOD / EOD Status</h1>
          <div className="page-sub">Beginning- and end-of-day readiness checks, evaluated against live platform data</div></div></div>
        <div className="detail-actions">
          <Link className="btn" to="/bod/checks"><i className="fa-solid fa-list-check" /> Key validations</Link>
          <Link className="btn" to="/bod/history"><i className="fa-solid fa-clock-rotate-left" /> History</Link>
        </div>
      </div>
      {isError ? <ApiDown what="BOD/EOD status" retry={() => refetch()} /> : isLoading || !data ? <div className="loading">Loading…</div> : (
        <div className="grid-2">
          {(["BOD", "EOD"] as const).map((p) => {
            const r = data[p];
            const counts = r ? (["pass", "warn", "fail"] as const).map((s) => [s, r.results.filter((x) => x.status === s).length] as const) : [];
            const busy = run.isPending && run.variables?.phase === p;
            return (
              <Card key={p} title={<>{PHASES[p].title} <span className="cell-sub">({p})</span></>} icon={PHASES[p].icon} right={
                <button className="btn primary sm" disabled={run.isPending} onClick={() => run.mutate({ phase: p }, {
                  onSuccess: (x) => setToast({ kind: x.status === "fail" ? "err" : "ok", text: `${p} run ${RESULT_LABEL[x.status].toLowerCase()} — ${x.results.filter((y) => y.status === "pass").length}/${x.results.length} checks passed` }),
                  onError: (e) => setToast({ kind: "err", text: e.message }),
                })}>{busy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-play" />} Run {p} now</button>}>
                {!r ? <div className="empty-card"><i className={`fa-solid ${PHASES[p].icon}`} />No {p} run yet.</div> : <>
                  <div className={`banner ${r.status === "pass" ? "ok" : r.status === "warn" ? "warn" : "err"}`} style={{ marginBottom: 12 }}>
                    <i className={`fa-solid ${RESULT_ICON[r.status]}`} />
                    <div style={{ flex: 1 }}><b>{r.status === "pass" ? `${p} ready — all checks passed` : r.status === "warn" ? `${p} ready with warnings` : `${p} blocked — critical checks failed`}</b>
                      <div>Ran {formatDateTime(r.startedAt)} ({ago(r.startedAt)}) by {r.triggeredBy}</div></div>
                    <div style={{ display: "flex", gap: 6 }}>{counts.map(([s, n]) => <span key={s} className={`pill ${RESULT_TONE[s]}`}>{n} {RESULT_LABEL[s].toLowerCase()}</span>)}</div>
                  </div>
                  <BodResults results={[...r.results].sort((a, b) => ["fail", "warn", "pass"].indexOf(a.status) - ["fail", "warn", "pass"].indexOf(b.status))} />
                </>}
              </Card>
            );
          })}
        </div>
      )}
      {toast}
    </div>
  );
}
