import React from "react";
import { Link } from "react-router-dom";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { SeverityPill } from "@/components/itsmBadges";
import { Modal } from "@/components/ui";
import { itsmFetch } from "@/api/itsm";
import { ago, pairs } from "@/lib/itsmFmt";

interface Rule extends Row {
  id: number; name: string; matchSeverity: string; matchSource: string; matchText: string; runbook: number; runbookName: string;
  enabled: boolean; lastTriggered: string | null; triggerCount: number;
}
interface Alert { id: number; title: string; severity: string; target: string; source: string; startedAt: string }

export default function WorkflowsScreen() {
  const [preview, setPreview] = React.useState<{ rule: Rule; alerts: Alert[] | null; error?: string } | null>(null);

  function openPreview(rule: Rule) {
    setPreview({ rule, alerts: null });
    itsmFetch<Alert[]>("GET", `/rules/${rule.id}/preview/`).then((alerts) => setPreview({ rule, alerts })).catch((e: Error) => setPreview({ rule, alerts: [], error: e.message }));
  }

  const cfg: ResourceConfig<Rule> = {
    title: "Workflows", subtitle: "When an alert matching these conditions fires, the linked runbook runs automatically", icon: "fa-diagram-successor",
    crumbs: [{ label: "Home", to: "/" }, { label: "Automation" }, { label: "Workflows" }],
    path: "/rules/", createLabel: "Workflow", canDelete: true, defaults: { enabled: true },
    search: (r) => `${r.name} ${r.matchText} ${r.matchSource} ${r.runbookName}`,
    kpis: (rows) => [
      { label: "Workflows", value: rows.length, sub: `${rows.filter((r) => r.enabled).length} enabled` },
      { label: "Total triggers", value: rows.reduce((s, r) => s + r.triggerCount, 0) },
      { label: "Triggered in last 24h", value: rows.filter((r) => r.lastTriggered && Date.now() - new Date(r.lastTriggered).getTime() < 86_400_000).length },
    ],
    filters: [{ key: "enabled", label: "State", options: [{ value: "true", label: "Enabled" }, { value: "false", label: "Disabled" }] }],
    columns: [
      { key: "name", label: "Workflow", render: (r) => <b>{r.name}</b> },
      { key: "when", label: "When an alert…", render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {r.matchSeverity ? <SeverityPill s={r.matchSeverity} /> : <span className="pill muted">any severity</span>}
          <span className="pill muted">{r.matchSource ? `from ${r.matchSource}` : "any source"}</span>
          {r.matchText && <span className="pill muted">contains “{r.matchText}”</span>}
        </div>) },
      { key: "runbookName", label: "…run", render: (r) => <Link className="link" onClick={(e) => e.stopPropagation()} to="/automation/runbooks"><i className="fa-solid fa-book" /> {r.runbookName}</Link> },
      { key: "triggerCount", label: "Triggers", render: (r) => <>{r.triggerCount}<div className="cell-sub">{r.lastTriggered ? `last ${ago(r.lastTriggered)}` : "never"}</div></> },
      { key: "enabled", label: "State", render: (r) => <span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span> },
    ],
    rowActions: [{ label: "Preview matches", icon: "fa-eye", run: (r) => openPreview(r) }],
    fields: [
      { key: "name", label: "Name", required: true, wide: true },
      { key: "matchSeverity", label: "Severity", type: "select", options: pairs([["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]]), help: "Leave empty for any severity" },
      { key: "matchSource", label: "Source", placeholder: "prometheus, snmp… (empty = any)" },
      { key: "matchText", label: "Title / target contains", placeholder: "OMS" },
      { key: "runbook", label: "Runbook to run", type: "select", required: true, optionsFrom: { path: "/runbooks/", value: "id", label: (r) => String(r.name) } },
      { key: "enabled", label: "Enabled", type: "checkbox" },
    ],
    transform: (v) => ({ ...v, matchSeverity: v.matchSeverity ?? "" }),
  };
  return <>
    <ResourcePage cfg={cfg} />
    {preview && (
      <Modal title={`Currently firing alerts matched by “${preview.rule.name}”`} onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>Close</button>}>
        {preview.error ? <div className="field-error">{preview.error}</div> : !preview.alerts ? <div className="loading">Loading…</div> : !preview.alerts.length
          ? <div className="empty-card"><i className="fa-solid fa-filter" />No firing alert matches right now.</div>
          : <ul className="stat-list">{preview.alerts.map((a) => <li key={a.id}><span><b>{a.title}</b><div className="cell-sub">{a.source} · {a.target} · {ago(a.startedAt)}</div></span><SeverityPill s={a.severity} /></li>)}</ul>}
        {!preview.rule.enabled && <p className="cell-sub">This workflow is disabled, so it won't act on these alerts until enabled.</p>}
      </Modal>
    )}
  </>;
}
