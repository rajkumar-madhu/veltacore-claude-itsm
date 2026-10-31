import React from "react";
import type { DeviceType, DiscoveryResult } from "@/api/hooks";
import { TYPE_LABEL } from "../device/deviceMeta";
import {
  ALERT_PROFILES, CRITICALITY, ENVIRONMENTS, INTERVALS, OS_TYPES, VENDORS, baseChecks,
  type Cmdb, type Errors, type FormState, type Monitoring,
} from "./onboardingMeta";

function Field({ label, required, error, children, wide }: { label: string; required?: boolean; error?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`field${error ? " has-error" : ""}${wide ? " wide" : ""}`}>
      <span>{label}{required && <b className="req"> *</b>}</span>
      {children}
      {error && <em className="field-error">{error}</em>}
    </label>
  );
}

export function DeviceForm({ f, set, errors, sites }: {
  f: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; errors: Errors; sites: { id: string; name: string }[];
}) {
  const inp = (k: keyof FormState) => ({ value: f[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value as never) });
  return (
    <div className="form-grid">
      <Field label="Device Type" required error={errors.deviceType}>
        <select {...inp("deviceType")}>{(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
      </Field>
      <Field label="Hostname" required error={errors.hostname}><input {...inp("hostname")} placeholder="e.g. NSE-APP-01" maxLength={63} autoFocus /></Field>
      <Field label="IP Address" required error={errors.ip}><input {...inp("ip")} placeholder="10.10.1.21" /></Field>
      <Field label="Management IP (Optional)" error={errors.mgmtIp}><input {...inp("mgmtIp")} placeholder="iDRAC / iLO / mgmt interface" /></Field>
      <Field label="Site / Location" required error={errors.site}>
        <select {...inp("site")}><option value="">Select site…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </Field>
      <Field label="Environment" required error={errors.environment}><select {...inp("environment")}>{ENVIRONMENTS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Vendor" error={errors.vendor}><select {...inp("vendor")}>{VENDORS.map((x) => <option key={x} value={x}>{x || "Select vendor…"}</option>)}</select></Field>
      <Field label="Model" error={errors.model}><input {...inp("model")} placeholder="PowerEdge R740" maxLength={64} /></Field>
      <Field label="OS Type" error={errors.osType}><select {...inp("osType")}>{OS_TYPES.map((x) => <option key={x} value={x}>{x || "Select OS…"}</option>)}</select></Field>
      <Field label="OS Version" error={errors.osVersion}><input {...inp("osVersion")} placeholder="RHEL 8.8" maxLength={48} /></Field>
      <Field label="Role / Purpose" error={errors.role}><input {...inp("role")} placeholder="Application Server" maxLength={64} /></Field>
      <Field label="Description" error={errors.description} wide><textarea rows={3} {...inp("description")} maxLength={240} placeholder="NSE trading application server - primary" /></Field>
    </div>
  );
}

export function ValidationStep({ f, discovery, discovering, hostnameTaken, ipTaken }: {
  f: FormState; discovery?: DiscoveryResult | null; discovering: boolean; hostnameTaken: boolean; ipTaken: boolean;
}) {
  const checks: { ok: boolean | null; label: string; detail: string }[] = [
    { ok: !hostnameTaken, label: "Hostname is unique", detail: hostnameTaken ? `${f.hostname.toUpperCase()} is already onboarded` : f.hostname.toUpperCase() },
    { ok: !ipTaken, label: "IP address not in use", detail: ipTaken ? `${f.ip} belongs to another device` : f.ip },
    { ok: discovering ? null : discovery ? discovery.reachable : null, label: "Device reachable", detail: discovering ? "scanning…" : discovery ? (discovery.reachable ? `${discovery.services.length} open service port(s)` : "no open ports answered — check firewall/ACLs") : "not checked yet" },
    { ok: discovery ? !!discovery.reverseDns : null, label: "Reverse DNS", detail: discovery?.reverseDns ?? (discovery ? "no PTR record" : "—") },
  ];
  return (
    <div>
      <p className="modal-text">Argus checks the device before it enters the CMDB. Unreachable devices can still be onboarded — they'll show as <b>Unknown</b> until the first successful poll.</p>
      <ul className="check-list">{checks.map((c) => (
        <li key={c.label} className={c.ok === null ? "pending" : c.ok ? "ok" : "bad"}>
          <i className={`fa-solid ${c.ok === null ? "fa-circle-notch" : c.ok ? "fa-circle-check" : "fa-circle-xmark"}${discovering && c.ok === null ? " fa-spin" : ""}`} />
          <div><b>{c.label}</b><span>{c.detail}</span></div>
        </li>
      ))}</ul>
    </div>
  );
}

export function ClassificationStep({ c, set }: { c: Cmdb; set: (k: keyof Cmdb, v: string) => void }) {
  return (
    <div className="form-grid">
      <Field label="CI Class" required><input value={c.ciClass} onChange={(e) => set("ciClass", e.target.value)} maxLength={48} /></Field>
      <Field label="Criticality" required><select value={c.criticality} onChange={(e) => set("criticality", e.target.value)}>{CRITICALITY.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Business Service"><input value={c.businessService} onChange={(e) => set("businessService", e.target.value)} placeholder="NSE Trading" maxLength={64} /></Field>
      <Field label="Support Group"><input value={c.supportGroup} onChange={(e) => set("supportGroup", e.target.value)} placeholder="Infra L2" maxLength={64} /></Field>
    </div>
  );
}

export function MonitoringStep({ m, setM, discovery, type }: { m: Monitoring; setM: (m: Monitoring) => void; discovery?: DiscoveryResult | null; type: DeviceType }) {
  const options = [...baseChecks(type), ...(discovery?.services ?? []).map((s) => `${s.service}/${s.port}`)];
  const toggle = (c: string) => setM({ ...m, checks: m.checks.includes(c) ? m.checks.filter((x) => x !== c) : [...m.checks, c] });
  return (
    <div>
      <div className="check-grid">{options.map((c) => (
        <label key={c} className={`check-tile${m.checks.includes(c) ? " on" : ""}`}>
          <input type="checkbox" checked={m.checks.includes(c)} onChange={() => toggle(c)} /> {c}
        </label>
      ))}</div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <Field label="Polling interval"><select value={m.intervalSec} onChange={(e) => setM({ ...m, intervalSec: Number(e.target.value) })}>{INTERVALS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select></Field>
        <Field label="Alert profile"><select value={m.alertProfile} onChange={(e) => setM({ ...m, alertProfile: e.target.value })}>{ALERT_PROFILES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
    </div>
  );
}

export function ReviewStep({ f, c, m, siteName }: { f: FormState; c: Cmdb; m: Monitoring; siteName: string }) {
  const rows: [string, string][] = [
    ["Device", `${f.hostname.toUpperCase()} (${TYPE_LABEL[f.deviceType]})`], ["IP / Mgmt IP", `${f.ip}${f.mgmtIp ? ` / ${f.mgmtIp}` : ""}`],
    ["Site / Environment", `${siteName} · ${f.environment}`], ["Vendor / Model", `${f.vendor || "—"} ${f.model}`.trim()],
    ["OS", `${f.osType} ${f.osVersion}`.trim() || "—"], ["Role", f.role || "—"],
    ["CMDB", `${c.ciClass} · ${c.criticality}${c.businessService ? ` · ${c.businessService}` : ""}`],
    ["Monitoring", m.checks.length ? `${m.checks.length} checks every ${INTERVALS.find((x) => x.v === m.intervalSec)?.l} · ${m.alertProfile}` : "No checks selected"],
  ];
  return (
    <table className="info-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
  );
}
