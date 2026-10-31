import React from "react";
import { Link, useParams } from "react-router-dom";
import { useItsmGet, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, InfoTable, Modal } from "@/components/ui";
import { PriorityBadge, SeverityPill, SlaBadge, StatePill } from "@/components/itsmBadges";
import { stateLabel } from "@/lib/status";
import { formatDateTime, formatShort } from "@/lib/series";
import { useToast } from "@/lib/useToast";
import type { Ticket } from "./TicketsScreen";

interface TicketDetail extends Ticket {
  activity: { id: number; ts: string; author: string; kind: string; body: string }[];
  transitions: string[];
  alerts: { id: number; title: string; severity: string; status: string }[];
}

const TYPE_LABEL: Record<string, [string, string]> = { incident: ["Incidents", "fa-fire"], problem: ["Problems", "fa-bug"], change: ["Changes", "fa-code-pull-request"], request: ["Service Requests", "fa-inbox"] };
const NEEDS_NOTE = new Set(["resolved", "rejected", "cancelled", "on_hold"]);
const ACTIVITY_ICON: Record<string, string> = { comment: "fa-comment", work_note: "fa-lock", state: "fa-arrow-right-arrow-left", system: "fa-gear" };

function ExtraEditor({ t, onSave, busy }: { t: TicketDetail; onSave: (extra: Record<string, string>) => void; busy: boolean }) {
  const keys = t.ticketType === "problem" ? [["rootCause", "Root cause"], ["workaround", "Workaround"]]
    : t.ticketType === "change" ? [["risk", "Risk"], ["impact", "Impact"], ["plannedStart", "Planned start"], ["plannedEnd", "Planned end"], ["backoutPlan", "Backout plan"]] : [];
  const [vals, setVals] = React.useState<Record<string, string>>(() => Object.fromEntries(keys.map(([k]) => [k, String(t.extra?.[k] ?? "")])));
  const [editing, setEditing] = React.useState(false);
  if (!keys.length) return null;
  const isDate = (k: string) => k.startsWith("planned");
  return (
    <Card title={t.ticketType === "problem" ? "Root Cause & Workaround" : "Change Plan"} right={!editing
      ? <button className="link-btn" onClick={() => setEditing(true)}><i className="fa-solid fa-pen" /> Edit</button>
      : <div style={{ display: "flex", gap: 6 }}><button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn sm primary" disabled={busy} onClick={() => { onSave(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, isDate(k) && v ? new Date(v).toISOString() : v]))); setEditing(false); }}>Save</button></div>}>
      {editing ? keys.map(([k, label]) => (
        <label key={k} className="field"><span>{label}</span>
          {isDate(k) ? <input type="datetime-local" value={vals[k] ? vals[k].slice(0, 16) : ""} onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))} />
            : k === "risk" || k === "impact" ? <select value={vals[k]} onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))}><option value="">—</option>{["Low", "Medium", "High"].map((x) => <option key={x}>{x}</option>)}</select>
            : <textarea rows={2} value={vals[k]} onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))} />}
        </label>
      )) : <InfoTable rows={keys.map(([k, label]) => [label, t.extra?.[k] ? (isDate(k) ? formatDateTime(String(t.extra[k])) : String(t.extra[k])) : <span className="muted-text">Not set</span>])} />}
    </Card>
  );
}

