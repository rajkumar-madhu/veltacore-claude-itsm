import React from "react";
import { Link, useParams } from "react-router-dom";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, InfoTable } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { formatDateTime } from "@/lib/series";
import type { Rca } from "./RcaListScreen";

type Draft = Pick<Rca, "title" | "summary" | "impact" | "rootCause" | "timeline" | "actions" | "status">;
const STATUS = [["draft", "Draft"], ["review", "In review"]] as const;

export default function RcaDetailScreen() {
  const { id } = useParams();
  const { data: r, isError, isLoading, refetch } = useItsmGet<Rca>(`/rca/${id}/`);
  const [d, setD] = React.useState<Draft | null>(null);
  const [md, setMd] = React.useState<string | null>(null);
  const [toast, setToast] = useToast();
  const save = useItsmMutation<Partial<Draft>>("PATCH", () => `/rca/${id}/`);
  const publish = useItsmMutation<void>("POST", () => `/rca/${id}/publish/`, () => ({}));

  React.useEffect(() => { if (r) setD({ title: r.title, summary: r.summary, impact: r.impact, rootCause: r.rootCause, timeline: r.timeline, actions: r.actions, status: r.status }); }, [r]);
  if (isError) return <div className="page"><ApiDown what="this RCA" retry={() => refetch()} /></div>;
  if (isLoading || !r || !d) return <div className="page"><div className="loading">Loading…</div></div>;

  const locked = r.status === "published";
  const dirty = JSON.stringify(d) !== JSON.stringify({ title: r.title, summary: r.summary, impact: r.impact, rootCause: r.rootCause, timeline: r.timeline, actions: r.actions, status: r.status });
  const onErr = (e: Error) => setToast({ kind: "err", text: e.message });
  const setTl = (i: number, k: "ts" | "event", v: string) => setD({ ...d, timeline: d.timeline.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  const setAc = (i: number, patch: Partial<Rca["actions"][number]>) => setD({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  function showMd() { fetch(`/api/itsm/rca/${id}/markdown/`).then((x) => x.text()).then(setMd).catch(onErr); }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Analytics" }, { label: "RCA Reports", to: "/reports/rca" }, { label: r.number }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-magnifying-glass-chart" /><div>
          <h1 className="page-title">{r.number} <span className={`pill ${locked ? "ok" : r.status === "review" ? "warn" : "muted"}`}>{locked ? "Published" : r.status === "review" ? "In review" : "Draft"}</span></h1>
          <div className="page-sub">{r.title}</div></div></div>
        <div className="detail-actions">
          <button className="btn" onClick={showMd}><i className="fa-brands fa-markdown" /> Markdown</button>
          <a className="btn" href={`/api/itsm/rca/${id}/markdown/`}><i className="fa-solid fa-download" /> Download</a>
          {!locked && <button className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate(d, { onSuccess: () => setToast({ kind: "ok", text: "Saved" }), onError: onErr })}><i className="fa-solid fa-floppy-disk" /> Save</button>}
          {!locked && <button className="btn primary" disabled={dirty || publish.isPending} title={dirty ? "Save your changes first" : undefined}
            onClick={() => publish.mutate(undefined, { onSuccess: () => setToast({ kind: "ok", text: `${r.number} published` }), onError: onErr })}><i className="fa-solid fa-paper-plane" /> Publish</button>}
        </div>
      </div>
      <div className="ticket-grid">
        <div className="stack">
          <Card title="Analysis">
            <label className="field"><span>Title</span><input disabled={locked} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
            {([["summary", "Summary"], ["impact", "Impact"], ["rootCause", "Root cause"]] as const).map(([k, l]) => (
              <label key={k} className="field"><span>{l}{!locked && " *"}</span><textarea disabled={locked} rows={3} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>
            ))}
          </Card>
          <Card title="Timeline" icon="fa-timeline" right={!locked && <button className="link-btn" onClick={() => setD({ ...d, timeline: [...d.timeline, { ts: "", event: "" }] })}><i className="fa-solid fa-plus" /> Add event</button>}>
            {!d.timeline.length && <div className="cell-sub">No events yet.</div>}
            <div className="steps-editor">{d.timeline.map((t, i) => (
              <div key={i} className="inline-form">
                <input aria-label="Time" style={{ width: 120 }} disabled={locked} value={t.ts} placeholder="09:12" onChange={(e) => setTl(i, "ts", e.target.value)} />
                <input aria-label="Event" style={{ flex: 1 }} disabled={locked} value={t.event} placeholder="What happened" onChange={(e) => setTl(i, "event", e.target.value)} />
                {!locked && <button className="icon-btn" aria-label="Remove event" onClick={() => setD({ ...d, timeline: d.timeline.filter((_, j) => j !== i) })}><i className="fa-solid fa-trash" /></button>}
              </div>
            ))}</div>
          </Card>
          <Card title="Corrective actions" icon="fa-list-check" right={!locked && <button className="link-btn" onClick={() => setD({ ...d, actions: [...d.actions, { action: "", owner: "", due: "", done: false }] })}><i className="fa-solid fa-plus" /> Add action</button>}>
            {!d.actions.length && <div className="cell-sub">No actions yet.</div>}
            <div className="steps-editor">{d.actions.map((a, i) => (
              <div key={i} className="inline-form">
                <input type="checkbox" aria-label="Done" checked={a.done} disabled={locked} onChange={(e) => setAc(i, { done: e.target.checked })} />
                <input aria-label="Action" style={{ flex: 2 }} disabled={locked} value={a.action} placeholder="Action" onChange={(e) => setAc(i, { action: e.target.value })} />
                <input aria-label="Owner" style={{ flex: 1 }} disabled={locked} value={a.owner} placeholder="Owner" onChange={(e) => setAc(i, { owner: e.target.value })} />
                <input aria-label="Due" style={{ width: 120 }} disabled={locked} value={a.due} placeholder="Due" onChange={(e) => setAc(i, { due: e.target.value })} />
                {!locked && <button className="icon-btn" aria-label="Remove action" onClick={() => setD({ ...d, actions: d.actions.filter((_, j) => j !== i) })}><i className="fa-solid fa-trash" /></button>}
              </div>
            ))}</div>
          </Card>
        </div>
        <div className="stack">
          <Card title="Details">
            <InfoTable rows={[
              ["Problem", r.problem ? <Link className="link mono" to={`/tickets/${r.problem}`}>{r.problemNumber}</Link> : "—"],
              ["Incidents", r.incidents.length ? r.incidents.join(", ") : "—"], ["Author", r.author],
              ["Created", formatDateTime(r.createdAt)], ["Published", r.publishedAt ? formatDateTime(r.publishedAt) : "—"],
            ]} />
            {!locked && <label className="field" style={{ marginTop: 12 }}><span>Workflow status</span>
              <select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            {locked && <p className="cell-sub">Published reports are read-only.</p>}
          </Card>
          {md !== null && <Card title="Markdown" right={<button className="icon-btn" aria-label="Close" onClick={() => setMd(null)}><i className="fa-solid fa-xmark" /></button>}><div className="md-view">{md}</div></Card>}
        </div>
      </div>
      {toast}
    </div>
  );
}
