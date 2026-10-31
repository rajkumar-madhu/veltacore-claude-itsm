import React from "react";
import { Link } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Modal } from "@/components/ui";
import { ConfirmModal } from "@/screens/device/deviceCommon";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";
import { ExecutionSteps } from "./ExecutionSteps";
import { EXEC_TONE, STEP_META, STEP_TYPES, type Execution, type Runbook, type Step } from "./automationMeta";

type Draft = { id?: number; name: string; category: string; description: string; enabled: boolean; steps: Step[] };
const blank: Draft = { name: "", category: "", description: "", enabled: true, steps: [{ name: "Check service health", type: "http_check", target: "" }] };

function StepsEditor({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) {
  const set = (i: number, patch: Partial<Step>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const n = [...steps]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  return (
    <div className="steps-editor">
      {steps.map((s, i) => (
        <div key={i} className="step-row">
          <span className="cell-sub">{i + 1}.</span>
          <select aria-label={`Step ${i + 1} type`} value={s.type} onChange={(e) => set(i, { type: e.target.value })}>
            {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}{t.live ? "" : " (dry run)"}</option>)}
          </select>
          <div style={{ display: "grid", gap: 6 }}>
            <input aria-label={`Step ${i + 1} name`} placeholder="Step name" value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
            {s.type === "wait"
              ? <input aria-label={`Step ${i + 1} seconds`} type="number" min={1} max={5} placeholder="Seconds (1–5)" value={String(s.params?.seconds ?? "")} onChange={(e) => set(i, { params: { seconds: Number(e.target.value) } })} />
              : <input aria-label={`Step ${i + 1} target`} placeholder={STEP_META[s.type]?.placeholder} value={s.target ?? ""} onChange={(e) => set(i, { target: e.target.value })} />}
          </div>
          <div style={{ display: "flex", gap: 2 }} className="row-actions">
            <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><i className="fa-solid fa-arrow-up" /></button>
            <button type="button" title="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><i className="fa-solid fa-arrow-down" /></button>
            <button type="button" title="Remove step" className="danger" disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))}><i className="fa-solid fa-trash" /></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...steps, { name: "", type: "http_check", target: "" }])}><i className="fa-solid fa-plus" /> Add step</button>
    </div>
  );
}

