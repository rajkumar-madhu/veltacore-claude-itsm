import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { Breadcrumbs, Card } from "@/components/ui";
import { PriorityBadge } from "@/components/itsmBadges";
import { useToast } from "@/lib/useToast";
import { ExecutionSteps } from "@/screens/automation/ExecutionSteps";
import { STEP_META, type Execution, type Runbook } from "@/screens/automation/automationMeta";
import { HEALTH_LABEL, HEALTH_TONE, useServices } from "@/screens/observe/observeMeta";

interface Ticket { id: number; number: string; title: string; priority: string; state: string; ciName: string | null }

export default function RemediationScreen() {
  const [params] = useSearchParams();
  const { services } = useServices();
  const svc = services.find((s) => String(s.id) === params.get("service"));
  const { data: runbooks = [] } = useItsmList<Runbook>("/runbooks/");
  const { data: incidents = [] } = useItsmList<Ticket>("/tickets/", { ticket_type: "incident", open: "true" });
  const [rbId, setRbId] = React.useState("");
  const [incId, setIncId] = React.useState("");
  const [result, setResult] = React.useState<Execution | null>(null);
  const [toast, setToast] = useToast();
  const exec = useItsmMutation<number, Execution>("POST", (id) => `/runbooks/${id}/execute/`, () => ({}));
  const note = useItsmMutation<{ id: string; body: string }>("POST", (v) => `/tickets/${v.id}/comment/`, (v) => ({ body: v.body, kind: "work_note" }));

  // suggest runbooks whose name/description/steps mention the service or its host
  const terms = svc ? [svc.name, svc.host].map((t) => t.toLowerCase()) : [];
  const suggested = terms.length ? runbooks.filter((r) => terms.some((t) => JSON.stringify(r).toLowerCase().includes(t))) : [];
  const rb = runbooks.find((r) => String(r.id) === rbId);

  function run() {
    if (!rb) return;
    setResult(null);
    exec.mutate(rb.id, {
      onSuccess: (e) => {
        setResult(e);
        if (incId) {
          const lines = e.stepResults.map((s, i) => `${i + 1}. ${s.name}: ${s.status === "skipped" ? "dry run" : s.status} — ${s.detail}`);
          note.mutate({ id: incId, body: `Ran runbook “${rb.name}” (execution #${e.id}): ${e.status}\n${lines.join("\n")}` },
            { onSuccess: () => setToast({ kind: "ok", text: "Result added to the incident as a work note" }) });
        }
      },
      onError: (e) => setToast({ kind: "err", text: e.message }),
    });
  }
  const verify = result?.stepResults.filter((s) => s.type === "verify_health" || s.type === "http_check" || s.type === "tcp_check") ?? [];
  const verified = verify.length > 0 && verify.every((s) => s.status === "passed");

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Act" }, { label: "Remediation & Verify" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-screwdriver-wrench" /><div><h1 className="page-title">Remediation &amp; Verify</h1>
        <div className="page-sub">Run a runbook against a problem, verify the fix with live checks, and log the outcome on the incident</div></div></div></div>
      {svc && <div className={`banner ${svc.health === "ok" ? "ok" : svc.health === "warn" ? "warn" : "err"}`} style={{ marginBottom: 14 }}>
        <i className="fa-solid fa-crosshairs" /><div style={{ flex: 1 }}><b>Target: {svc.name}</b> on <span className="mono">{svc.host}</span> — currently {HEALTH_LABEL[svc.health].toLowerCase()}</div>
        <Link className="btn sm" to={`/investigate/health?service=${svc.id}`}>Back to RCA</Link></div>}
      <div className="ticket-grid">
        <div className="stack">
          <Card title="1 · Choose a runbook" icon="fa-book">
            {suggested.length > 0 && <><div className="section-title" style={{ marginTop: 0 }}>Suggested for {svc?.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{suggested.map((r) => <button key={r.id} className={`btn sm${rbId === String(r.id) ? " primary" : ""}`} onClick={() => setRbId(String(r.id))}>{r.name}</button>)}</div></>}
            <label className="field"><span>Runbook</span><select value={rbId} onChange={(e) => setRbId(e.target.value)}><option value="">Select…</option>
              {runbooks.filter((r) => r.enabled).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.category}</option>)}</select></label>
            {rb && <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 4 }}>{rb.steps.map((s, i) => (
              <li key={i}>{s.name} <span className="cell-sub">· {STEP_META[s.type]?.label}{STEP_META[s.type]?.live ? "" : " (dry run)"}</span></li>))}</ol>}
          </Card>
          <Card title="2 · Link an incident (optional)" icon="fa-fire">
            <label className="field"><span>Open incident</span><select value={incId} onChange={(e) => setIncId(e.target.value)}><option value="">None</option>
              {incidents.map((t) => <option key={t.id} value={t.id}>{t.number} · {t.title}</option>)}</select></label>
            {incId && (() => { const t = incidents.find((x) => String(x.id) === incId); return t ? <div className="cell-sub"><PriorityBadge p={t.priority} /> {t.ciName ?? ""} — the run's result will be posted as a work note.</div> : null; })()}
          </Card>
          <button className="btn primary" style={{ justifyContent: "center", padding: 12 }} disabled={!rb || exec.isPending} onClick={run}>
            {exec.isPending ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-play" />} Run &amp; verify</button>
        </div>
        <Card title="3 · Result" icon="fa-clipboard-check">
          {!result ? <div className="empty-card"><i className="fa-solid fa-clipboard-check" />Run a runbook to see each step and the verification outcome.</div> : <>
            <div className={`banner ${verified ? "ok" : result.status === "failed" ? "err" : "warn"}`} style={{ marginBottom: 12 }}>
              <i className={`fa-solid ${verified ? "fa-circle-check" : "fa-triangle-exclamation"}`} />
              <div><b>{verified ? "Verified — all checks pass" : result.status === "failed" ? "Verification failed" : "No verification steps in this runbook"}</b>
                <div>{result.stepResults.filter((s) => s.status === "skipped").length} change step(s) recorded as dry run.</div></div>
            </div>
            <ExecutionSteps steps={result.stepResults} />
            {incId && <Link className="btn" style={{ marginTop: 12 }} to={`/tickets/${incId}`}>Open incident</Link>}
          </>}
        </Card>
      </div>
      {svc && <p className="cell-sub">Service health shown above is the live value: <span className={`pill ${HEALTH_TONE[svc.health]}`}>{HEALTH_LABEL[svc.health]}</span></p>}
      {toast}
    </div>
  );
}
