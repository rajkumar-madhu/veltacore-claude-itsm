import React from "react";
import { useNavigate } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Modal } from "@/components/ui";
import { ResourceForm, type FieldDef, type FormValues } from "@/components/resource/ResourceForm";
import { useToast } from "@/lib/useToast";

interface CatalogItem {
  id: number; name: string; category: string; description: string; icon: string; fulfillmentDays: number; approvalRequired: boolean;
  formFields: { key: string; label: string; type: string; options?: string[]; required?: boolean }[]; active: boolean; openRequests: number;
}

const ITEM_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true }, { key: "category", label: "Category", required: true },
  { key: "description", label: "Description", type: "textarea" }, { key: "icon", label: "Icon (Font Awesome)", placeholder: "fa-box" },
  { key: "fulfillmentDays", label: "Fulfilment (days)", type: "number", min: 0 }, { key: "approvalRequired", label: "Requires approval", type: "checkbox" },
  { key: "active", label: "Active", type: "checkbox" },
  { key: "formFields", label: "Form fields (JSON)", type: "json", help: 'e.g. [{"key":"os","label":"OS","type":"select","options":["RHEL 9"],"required":true}]' },
];

export default function CatalogScreen() {
  const navigate = useNavigate();
  const { data, isError, refetch } = useItsmList<CatalogItem>("/catalog/");
  const order = useItsmMutation<{ id: number; answers: Record<string, string>; notes: string; priority: string }, { id: number; number: string }>(
    "POST", (v) => `/catalog/${v.id}/order/`, ({ answers, notes, priority }) => ({ answers, notes, priority }));
  const save = useItsmMutation<{ id?: number; body: Record<string, unknown> }>("POST", () => "/catalog/", (v) => v.body);
  const patch = useItsmMutation<{ id: number; body: Record<string, unknown> }>("PATCH", (v) => `/catalog/${v.id}/`, (v) => v.body);
  const [toast, setToast] = useToast();
  const [cat, setCat] = React.useState("");
  const [q, setQ] = React.useState("");
  const [ordering, setOrdering] = React.useState<CatalogItem | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [priority, setPriority] = React.useState("P3");
  const [editing, setEditing] = React.useState<CatalogItem | "new" | null>(null);

  if (isError) return <div className="page"><ApiDown what="the catalog" retry={() => refetch()} /></div>;
  const items = (data ?? []).filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set((data ?? []).map((i) => i.category))].sort();

  function open(i: CatalogItem) { setOrdering(i); setAnswers({}); setNotes(""); setPriority("P3"); order.reset(); }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Service Desk" }, { label: "Service Catalog" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-store" /><div><h1 className="page-title">Service Catalog</h1><div className="page-sub">Request standard services — each request becomes a tracked ticket with an SLA</div></div></div>
        <button className="btn" onClick={() => setEditing("new")}><i className="fa-solid fa-plus" /> New catalog item</button>
      </div>
      <div className="card filter-bar">
        <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={!cat ? "active" : ""} onClick={() => setCat("")}>All</button>
          {cats.map((c) => <button key={c} className={cat === c ? "active" : ""} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      </div>
      <div className="catalog-grid">
        {items.map((i) => (
          <div key={i.id} className={`catalog-card card${i.active ? "" : " inactive"}`}>
            <div className="cc-top"><span className="cc-icon"><i className={`fa-solid ${i.icon}`} /></span>
              <div style={{ flex: 1 }}><b>{i.name}</b><div className="cell-sub">{i.category}</div></div>
              <button className="icon-btn" title="Edit item" onClick={() => setEditing(i)}><i className="fa-solid fa-pen" /></button></div>
            <p className="cell-sub cc-desc">{i.description}</p>
            <div className="cc-meta"><span><i className="fa-regular fa-clock" /> {i.fulfillmentDays}d</span><span>{i.approvalRequired ? "Approval required" : "Auto-approved"}</span>
              {i.openRequests > 0 && <span className="link">{i.openRequests} open</span>}</div>
            <button className="btn primary" disabled={!i.active} onClick={() => open(i)}>{i.active ? "Request" : "Unavailable"}</button>
          </div>
        ))}
        {!items.length && <div className="empty-row">No services match.</div>}
      </div>

      {ordering && (
        <Modal title={`Request: ${ordering.name}`} onClose={() => setOrdering(null)} footer={<>
          <button className="btn" onClick={() => setOrdering(null)}>Cancel</button>
          <button className="btn primary" disabled={order.isPending} onClick={() => order.mutate({ id: ordering.id, answers, notes, priority }, {
            onSuccess: (t) => { setOrdering(null); setToast({ kind: "ok", text: `${t.number} created` }); navigate(`/tickets/${t.id}`); },
          })}>{order.isPending && <i className="fa-solid fa-spinner fa-spin" />} Submit request</button>
        </>}>
          <p className="modal-text">{ordering.description} Target fulfilment: {ordering.fulfillmentDays} day(s){ordering.approvalRequired ? ", after approval" : ""}.</p>
          {ordering.formFields.map((f) => (
            <label key={f.key} className="field"><span>{f.label}{f.required && <b className="req"> *</b>}</span>
              {f.type === "select" ? <select required={f.required} value={answers[f.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}><option value="">Select…</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
                : <input required={f.required} type={f.type === "number" ? "number" : "text"} value={answers[f.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} />}
            </label>
          ))}
          <div className="field-row">
            <label className="field"><span>Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value)}>{["P1", "P2", "P3", "P4"].map((p) => <option key={p}>{p}</option>)}</select></label>
          </div>
          <label className="field"><span>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {order.error && <div className="field-error">{order.error.message}</div>}
        </Modal>
      )}
      {editing && (
        <ResourceForm title={editing === "new" ? "New catalog item" : `Edit ${editing.name}`} fields={ITEM_FIELDS}
          initial={editing === "new" ? { active: true, approvalRequired: true, fulfillmentDays: 2, icon: "fa-box", formFields: [] } : (editing as unknown as FormValues)}
          busy={save.isPending || patch.isPending} error={(editing === "new" ? save.error : patch.error) ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(v) => editing === "new"
            ? save.mutate({ body: v }, { onSuccess: () => { setEditing(null); setToast({ kind: "ok", text: "Catalog item created" }); } })
            : patch.mutate({ id: editing.id, body: v }, { onSuccess: () => { setEditing(null); setToast({ kind: "ok", text: "Catalog item updated" }); } })} />
      )}
      {toast}
    </div>
  );
}
