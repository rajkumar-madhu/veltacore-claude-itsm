import React from "react";
import { Link } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { Breadcrumbs, Card, InfoTable } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { ago } from "@/lib/itsmFmt";
import { STEP_META, type Runbook } from "./automationMeta";

interface Integration { id: number; name: string; status: string; baseUrl: string; lastChecked: string | null; detail: string; enabled: boolean }
interface Rule { id: number; name: string; matchSeverity: string; matchSource: string; matchText: string; runbookName: string; enabled: boolean }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const STATUS_TONE: Record<string, string> = { connected: "ok", error: "crit", not_configured: "muted" };

/** StackStorm connection settings plus a preview of how Argus runbooks and workflows map onto st2 actions and rules. */
export default function StackStormScreen() {
  const { data: integrations = [] } = useItsmList<Integration>("/integrations/");
  const { data: runbooks = [] } = useItsmList<Runbook>("/runbooks/");
  const { data: rules = [] } = useItsmList<Rule>("/rules/");
  const st2 = integrations.find((i) => i.name === "StackStorm");
  const [url, setUrl] = React.useState<string | null>(null);
  const [toast, setToast] = useToast();
  const patch = useItsmMutation<{ baseUrl: string; enabled: boolean }>("PATCH", () => `/integrations/${st2?.id}/`);
  const test = useItsmMutation<void, Integration>("POST", () => `/integrations/${st2?.id}/test/`, () => ({}));
  const value = url ?? st2?.baseUrl ?? "";

  function saveAndTest() {
    patch.mutate({ baseUrl: value.trim(), enabled: !!value.trim() }, {
      onSuccess: () => test.mutate(undefined, {
        onSuccess: (i) => setToast({ kind: i.status === "connected" ? "ok" : "err", text: i.status === "connected" ? `StackStorm reachable · ${i.detail}` : `StackStorm: ${i.detail}` }),
      }),
      onError: (e) => setToast({ kind: "err", text: e.message }),
    });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Automation" }, { label: "StackStorm" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-bolt" /><div><h1 className="page-title">StackStorm</h1>
          <div className="page-sub">Event-driven execution backend for runbooks that change systems</div></div></div>
      </div>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <Card title="Connection" icon="fa-plug">
          {st2 && <InfoTable rows={[
            ["Status", <span className={`pill ${STATUS_TONE[st2.status] ?? "muted"}`}>{st2.status.replace("_", " ")}</span>],
            ["Last checked", st2.lastChecked ? `${ago(st2.lastChecked)}${st2.detail ? ` · ${st2.detail}` : ""}` : "never"],
          ]} />}
          <label className="field" style={{ marginTop: 12 }}><span>StackStorm API URL</span>
            <input placeholder="https://st2.example.internal/api/v1/" value={value} onChange={(e) => setUrl(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={!st2 || patch.isPending || test.isPending} onClick={saveAndTest}>
              {(patch.isPending || test.isPending) && <i className="fa-solid fa-spinner fa-spin" />} Save &amp; test connection</button>
            <Link className="btn" to="/admin/integrations">All integrations</Link>
          </div>
          {patch.error && <div className="field-error">{patch.error.message}</div>}
          <p className="cell-sub">The test makes a real HTTP request to the URL. Until StackStorm is connected and an execution agent is registered,
            runbook steps that change systems (restarts, scripts, notifications) are recorded as dry runs.</p>
        </Card>
        <Card title="How Argus maps to StackStorm" icon="fa-shuffle">
          <ul className="stat-list">
            <li><span><b>Runbook</b> → st2 action chain</span><span className="cell-sub mono">argus.&lt;runbook&gt;</span></li>
            <li><span><b>Workflow</b> → st2 rule on the alert trigger</span><span className="cell-sub mono">argus.alert</span></li>
            <li><span><b>Alert</b> → trigger instance</span><span className="cell-sub">severity, source, title, target</span></li>
            <li><span><b>Execution result</b> → Argus execution log</span><span className="cell-sub">per-step status</span></li>
          </ul>
        </Card>
      </div>
      <Card title={`Actions (${runbooks.length})`} icon="fa-book" className="mt" bodyPad={false}>
        <div className="table-wrap"><table className="list compact">
          <thead><tr><th>Action ref</th><th>Runbook</th><th>Steps needing an agent</th><th>State</th></tr></thead>
          <tbody>{runbooks.map((r) => {
            const agent = r.steps.filter((s) => !STEP_META[s.type]?.live);
            return <tr key={r.id}><td className="mono">argus.{slug(r.name)}</td><td>{r.name}</td>
              <td className="cell-sub">{agent.length ? agent.map((s) => s.name).join(", ") : "none — fully runnable today"}</td>
              <td><span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span></td></tr>;
          })}</tbody>
        </table></div>
      </Card>
      <Card title={`Rules (${rules.length})`} icon="fa-diagram-successor" className="mt" bodyPad={false}>
        <div className="table-wrap"><table className="list compact">
          <thead><tr><th>Rule ref</th><th>Criteria</th><th>Action</th><th>State</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.id}><td className="mono">argus.{slug(r.name)}</td>
              <td className="cell-sub mono" style={{ fontSize: 11.5 }}>{[r.matchSeverity && `severity == "${r.matchSeverity}"`, r.matchSource && `source == "${r.matchSource}"`, r.matchText && `title contains "${r.matchText}"`].filter(Boolean).join(" && ") || "any alert"}</td>
              <td className="mono">argus.{slug(r.runbookName)}</td>
              <td><span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span></td></tr>
          ))}</tbody>
        </table></div>
      </Card>
      {toast}
    </div>
  );
}
