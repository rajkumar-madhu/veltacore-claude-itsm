import React from "react";
import { Link, useParams } from "react-router-dom";
import { useItsmGet, useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card, InfoTable, Modal } from "@/components/ui";
import { ResourceForm, type FormValues } from "@/components/resource/ResourceForm";
import { PriorityBadge, SlaBadge, StatePill } from "@/components/itsmBadges";
import { useToast } from "@/lib/useToast";
import { ago, dateTone, fmtDate, relDays } from "@/lib/itsmFmt";
import { formatShort } from "@/lib/series";
import { TopologyGraph, type GEdge, type GNode } from "./TopologyGraph";
import { CI_FIELDS, CI_SOURCE, CI_STATUS, CI_STATUS_TONE, REL_LABEL, REL_TYPES, classColor, type Ci } from "./cmdbMeta";

interface CiDetail extends Ci {
  relationships: { id: number; relType: string; direction: "in" | "out"; ciId: number; name: string; ciClass: string; status: string }[];
  tickets: { id: number; number: string; ticketType: string; title: string; state: string; priority: string; slaStatus: string; createdAt: string }[];
  assets: { id: number; assetTag: string; name: string; assetType: string; status: string; warrantyEnd: string | null; eolDate: string | null }[];
}

const SOURCE_LINK: Record<string, (id: string) => string | null> = {
  device: (id) => (/^\d+$/.test(id) ? `/devices/${id}` : null),
  vm: (id) => `/vms/${id}`,
  service: () => "/heatmap",
};

