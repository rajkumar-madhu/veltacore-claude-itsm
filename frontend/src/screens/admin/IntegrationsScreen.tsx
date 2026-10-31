import React from "react";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Modal } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";

interface Integration { id: number; name: string; kind: string; description: string; baseUrl: string; status: string; lastChecked: string | null; detail: string; enabled: boolean }

const ICON: Record<string, string> = { metrics: "fa-fire-flame-curved", dashboards: "fa-chart-line", monitoring: "fa-table-list", automation: "fa-bolt", virtualization: "fa-cubes",
  itsm: "fa-ticket", chat: "fa-comments", identity: "fa-id-badge", hardware: "fa-server" };
const TONE: Record<string, string> = { connected: "ok", error: "crit", not_configured: "muted" };

export default function IntegrationsScreen() {
  const { data, isError, isLoading, refetch } = useItsmList<Integration>("/integrations/");
  const [edit, setEdit] = React.useState<Integration | null>(null);
  const [url, setUrl] = React.useState("");
  const [testing, setTesting] = React.useState<number | null>(null);
  const [toast, setToast] = useToast();
  const patch = useItsmMutation<{ id: number; baseUrl: string; enabled: boolean }>("PATCH", (v) => `/integrations/${v.id}/`, ({ baseUrl, enabled }) => ({ baseUrl, enabled }));
  const test = useItsmMutation<number, Integration>("POST", (id) => `/integrations/${id}/test/`, () => ({}));

  function runTest(i: Integration) {
    setTesting(i.id);
    test.mutate(i.id, {
      onSuccess: (r) => setToast({ kind: r.status === "connected" ? "ok" : "err", text: `${r.name}: ${r.status === "connected" ? "connected" : r.status.replace("_", " ")}${r.detail ? ` — ${r.detail}` : ""}` }),
      onError: (e) => setToast({ kind: "err", text: e.message }), onSettled: () => setTesting(null),
    });
  }
  const all = data ?? [];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Administration" }, { label: "Integrations" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-puzzle-piece" /><div><h1 className="page-title">Integrations</h1>
          <div className="page-sub">Connect external tools. Testing makes a real request to the configured URL.</div></div></div>
      </div>
      <div className="kpi-strip">
        <div className="kpi"><div className="l">Integrations</div><div className="v">{all.length || "—"}</div></div>
        <div className="kpi tone-ok"><div className="l">Connected</div><div className="v">{all.filter((i) => i.status === "connected").length}</div></div>
        <div className={`kpi${all.some((i) => i.status === "error") ? " tone-crit" : ""}`}><div className="l">Errors</div><div className="v">{all.filter((i) => i.status === "error").length}</div></div>
        <div className="kpi"><div className="l">Not configured</div><div className="v">{all.filter((i) => i.status === "not_configured").length}</div></div>
      </div>
      {isError ? <ApiDown what="integrations" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
        <div className="catalog-grid">
          {all.map((i) => (
            <div key={i.id} className="catalog-card">
              <div className="cc-top"><span className="cc-icon"><i className={`fa-solid ${ICON[i.kind] ?? "fa-plug"}`} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b>{i.name}</b><div className="cell-sub">{i.kind}</div></div>
                <span className={`pill ${TONE[i.status]}`}>{i.status.replace("_", " ")}</span></div>
              <p className="cell-sub cc-desc" style={{ margin: 0 }}>{i.description}</p>
              <div className="cell-sub mono" style={{ overflowWrap: "anywhere" }}>{i.baseUrl || "No URL configured"}</div>
              <div className="cc-meta"><span>{i.lastChecked ? `Checked ${ago(i.lastChecked)}` : "Never tested"}</span>{i.detail && <span title={i.detail} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.detail}</span>}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => { setEdit(i); setUrl(i.baseUrl); patch.reset(); }}><i className="fa-solid fa-gear" /> Configure</button>
                <button className="btn primary" style={{ flex: 1 }} disabled={testing === i.id} onClick={() => runTest(i)}>{testing === i.id ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-plug" />} Test</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={`Configure ${edit.name}`} onClose={() => setEdit(null)} footer={<>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" disabled={patch.isPending} onClick={() => patch.mutate({ id: edit.id, baseUrl: url.trim(), enabled: !!url.trim() }, {
            onSuccess: () => { setEdit(null); runTest({ ...edit, baseUrl: url.trim() }); },
          })}>Save &amp; test</button>
        </>}>
          <p className="modal-text">{edit.description}</p>
          <label className="field"><span>Base URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tool.example.internal/" /></label>
          <p className="cell-sub">Only http/https URLs are accepted, and link-local addresses are blocked. Credentials aren't stored here — reachability is what the test verifies.</p>
          {patch.error && <div className="field-error">{patch.error.message}</div>}
        </Modal>
      )}
      {toast}
    </div>
  );
}
