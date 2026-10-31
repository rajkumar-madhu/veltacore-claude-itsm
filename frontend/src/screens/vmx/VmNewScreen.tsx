import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { Breadcrumbs, Card, InfoTable } from "@/components/ui";
import type { VmTemplate } from "./VmTemplatesScreen";

interface CatalogItem { id: number; name: string; approvalRequired: boolean; fulfillmentDays: number; active: boolean }

export default function VmNewScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: templates = [] } = useItsmList<VmTemplate>("/vm-templates/");
  const { data: catalog = [] } = useItsmList<CatalogItem>("/catalog/");
  const sites = useItsmList<{ id: string; name: string }>("/sites/").data ?? [];
  const item = catalog.find((c) => c.name === "New Virtual Machine");
  const [f, setF] = React.useState({ template: params.get("template") ?? "", name: "", purpose: "", environment: "Production", site: "", vcpu: "", memory: "", disk: "", priority: "P3" });
  const tpl = templates.find((t) => String(t.id) === f.template);
  const order = useItsmMutation<Record<string, unknown>, { id: number; number: string }>("POST", () => `/catalog/${item?.id}/order/`);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  React.useEffect(() => { if (tpl) setF((p) => ({ ...p, vcpu: String(tpl.vcpu), memory: String(tpl.memoryGb), disk: String(tpl.diskGb) })); }, [tpl]);

  const nameOk = /^[A-Za-z][A-Za-z0-9-]{1,30}$/.test(f.name);
  const valid = !!tpl && nameOk && f.purpose.trim().length >= 5 && Number(f.vcpu) >= 1 && Number(f.memory) >= 1 && Number(f.disk) >= 1;

  function submit() {
    if (!tpl || !item) return;
    order.mutate({
      priority: f.priority,
      answers: { os: tpl.os, vcpu: f.vcpu, memory: f.memory, purpose: f.purpose },
      notes: [`VM name: ${f.name.toUpperCase()}`, `Template: ${tpl.name} (${tpl.platform})`, `Disk: ${f.disk} GB`, `Environment: ${f.environment}`,
        f.site ? `Site: ${sites.find((s) => s.id === f.site)?.name ?? f.site}` : ""].filter(Boolean).join("\n"),
    }, { onSuccess: (t) => navigate(`/tickets/${t.id}`) });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Virtual Machines" }, { label: "Add VM" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-circle-plus" /><div><h1 className="page-title">Request a Virtual Machine</h1>
        <div className="page-sub">Pick a standard template and size it — this raises a tracked service request{item?.approvalRequired ? " that needs approval" : ""}</div></div></div></div>
      <div className="banner info" style={{ marginBottom: 14 }}><i className="fa-solid fa-circle-info" /><div>No hypervisor is connected for automated provisioning, so the VM is built by the Infra team when the request is fulfilled
        {item ? ` (target ${item.fulfillmentDays} day${item.fulfillmentDays === 1 ? "" : "s"})` : ""}. Once built and onboarded, it appears in the VM list automatically.</div></div>
      <div className="ticket-grid">
        <Card title="Configuration">
          <div className="section-title" style={{ marginTop: 0 }}>Template</div>
          <div className="catalog-grid" style={{ marginTop: 0, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {templates.map((t) => (
              <button key={t.id} type="button" className={`catalog-card${f.template === String(t.id) ? " selected" : ""}`} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => set("template", String(t.id))}>
                <b className="mono">{t.name}</b><span className="cell-sub">{t.os} · {t.platform}</span><span className="cell-sub">{t.vcpu} vCPU · {t.memoryGb} GB · {t.diskGb} GB</span>
              </button>
            ))}
          </div>
          <div className="section-title">Details</div>
          <div className="field-row">
            <label className="field"><span>VM name *</span><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VM-APP-03" />
              {f.name && !nameOk && <em className="field-error">Letters, digits and dashes; must start with a letter.</em>}</label>
            <label className="field"><span>Environment</span><select value={f.environment} onChange={(e) => set("environment", e.target.value)}>{["Production", "DR", "UAT", "Development"].map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label className="field"><span>Purpose *</span><input value={f.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="Second OMS consumer node for market open load" /></label>
          <div className="field-row">
            <label className="field"><span>vCPU</span><input type="number" min={1} max={128} value={f.vcpu} onChange={(e) => set("vcpu", e.target.value)} /></label>
            <label className="field"><span>Memory (GB)</span><input type="number" min={1} value={f.memory} onChange={(e) => set("memory", e.target.value)} /></label>
            <label className="field"><span>Disk (GB)</span><input type="number" min={1} value={f.disk} onChange={(e) => set("disk", e.target.value)} /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Site</span><select value={f.site} onChange={(e) => set("site", e.target.value)}><option value="">Any</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>Priority</span><select value={f.priority} onChange={(e) => set("priority", e.target.value)}>{["P1", "P2", "P3", "P4"].map((p) => <option key={p}>{p}</option>)}</select></label>
          </div>
        </Card>
        <div className="stack">
          <Card title="Summary">
            <InfoTable rows={[["Template", tpl ? tpl.name : "—"], ["OS", tpl?.os ?? "—"], ["Platform", tpl?.platform ?? "—"], ["Name", f.name ? f.name.toUpperCase() : "—"],
              ["Size", f.vcpu ? `${f.vcpu} vCPU · ${f.memory} GB · ${f.disk} GB` : "—"], ["Environment", f.environment]]} />
            {!item && <div className="field-error">The “New Virtual Machine” catalog item is missing — add it in the Service Catalog.</div>}
            {order.error && <div className="field-error">{order.error.message}</div>}
            <button className="btn primary" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} disabled={!valid || !item || order.isPending} onClick={submit}>
              {order.isPending && <i className="fa-solid fa-spinner fa-spin" />} Submit request</button>
            <Link className="btn" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} to="/vms/templates">Manage templates</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
