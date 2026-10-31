import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useItsmGet } from "@/api/itsm";
import { Breadcrumbs, Card } from "@/components/ui";
import { ago } from "@/lib/itsmFmt";

interface Hit { kind: string; ts: string; title: string; detail: string; link: string }
const KIND: Record<string, [string, string]> = {
  ticket: ["fa-ticket", "Tickets"], alert: ["fa-bell", "Alerts"], ci: ["fa-cube", "Configuration items"], log: ["fa-file-lines", "Logs"],
  event: ["fa-list", "Events"], incident: ["fa-fire", "Domain incidents"], device: ["fa-network-wired", "Devices"], vm: ["fa-cube", "VMs"],
};

export default function InvestigationScreen() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const hours = params.get("hours") ?? "168";
  const [input, setInput] = React.useState(q);
  const [kind, setKind] = React.useState("");
  React.useEffect(() => setInput(q), [q]);
  const { data, isLoading, error } = useItsmGet<Hit[]>(q.length >= 2 ? `/search/?q=${encodeURIComponent(q)}&hours=${hours}` : null);
  const hits = (data ?? []).filter((h) => !kind || h.kind === kind).sort((a, b) => b.ts.localeCompare(a.ts));
  const kinds = [...new Set((data ?? []).map((h) => h.kind))];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Investigate" }, { label: "Investigation" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-magnifying-glass" /><div><h1 className="page-title">Investigation</h1>
        <div className="page-sub">One search across tickets, alerts, CIs, logs and events — results on a single timeline</div></div></div></div>
      <form className="big-search" onSubmit={(e) => { e.preventDefault(); setParams({ q: input.trim(), hours }); setKind(""); }}>
        <input aria-label="Search" autoFocus placeholder="Host, service, error text, ticket number…" value={input} onChange={(e) => setInput(e.target.value)} />
        <select className="select-sm" aria-label="Time range" value={hours} onChange={(e) => setParams({ q, hours: e.target.value })}>
          {[["24", "Last 24h"], ["168", "Last 7 days"], ["720", "Last 30 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn primary" disabled={input.trim().length < 2}>Search</button>
      </form>
      {!q ? <div className="card empty-card"><i className="fa-solid fa-magnifying-glass" />Try “OMS”, “NCE-SW-01”, “timeout” or a ticket number.</div> : <>
        {kinds.length > 0 && <div className="pill-tabs"><button className={!kind ? "active" : ""} onClick={() => setKind("")}>All ({data?.length})</button>
          {kinds.map((k) => <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{KIND[k]?.[1] ?? k} ({data?.filter((h) => h.kind === k).length})</button>)}</div>}
        <Card title={isLoading ? "Searching…" : `${hits.length} result${hits.length === 1 ? "" : "s"} for “${q}”`} icon="fa-timeline">
          {error && <div className="field-error">{error.message}</div>}
          {!isLoading && !hits.length && !error && <div className="cell-sub">Nothing matched.</div>}
          <ul className="timeline">{hits.map((h, i) => (
            <li key={i}><span className="tl-icon"><i className={`fa-solid ${KIND[h.kind]?.[0] ?? "fa-circle"}`} /></span>
              <div><div className="tl-head"><b>{KIND[h.kind]?.[1] ?? h.kind}</b><span>{ago(h.ts)}</span></div>
                <div className="tl-body"><Link className="link" to={h.link}>{h.title}</Link><div className="cell-sub">{h.detail}</div></div></div></li>
          ))}</ul>
        </Card>
      </>}
    </div>
  );
}
