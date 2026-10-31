import React from "react";
import { useCreateDomain, useDeleteDomain, useDomains, type DomainRow, type Health } from "@/api/hooks";
import { ApiDown, Card, Modal } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { DomainDetails, HealthBadge, type DomainTab } from "./DomainDetails";
import { HEALTH_META, METRICS, domainCellStatus, fmtMetric } from "./heatmapMeta";

const PAGE_SIZE = 8;

function useClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function AddDomainModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateDomain();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const fields = (create.error as (Error & { fields?: Record<string, string[]> }) | null)?.fields;
  const submit = () => create.mutate({ name, description }, { onSuccess: (d) => onCreated(d.id) });
  return (
    <Modal title="Add Domain" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={submit} disabled={!name.trim() || create.isPending}>{create.isPending && <i className="fa-solid fa-spinner fa-spin" />} Add Domain</button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) submit(); }}>
        <label className={`field${fields?.name ? " has-error" : ""}`}><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} autoFocus placeholder="Payments" />
          {fields?.name && <em className="field-error">{fields.name.join(" ")}</em>}</label>
        <label className="field"><span>Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Card, UPI and settlement services" /></label>
        {create.error && !fields && <div className="field-error">{create.error.message}</div>}
        <p className="cell-sub">Services are attached to a domain when their monitors report under it; a new domain shows as Unknown until then.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Cell({ h, title }: { h: Health; title: string }) {
  return <td className="hm-cell"><span className={`hm-box ${h}`} title={title} /></td>;
}