export default function TicketDetailScreen() {
  const { id = "" } = useParams();
  const { data: t, isLoading, isError, refetch } = useItsmGet<TicketDetail>(`/tickets/${id}/`);
  const transition = useItsmMutation<{ to: string; note: string }, TicketDetail>("POST", () => `/tickets/${id}/transition/`);
  const comment = useItsmMutation<{ body: string; kind: string }, TicketDetail>("POST", () => `/tickets/${id}/comment/`);
  const patch = useItsmMutation<Record<string, unknown>, TicketDetail>("PATCH", () => `/tickets/${id}/`);
  const [toast, setToast] = useToast();
  const [pending, setPending] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<"comment" | "work_note">("comment");
  const [assign, setAssign] = React.useState<string | null>(null);

  if (isLoading) return <div className="page"><div className="loading">Loading…</div></div>;
  if (isError || !t) return <div className="page"><ApiDown what="this ticket" retry={() => refetch()} /></div>;
  const [listLabel, icon] = TYPE_LABEL[t.ticketType];
  const onErr = (e: Error) => setToast({ kind: "err", text: e.message });

  function doTransition(to: string, n = "") {
    transition.mutate({ to, note: n }, { onSuccess: () => { setPending(null); setNote(""); setToast({ kind: "ok", text: `Moved to ${stateLabel(to)}` }); }, onError: onErr });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Service Desk" }, { label: listLabel, to: `/tickets?type=${t.ticketType}` }, { label: t.number }]} />
      <div className="detail-head">
        <div className="detail-icon"><i className={`fa-solid ${icon}`} /></div>
        <div className="detail-meta">
          <div className="detail-title"><h1 className="mono" style={{ fontSize: 22 }}>{t.number}</h1><StatePill state={t.state} /><PriorityBadge p={t.priority} /><SlaBadge s={t.slaStatus} /></div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{t.title}</div>
          <div className="detail-sub"><span>Opened {formatShort(t.createdAt)}</span><span>Updated {formatShort(t.updatedAt)}</span>
            {t.slaDue && <span>SLA due {formatShort(t.slaDue)}</span>}{t.resolvedAt && <span>Resolved {formatShort(t.resolvedAt)}</span>}</div>
        </div>
        <div className="detail-right">
          <div className="detail-actions">
            {t.transitions.map((to) => (
              <button key={to} className={`btn${["resolved", "approved", "implemented", "fulfilled", "closed"].includes(to) ? " primary" : ["rejected", "cancelled"].includes(to) ? " danger" : ""}`}
                disabled={transition.isPending} onClick={() => (NEEDS_NOTE.has(to) ? setPending(to) : doTransition(to))}>{stateLabel(to)}</button>
            ))}
            {!t.transitions.length && <span className="cell-sub">Final state — no further transitions</span>}
          </div>
        </div>
      </div>

      <div className="ticket-grid">
        <div className="stack">
          <Card title="Details" right={<button className="link-btn" onClick={() => setAssign(t.assignee)}><i className="fa-solid fa-user-pen" /> Reassign</button>}>
            <InfoTable rows={[
              ["Type", stateLabel(t.ticketType)], ["Category", t.category || "—"], ["Assignment group", t.assignmentGroup || "—"],
              ["Assigned to", t.assignee || <span className="warn-text">Unassigned</span>], ["Requester", t.requester || "—"],
              ["Configuration item", t.ci ? <Link className="link" to={`/cmdb/cis/${t.ci}`}>{t.ciName}</Link> : "—"],
              ["Business domain", t.domainName ?? "—"], ...(t.catalogItemName ? [["Catalog item", t.catalogItemName] as [string, React.ReactNode]] : []),
            ]} />
            {t.description && <p className="desc">{t.description}</p>}
          </Card>
          <ExtraEditor t={t} busy={patch.isPending} onSave={(extra) => patch.mutate({ extra }, { onSuccess: () => setToast({ kind: "ok", text: "Saved" }), onError: onErr })} />
          {t.ticketType === "request" && t.extra?.answers ? (
            <Card title="Request Details"><InfoTable rows={Object.entries(t.extra.answers as Record<string, string>).map(([k, v]) => [k, v || "—"])} /></Card>
          ) : null}
          {t.alerts.length > 0 && (
            <Card title={`Linked Alerts (${t.alerts.length})`} bodyPad={false}>
              <table className="list compact"><tbody>{t.alerts.map((a) => (
                <tr key={a.id}><td><SeverityPill s={a.severity} /></td><td>{a.title}</td><td><StatePill state={a.status} /></td></tr>
              ))}</tbody></table>
            </Card>
          )}
        </div>

        <Card title="Activity">
          <div className="composer">
            <div className="seg small">
              <button className={kind === "comment" ? "active" : ""} onClick={() => setKind("comment")}><i className="fa-solid fa-comment" /> Comment</button>
              <button className={kind === "work_note" ? "active" : ""} onClick={() => setKind("work_note")}><i className="fa-solid fa-lock" /> Work note</button>
            </div>
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "comment" ? "Visible to the requester…" : "Internal note for the team…"} />
            <button className="btn primary sm" disabled={!body.trim() || comment.isPending} onClick={() => comment.mutate({ body, kind }, { onSuccess: () => setBody(""), onError: onErr })}>Post</button>
          </div>
          <ul className="timeline">{t.activity.map((a) => (
            <li key={a.id} className={a.kind}>
              <span className="tl-icon"><i className={`fa-solid ${ACTIVITY_ICON[a.kind]}`} /></span>
              <div><div className="tl-head"><b>{a.author}</b> <span className="cell-sub">{a.kind === "work_note" ? "work note · " : ""}{formatShort(a.ts)}</span></div>
                <div className="tl-body">{a.body}</div></div>
            </li>
          ))}</ul>
        </Card>
      </div>

      {pending && (
        <Modal title={`Move to ${stateLabel(pending)}`} onClose={() => setPending(null)} footer={<>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          <button className="btn primary" disabled={(pending === "resolved" && !note.trim()) || transition.isPending} onClick={() => doTransition(pending, note)}>Confirm</button>
        </>}>
          <label className="field"><span>{pending === "resolved" ? "Resolution note (required)" : "Note"}</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></label>
        </Modal>
      )}
      {assign !== null && (
        <Modal title="Reassign" onClose={() => setAssign(null)} footer={<>
          <button className="btn" onClick={() => setAssign(null)}>Cancel</button>
          <button className="btn primary" disabled={patch.isPending} onClick={() => patch.mutate({ assignee: assign }, { onSuccess: () => { setAssign(null); setToast({ kind: "ok", text: assign ? `Assigned to ${assign}` : "Unassigned" }); }, onError: onErr })}>Save</button>
        </>}>
          <label className="field"><span>Assignee</span><input value={assign} onChange={(e) => setAssign(e.target.value)} autoFocus placeholder="Name (empty to unassign)" /></label>
        </Modal>
      )}
      {toast}
    </div>
  );
}
