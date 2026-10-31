import React from "react";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { useToast } from "@/lib/useToast";

interface Setting { id: number; key: string; value: string; valueType: "text" | "number" | "bool" | "choice"; choices: string[]; group: string; description: string; applied: boolean }

function Editor({ s, value, onChange }: { s: Setting; value: string; onChange: (v: string) => void }) {
  if (s.valueType === "bool") return <label className="switch-line"><input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} /> {value === "true" ? "On" : "Off"}</label>;
  if (s.valueType === "choice") return <select className="select-sm" value={value} onChange={(e) => onChange(e.target.value)}>{s.choices.map((c) => <option key={c}>{c}</option>)}</select>;
  return <input className="select-sm" style={{ width: s.valueType === "number" ? 120 : 280 }} type={s.valueType === "number" ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export default function SettingsScreen() {
  const { data, isError, isLoading, refetch } = useItsmList<Setting>("/settings/");
  const [edits, setEdits] = React.useState<Record<number, string>>({});
  const [errors, setErrors] = React.useState<Record<number, string>>({});
  const [toast, setToast] = useToast();
  const save = useItsmMutation<{ id: number; value: string }>("PATCH", (v) => `/settings/${v.id}/`, (v) => ({ value: v.value }));

  const groups = [...new Set((data ?? []).map((s) => s.group))];
  const dirty = Object.entries(edits).filter(([id, v]) => data?.find((s) => s.id === Number(id))?.value !== v);

  async function saveAll() {
    const errs: Record<number, string> = {};
    for (const [id, value] of dirty) {
      try { await save.mutateAsync({ id: Number(id), value }); }
      catch (e) { errs[Number(id)] = (e as Error).message.replace(/^value: /, ""); }
    }
    setErrors(errs);
    setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => errs[Number(id)])));
    const ok = dirty.length - Object.keys(errs).length;
    setToast(Object.keys(errs).length ? { kind: "err", text: `${ok} saved, ${Object.keys(errs).length} rejected` } : { kind: "ok", text: `${ok} setting${ok === 1 ? "" : "s"} saved` });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Administration" }, { label: "System Settings" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-gear" /><div><h1 className="page-title">System Settings</h1>
          <div className="page-sub">Platform-wide configuration, validated on save. Settings marked “not yet applied” are stored for upcoming features.</div></div></div>
        <div className="detail-actions">
          {dirty.length > 0 && <button className="btn" onClick={() => { setEdits({}); setErrors({}); }}>Discard</button>}
          <button className="btn primary" disabled={!dirty.length || save.isPending} onClick={saveAll}>{save.isPending && <i className="fa-solid fa-spinner fa-spin" />} Save {dirty.length ? `(${dirty.length})` : ""}</button>
        </div>
      </div>
      {isError ? <ApiDown what="settings" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : groups.map((g) => (
        <Card key={g} title={g} className="mt" bodyPad={false}>
          <table className="list compact"><tbody>
            {(data ?? []).filter((s) => s.group === g).map((s) => (
              <tr key={s.id}>
                <td style={{ width: "45%" }}><b>{s.description || s.key}</b><div className="cell-sub mono">{s.key}{!s.applied && <span className="pill muted" style={{ marginLeft: 8, fontFamily: "inherit" }} title="Saved, but no part of the platform reads this setting yet">stored · not yet applied</span>}</div></td>
                <td><Editor s={s} value={edits[s.id] ?? s.value} onChange={(v) => setEdits({ ...edits, [s.id]: v })} />
                  {edits[s.id] !== undefined && edits[s.id] !== s.value && <span className="pill info" style={{ marginLeft: 8 }}>changed</span>}
                  {errors[s.id] && <div className="field-error">{errors[s.id]}</div>}</td>
              </tr>
            ))}
          </tbody></table>
        </Card>
      ))}
      {toast}
    </div>
  );
}