export default function HeatmapScreen() {
  const { data, isLoading, isError, refetch } = useDomains();
  const del = useDeleteDomain();
  const now = useClock();
  const [toast, setToast] = useToast();
  const [domainFilter, setDomainFilter] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("");
  const [hostFilter, setHostFilter] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [asList, setAsList] = React.useState(false);
  const [selected, setSelected] = React.useState<string>();
  const [detailTab, setDetailTab] = React.useState<DomainTab>("overview");
  const [adding, setAdding] = React.useState(false);
  const [menuFor, setMenuFor] = React.useState<string>();
  const [page, setPage] = React.useState(0);
  const heatRef = React.useRef<HTMLDivElement>(null);
  const detailRef = React.useRef<HTMLDivElement>(null);

  const domains = data ?? [];
  const selId = selected ?? domains.find((d) => d.health === "crit")?.id ?? domains[0]?.id;
  const allServices = domains.flatMap((d) => d.services);
  const hosts = [...new Set(allServices.map((s) => s.host).filter(Boolean))].sort();

  const filtered: DomainRow[] = domains
    .filter((d) => !domainFilter || d.id === domainFilter)
    .map((d) => ({ ...d, services: d.services.filter((s) => (!serviceFilter || s.name === serviceFilter) && (!hostFilter || s.host === hostFilter)) }))
    .filter((d) => d.services.length || (!serviceFilter && !hostFilter));

  const counts: Record<Health, number> = { ok: 0, warn: 0, crit: 0, unknown: 0 };
  domains.forEach((d) => counts[d.health]++);
  const pages = Math.max(1, Math.ceil(domains.length / PAGE_SIZE));
  const pageRows = domains.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function select(id: string, tab: DomainTab = "overview") {
    setSelected(id); setDetailTab(tab);
  }

  function showTopology() {
    setDetailTab("topology");
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function remove(d: DomainRow) {
    setMenuFor(undefined);
    del.mutate(d.id, {
      onSuccess: () => { setToast({ kind: "ok", text: `${d.name} deleted` }); if (selected === d.id) setSelected(undefined); },
      onError: (e) => setToast({ kind: "err", text: e.message }),
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Heatmap</h1><div className="page-sub">Service and infrastructure health at a glance</div></div>
        <div className="live"><span className="live-dot" /> LIVE <span className="cell-sub" style={{ marginLeft: 14 }}>{now.toLocaleString([], { dateStyle: "medium", timeStyle: "medium", hour12: false })}</span></div>
      </div>

      {isError ? <ApiDown what="domains" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading heatmap…</div> : (<>
        <div className="card filter-bar">
          <select className="select-sm" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">All Domains</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select className="select-sm" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            <option value="">All Services</option>{[...new Set(allServices.map((s) => s.name))].sort().map((n) => <option key={n}>{n}</option>)}</select>
          <select className="select-sm" value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>
            <option value="">All Hosts</option>{hosts.map((h) => <option key={h}>{h}</option>)}</select>
          <div className="hm-legend">{(Object.keys(HEALTH_META) as Health[]).map((h) => (
            <span key={h}><span className="dot" style={{ background: HEALTH_META[h].color }} />{HEALTH_META[h].label}</span>))}</div>
          <div className="filter-actions">
            <button className="btn" onClick={() => setAsList((v) => !v)}><i className={`fa-solid ${asList ? "fa-table-cells" : "fa-list"}`} /> {asList ? "View as Heatmap" : "View as List"}</button>
            <button className="btn" onClick={showTopology}><i className="fa-solid fa-diagram-project" /> View Topology</button>
            <button className="btn" aria-label="Full screen" onClick={() => heatRef.current?.requestFullscreen?.()}><i className="fa-solid fa-expand" /></button>
          </div>
        </div>

        <div className="hm-layout">
          <div ref={heatRef} className="card hm-card">
            <div className="table-wrap">
              {asList ? (
                <table className="list compact">
                  <thead><tr><th>Domain</th><th>Service</th><th>Host</th><th>Health</th>{METRICS.map((m) => <th key={m.key}>{m.label}</th>)}</tr></thead>
                  <tbody>{filtered.flatMap((d) => d.services.map((s) => (
                    <tr key={s.id} className="row-clickable" onClick={() => select(d.id)}><td>{d.name}</td><td className="cell-strong">{s.name}</td><td className="mono">{s.host}</td><td><HealthBadge h={s.health} /></td>
                      {METRICS.map((m) => <td key={m.key} className={`${s.statuses[m.key]}-text`}>{fmtMetric(m.key, s.values[m.key])}</td>)}</tr>
                  )))}</tbody>
                </table>
              ) : (
                <table className="hm-table">
                  <thead><tr><th>Domain / Service</th>{METRICS.map((m) => <th key={m.key}>{m.label}</th>)}</tr></thead>
                  <tbody>{filtered.map((d) => (
                    <React.Fragment key={d.id}>
                      <tr className="hm-domain" onClick={() => select(d.id)}>
                        <td><button className="icon-btn" aria-label={collapsed[d.id] ? "Expand" : "Collapse"} onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [d.id]: !c[d.id] })); }}>
                          <i className={`fa-solid fa-chevron-${collapsed[d.id] ? "right" : "down"}`} /></button> {d.name}</td>
                        {METRICS.map((m) => { const h = domainCellStatus(d.services, m.key); return <Cell key={m.key} h={h} title={`${d.name} · ${m.label}: ${HEALTH_META[h].label}`} />; })}
                      </tr>
                      {!collapsed[d.id] && d.services.map((s) => (
                        <tr key={s.id} className={`hm-svc${selId === d.id ? " sel" : ""}`} onClick={() => select(d.id)}>
                          <td>{s.name}</td>
                          {METRICS.map((m) => <Cell key={m.key} h={s.statuses[m.key]} title={`${s.name} · ${m.label}: ${fmtMetric(m.key, s.values[m.key])} (${HEALTH_META[s.statuses[m.key]].label})`} />)}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}</tbody>
                </table>
              )}
              {!filtered.length && <div className="empty-row">Nothing matches these filters.</div>}
            </div>
          </div>

          <div className="stack">
            <Card title={<span className="dom-title">Domains</span>} right={<button className="btn primary" onClick={() => setAdding(true)}><i className="fa-solid fa-plus" /> Add Domain</button>}>
              <div className="cell-sub" style={{ marginTop: -8, marginBottom: 12 }}>Business domains and their service health</div>
              <div className="dom-kpis">
                <div className="dom-kpi"><span className="dk-icon info"><i className="fa-solid fa-chart-column" /></span><div><span>Total Domains</span><b>{domains.length}</b></div></div>
                {(["ok", "warn", "crit", "unknown"] as Health[]).map((h) => (
                  <div key={h} className="dom-kpi"><span className={`dk-icon ${h}`}><i className={`fa-solid ${HEALTH_META[h].icon}`} /></span><div><span>{HEALTH_META[h].label}</span><b>{counts[h]}</b></div></div>
                ))}
              </div>
              <div className="table-wrap"><table className="list compact">
                <thead><tr><th>Domain</th><th>Description</th><th>Services</th><th>Health Status</th><th>Availability</th><th>Error Rate</th><th>p95 Latency</th><th>Actions</th></tr></thead>
                <tbody>{pageRows.map((d) => (
                  <tr key={d.id} className={`row-clickable${selId === d.id ? " row-sel" : ""}`} onClick={() => select(d.id)}>
                    <td className="link nowrap"><i className={`fa-solid ${d.icon}`} /> {d.name}</td><td className="cell-sub">{d.description}</td><td>{d.serviceCount}</td>
                    <td><HealthBadge h={d.health} /></td><td>{d.availability != null ? `${d.availability}%` : "—"}</td>
                    <td className={d.errorRate != null && d.errorRate >= 1 ? "crit-text" : ""}>{d.errorRate != null ? `${d.errorRate}%` : "—"}</td>
                    <td className={d.latencyP95Ms != null && d.latencyP95Ms >= 600 ? "crit-text" : d.latencyP95Ms != null && d.latencyP95Ms >= 300 ? "warn-text" : ""}>{d.latencyP95Ms != null ? `${d.latencyP95Ms} ms` : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="menu-wrap"><button className="icon-btn" aria-label="Actions" onClick={() => setMenuFor(menuFor === d.id ? undefined : d.id)}><i className="fa-solid fa-ellipsis" /></button>
                        {menuFor === d.id && <div className="menu" onMouseLeave={() => setMenuFor(undefined)}>
                          <button onClick={() => { setMenuFor(undefined); select(d.id); }}><i className="fa-solid fa-eye" /> View details</button>
                          <button onClick={() => { setMenuFor(undefined); select(d.id, "incidents"); }}><i className="fa-solid fa-triangle-exclamation" /> Incidents</button>
                          <button disabled={d.serviceCount > 0} title={d.serviceCount ? "Only empty domains can be deleted" : ""} onClick={() => remove(d)}><i className="fa-solid fa-trash" /> Delete</button>
                        </div>}</div>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="pager">
                <span className="cell-sub">Showing {domains.length ? page * PAGE_SIZE + 1 : 0} to {Math.min(domains.length, (page + 1) * PAGE_SIZE)} of {domains.length} domains</span>
                <div><button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left" /></button>
                  <span className="page-no">{page + 1}</span>
                  <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><i className="fa-solid fa-chevron-right" /></button></div>
              </div>
            </Card>
            <div ref={detailRef}>{selId && <DomainDetails id={selId} tab={detailTab} setTab={setDetailTab} />}</div>
          </div>
        </div>
      </>)}
      {adding && <AddDomainModal onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); select(id); setToast({ kind: "ok", text: "Domain added" }); }} />}
      {toast}
    </div>
  );
}