export default function RunbooksScreen() {
  const { data, isError, isLoading, refetch } = useItsmList<Runbook>("/runbooks/");
  const [toast, setToast] = useToast();
  const [q, setQ] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [result, setResult] = React.useState<Execution | null>(null);
  const [del, setDel] = React.useState<Runbook | null>(null);
  const [running, setRunning] = React.useState<number | null>(null);
  const exec = useItsmMutation<number, Execution>("POST", (id) => `/runbooks/${id}/execute/`, () => ({}));
  const create = useItsmMutation<Draft>("POST", () => "/runbooks/");
  const update = useItsmMutation<Draft>("PATCH", (d) => `/runbooks/${d.id}/`);
  const remove = useItsmMutation<number>("DELETE", (id) => `/runbooks/${id}/`);
  const save = draft?.id ? update : create;

  const rows = (data ?? []).filter((r) => !q || `${r.name} ${r.category} ${r.description}`.toLowerCase().includes(q.toLowerCase()));

  function run(r: Runbook) {
    setRunning(r.id);
    exec.mutate(r.id, { onSuccess: (e) => setResult(e), onError: (e) => setToast({ kind: "err", text: e.message }), onSettled: () => setRunning(null) });
  }
  function submit() {
    if (!draft) return;
    const steps = draft.steps.map((s) => (s.type === "wait" ? { name: s.name, type: s.type, params: s.params ?? { seconds: 1 } } : { name: s.name, type: s.type, target: s.target ?? "" }));
    save.mutate({ ...draft, steps }, { onSuccess: () => { setToast({ kind: "ok", text: `${draft.name} saved` }); setDraft(null); } });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Automation" }, { label: "Runbooks" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-book" /><div><h1 className="page-title">Runbooks</h1>
          <div className="page-sub">Step-by-step remediation procedures. Checks run for real; changes run as a dry run until an execution agent is connected.</div></div></div>
        <div className="detail-actions">
          <Link className="btn" to="/automation/executions"><i className="fa-solid fa-clock-rotate-left" /> Executions</Link>
          <button className="btn primary" onClick={() => { create.reset(); update.reset(); setDraft({ ...blank, steps: [...blank.steps] }); }}><i className="fa-solid fa-plus" /> New Runbook</button>
        </div>
      </div>
      <div className="card filter-bar">
        <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search runbooks…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {isError ? <ApiDown what="runbooks" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
        <div className="catalog-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {rows.map((r) => (
            <div key={r.id} className={`catalog-card${r.enabled ? "" : " inactive"}`}>
              <div className="cc-top"><span className="cc-icon"><i className="fa-solid fa-book" /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b><div className="cell-sub">{r.category}{!r.enabled && " · disabled"}</div></div>
                <div className="row-actions" style={{ display: "flex" }}>
                  <button title="Edit" onClick={() => { create.reset(); update.reset(); setDraft({ id: r.id, name: r.name, category: r.category, description: r.description, enabled: r.enabled, steps: r.steps.map((s) => ({ ...s })) }); }}><i className="fa-solid fa-pen" /></button>
                  <button title="Delete" className="danger" onClick={() => setDel(r)}><i className="fa-solid fa-trash" /></button>
                </div></div>
              <p className="cell-sub cc-desc" style={{ margin: 0 }}>{r.description}</p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, display: "grid", gap: 3 }}>
                {r.steps.map((s, i) => (
                  <li key={i}><i className={`fa-solid ${STEP_META[s.type]?.icon ?? "fa-circle"}`} style={{ color: "var(--muted)", width: 16 }} /> {s.name}
                    {!STEP_META[s.type]?.live && <span className="pill muted" style={{ marginLeft: 6, fontSize: 10 }}>dry run</span>}</li>
                ))}
              </ol>
              <div className="cc-meta">
                <span>{r.lastExecution ? <>Last run {ago(r.lastExecution.startedAt)} · <span className={`pill ${EXEC_TONE[r.lastExecution.status]}`}>{r.lastExecution.status}</span></> : "Never run"}</span>
              </div>
              <button className="btn primary" disabled={!r.enabled || running === r.id} onClick={() => run(r)}>
                {running === r.id ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-play" />} Run runbook</button>
            </div>
          ))}
          {!rows.length && <div className="empty-row">No runbooks match.</div>}
        </div>
      )}

      {draft && (
        <Modal wide title={draft.id ? `Edit ${draft.name}` : "New runbook"} onClose={() => setDraft(null)} footer={<>
          <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn primary" disabled={save.isPending || !draft.name.trim() || !draft.category.trim()} onClick={submit}>Save</button>
        </>}>
          <div className="field-row">
            <label className="field"><span>Name *</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="field"><span>Category *</span><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Trading" /></label>
          </div>
          <label className="field"><span>Description</span><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="field check"><span><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Enabled</span></label>
          <div className="section-title" style={{ marginTop: 6 }}>Steps</div>
          <StepsEditor steps={draft.steps} onChange={(steps) => setDraft({ ...draft, steps })} />
          {save.error && <div className="field-error" style={{ marginTop: 8 }}>{save.error.message}</div>}
        </Modal>
      )}
      {result && (
        <Modal wide title={`${result.runbookName} — execution #${result.id}`} onClose={() => setResult(null)} footer={<>
          <Link className="btn" to="/automation/executions">All executions</Link>
          <button className="btn primary" onClick={() => setResult(null)}>Done</button>
        </>}>
          <div className={`banner ${result.status === "success" ? "ok" : "err"}`} style={{ marginBottom: 12 }}>
            <i className={`fa-solid ${result.status === "success" ? "fa-circle-check" : "fa-circle-xmark"}`} />
            <div><b>{result.status === "success" ? "All executed steps passed" : "One or more steps failed"}</b>
              <div>{result.stepResults.filter((s) => s.status === "skipped").length} step(s) recorded as dry run — no execution agent is connected.</div></div>
          </div>
          <ExecutionSteps steps={result.stepResults} />
        </Modal>
      )}
      {del && <ConfirmModal title="Delete runbook" danger text={`Delete ${del.name}? Workflows that use it are deleted too.`} busy={remove.isPending} onClose={() => setDel(null)}
        onConfirm={() => remove.mutate(del.id, { onSuccess: () => { setToast({ kind: "ok", text: `${del.name} deleted` }); setDel(null); }, onError: (e) => { setToast({ kind: "err", text: e.message }); setDel(null); } })} />}
      {toast}
    </div>
  );
}