export default function CiDetailScreen() {
  const { id } = useParams();
  const { data: ci, isError, isLoading, refetch } = useItsmGet<CiDetail>(`/cis/${id}/`);
  const { data: graph } = useItsmGet<{ nodes: GNode[]; edges: GEdge[] }>(`/cis/graph/?root=${id}&depth=2`);
  const { data: allCis = [] } = useItsmList<Ci>("/cis/");
  const [toast, setToast] = useToast();
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [rel, setRel] = React.useState({ relType: "depends_on", other: "", direction: "out" });
  const patch = useItsmMutation<FormValues>("PATCH", () => `/cis/${id}/`);
  const addRel = useItsmMutation<{ source: number; target: number; relType: string }>("POST", () => "/relationships/");
  const delRel = useItsmMutation<number>("DELETE", (rid) => `/relationships/${rid}/`);

  if (isError) return <div className="page"><ApiDown what="this configuration item" retry={() => refetch()} /></div>;
  if (isLoading || !ci) return <div className="page"><div className="loading">Loading…</div></div>;

  const srcLink = SOURCE_LINK[ci.source]?.(ci.sourceId) ?? null;
  const attrs = Object.entries(ci.attributes ?? {});

  function submitRel() {
    const other = Number(rel.other);
    const body = rel.direction === "out" ? { source: ci!.id, target: other, relType: rel.relType } : { source: other, target: ci!.id, relType: rel.relType };
    addRel.mutate(body, {
      onSuccess: () => { setAdding(false); setRel({ relType: "depends_on", other: "", direction: "out" }); setToast({ kind: "ok", text: "Relationship added" }); },
    });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "CMDB" }, { label: "Configuration Items", to: "/cmdb/cis" }, { label: ci.name }]} />
      <div className="detail-head">
        <div className="detail-icon" style={{ background: `${classColor(ci.ciClass)}1a`, color: classColor(ci.ciClass) }}><i className="fa-solid fa-cube" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="detail-title">{ci.name} <span className={`pill ${CI_STATUS_TONE[ci.status] ?? "muted"}`}>{CI_STATUS.find((s) => s.value === ci.status)?.label}</span> <PriorityBadge p={ci.criticality} /></div>
          <div className="detail-sub"><span className="mono">{ci.ciId}</span><span>{ci.ciClass}</span><span>{ci.environment}</span><span>Updated {ago(ci.updatedAt)}</span></div>
        </div>
        <div className="detail-actions">
          {srcLink && <Link className="btn" to={srcLink}><i className="fa-solid fa-arrow-up-right-from-square" /> Open source record</Link>}
          <Link className="btn" to={`/cmdb/topology?root=${ci.id}&depth=2`}><i className="fa-solid fa-diagram-project" /> Topology</Link>
          <button className="btn primary" onClick={() => setEditing(true)}><i className="fa-solid fa-pen" /> Edit</button>
        </div>
      </div>

      <div className="ticket-grid">
        <div className="stack">
          <Card title="Dependencies" icon="fa-diagram-project" bodyPad={false}>
            {graph && graph.nodes.length > 1 ? <TopologyGraph nodes={graph.nodes} edges={graph.edges} rootId={ci.id} height={380} />
              : <div className="empty-card"><i className="fa-solid fa-diagram-project" />No relationships yet — add one below.</div>}
          </Card>
          <Card title={`Relationships (${ci.relationships.length})`} icon="fa-link" right={<button className="link-btn" onClick={() => setAdding(true)}><i className="fa-solid fa-plus" /> Add</button>} bodyPad={false}>
            <table className="list compact"><thead><tr><th>Direction</th><th>Relationship</th><th>Related CI</th><th>Status</th><th /></tr></thead>
              <tbody>
                {ci.relationships.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-sub nowrap"><i className={`fa-solid fa-arrow-${r.direction === "out" ? "right-from-bracket" : "right-to-bracket"}`} /> {r.direction === "out" ? "Outgoing" : "Incoming"}</td>
                    <td className="cell-sub">{r.direction === "out" ? "This CI" : r.name} <span className="pill info">{REL_LABEL[r.relType] ?? r.relType}</span> {r.direction === "out" ? r.name : "this CI"}</td>
                    <td><Link className="link" to={`/cmdb/cis/${r.ciId}`}>{r.name}</Link><div className="cell-sub">{r.ciClass}</div></td>
                    <td><span className={`pill ${CI_STATUS_TONE[r.status] ?? "muted"}`}>{r.status}</span></td>
                    <td className="row-actions"><button className="danger" title="Remove relationship" disabled={delRel.isPending}
                      onClick={() => delRel.mutate(r.id, { onSuccess: () => setToast({ kind: "ok", text: "Relationship removed" }), onError: (e) => setToast({ kind: "err", text: e.message }) })}><i className="fa-solid fa-trash" /></button></td>
                  </tr>
                ))}
                {!ci.relationships.length && <tr><td colSpan={5} className="empty-row">No relationships.</td></tr>}
              </tbody></table>
          </Card>
          <Card title={`Tickets (${ci.tickets.length})`} icon="fa-ticket" bodyPad={false}>
            <table className="list compact"><thead><tr><th>Number</th><th>Title</th><th>Priority</th><th>State</th><th>SLA</th><th>Opened</th></tr></thead>
              <tbody>
                {ci.tickets.map((t) => (
                  <tr key={t.id}><td><Link className="link mono" to={`/tickets/${t.id}`}>{t.number}</Link></td><td>{t.title}</td><td><PriorityBadge p={t.priority} /></td>
                    <td><StatePill state={t.state} /></td><td><SlaBadge s={t.slaStatus} /></td><td className="cell-sub">{formatShort(t.createdAt)}</td></tr>
                ))}
                {!ci.tickets.length && <tr><td colSpan={6} className="empty-row">No tickets reference this CI.</td></tr>}
              </tbody></table>
          </Card>
        </div>
        <div className="stack">
          <Card title="Details">
            <InfoTable rows={[
              ["CI ID", <span className="mono">{ci.ciId}</span>], ["Class", ci.ciClass], ["Environment", ci.environment],
              ["Site", ci.siteName ?? "—"], ["IP address", ci.ip ? <span className="mono">{ci.ip}</span> : "—"], ["Owner", ci.owner || "—"],
              ["Source", `${CI_SOURCE[ci.source] ?? ci.source}${ci.sourceId ? ` · ${ci.sourceId}` : ""}`],
            ]} />
          </Card>
          {attrs.length > 0 && <Card title="Attributes"><InfoTable rows={attrs.map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])} /></Card>}
          <Card title={`Assets (${ci.assets.length})`} icon="fa-box">
            {ci.assets.length ? <ul className="stat-list">{ci.assets.map((a) => (
              <li key={a.id}><span><Link className="link mono" to={`/assets?q=${a.assetTag}`}>{a.assetTag}</Link><div className="cell-sub">{a.assetType} · {a.status.replace("_", " ")}</div></span>
                <span style={{ textAlign: "right" }}><span className={`pill ${dateTone(a.warrantyEnd)}`}>Warranty {fmtDate(a.warrantyEnd)}</span><div className="cell-sub">{relDays(a.warrantyEnd)}</div></span></li>
            ))}</ul> : <div className="cell-sub">No hardware asset linked.</div>}
          </Card>
        </div>
      </div>

      {editing && (
        <ResourceForm title={`Edit ${ci.name}`} fields={CI_FIELDS} editing initial={ci as unknown as FormValues} busy={patch.isPending} error={patch.error ?? null}
          onClose={() => { setEditing(false); patch.reset(); }}
          onSubmit={(v) => patch.mutate(v, { onSuccess: () => { setEditing(false); setToast({ kind: "ok", text: `${ci.name} updated` }); } })} />
      )}
      {adding && (
        <Modal title="Add relationship" onClose={() => { setAdding(false); addRel.reset(); }} footer={<>
          <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
          <button className="btn primary" disabled={!rel.other || addRel.isPending} onClick={submitRel}>Add</button>
        </>}>
          <label className="field"><span>Direction</span>
            <select value={rel.direction} onChange={(e) => setRel({ ...rel, direction: e.target.value })}>
              <option value="out">{ci.name} → other CI</option><option value="in">Other CI → {ci.name}</option>
            </select></label>
          <label className="field"><span>Relationship</span>
            <select value={rel.relType} onChange={(e) => setRel({ ...rel, relType: e.target.value })}>{REL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label className="field"><span>Other CI</span>
            <select value={rel.other} onChange={(e) => setRel({ ...rel, other: e.target.value })}><option value="">Select…</option>
              {allCis.filter((c) => c.id !== ci.id).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ciClass})</option>)}</select></label>
          {addRel.error && <div className="field-error">{addRel.error.message}</div>}
        </Modal>
      )}
      {toast}
    </div>
  );
}
