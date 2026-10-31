import React from "react";
import { useItsmList, type ApiError } from "@/api/itsm";
import { Modal } from "@/components/ui";

export type FieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "date" | "datetime" | "email" | "json";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
  options?: { value: string; label: string }[];
  /** Load select options from an ITSM list endpoint. */
  optionsFrom?: { path: string; value: string; label: (row: Record<string, unknown>) => string };
  allowEmpty?: boolean;
  help?: string;
  min?: number;
  max?: number;
  createOnly?: boolean;
}

export type FormValues = Record<string, unknown>;

function toInput(f: FieldDef, v: unknown): string | boolean {
  if (f.type === "checkbox") return !!v;
  if (f.type === "json") return v === undefined || v === null ? "" : JSON.stringify(v, null, 2);
  if (f.type === "datetime" && typeof v === "string" && v) return v.slice(0, 16);
  return v === undefined || v === null ? "" : String(v);
}

function fromInput(f: FieldDef, v: string | boolean): unknown {
  if (f.type === "checkbox") return v;
  const s = String(v);
  if (f.type === "number") return s === "" ? null : Number(s);
  if (f.type === "json") return s.trim() ? JSON.parse(s) : null;
  if ((f.type === "select" || f.type === "date" || f.type === "datetime") && s === "") return null;
  if (f.type === "datetime") return new Date(s).toISOString();
  return s;
}

function OptionsSelect({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const { data = [] } = useItsmList<Record<string, unknown>>(f.optionsFrom?.path ?? "/none/", {}, { enabled: !!f.optionsFrom });
  const opts = f.optionsFrom ? data.map((r) => ({ value: String(r[f.optionsFrom!.value]), label: f.optionsFrom!.label(r) })) : f.options ?? [];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={f.required}>
      {(f.allowEmpty || !f.required || !value) && <option value="">{f.required ? "Select…" : "—"}</option>}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ResourceForm({ title, fields, initial, onClose, onSubmit, busy, error, submitLabel = "Save", editing }: {
  title: string; fields: FieldDef[]; initial: FormValues; onClose: () => void; onSubmit: (v: FormValues) => void;
  busy: boolean; error: ApiError | null; submitLabel?: string; editing?: boolean;
}) {
  const shown = fields.filter((f) => !(editing && f.createOnly));
  const [vals, setVals] = React.useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(shown.map((f) => [f.key, toInput(f, initial[f.key])])));
  const [localErr, setLocalErr] = React.useState<Record<string, string>>({});
  const fieldErr = (k: string) => localErr[k] ?? error?.fields?.[k]?.join(" ");

  function submit() {
    const out: FormValues = {};
    const errs: Record<string, string> = {};
    for (const f of shown) {
      const raw = vals[f.key];
      if (f.required && f.type !== "checkbox" && String(raw ?? "").trim() === "") { errs[f.key] = `${f.label} is required.`; continue; }
      try { out[f.key] = fromInput(f, raw); } catch { errs[f.key] = "Invalid JSON."; }
    }
    setLocalErr(errs);
    if (!Object.keys(errs).length) onSubmit(out);
  }

  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={submit} disabled={busy}>{busy && <i className="fa-solid fa-spinner fa-spin" />} {submitLabel}</button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="form-grid">
          {shown.map((f) => {
            const err = fieldErr(f.key);
            const v = vals[f.key];
            const set = (nv: string | boolean) => setVals((p) => ({ ...p, [f.key]: nv }));
            return (
              <label key={f.key} className={`field${err ? " has-error" : ""}${f.wide || f.type === "textarea" || f.type === "json" ? " wide" : ""}${f.type === "checkbox" ? " check" : ""}`}>
                {f.type === "checkbox"
                  ? <span><input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} /> {f.label}</span>
                  : <span>{f.label}{f.required && <b className="req"> *</b>}</span>}
                {f.type === "textarea" && <textarea rows={3} value={String(v)} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />}
                {f.type === "json" && <textarea rows={8} className="mono" value={String(v)} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />}
                {(f.type === "select") && <OptionsSelect f={f} value={String(v)} onChange={set} />}
                {(!f.type || ["text", "number", "date", "datetime", "email"].includes(f.type)) && (
                  <input type={f.type === "datetime" ? "datetime-local" : f.type ?? "text"} value={String(v)} onChange={(e) => set(e.target.value)}
                    placeholder={f.placeholder} min={f.min} max={f.max} />)}
                {f.help && !err && <small className="cell-sub">{f.help}</small>}
                {err && <em className="field-error">{err}</em>}
              </label>
            );
          })}
        </div>
        {error && !error.fields && <div className="field-error">{error.message}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
