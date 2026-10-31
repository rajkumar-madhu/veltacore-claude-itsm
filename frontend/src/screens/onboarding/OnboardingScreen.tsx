import React from "react";
import { Link } from "react-router-dom";
import { useDevices, useDiscover, useOnboard, useSites, type DeviceDetail, type DiscoveryResult } from "@/api/hooks";
import { Breadcrumbs, Card } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { BulkImport, DiscoveryPanel, RecentDevices } from "./panels";
import { CI_CLASS, baseChecks, validateDevice, type Cmdb, type Errors, type FormState, type Monitoring } from "./onboardingMeta";
import { ClassificationStep, DeviceForm, MonitoringStep, ReviewStep, ValidationStep } from "./steps";

const STEPS = [
  { title: "Device Information", sub: "Basic details" },
  { title: "Discovery & Validation", sub: "Auto-detect and verify" },
  { title: "Classification", sub: "Assign to CMDB" },
  { title: "Monitoring Setup", sub: "Configure checks" },
  { title: "Review & Onboard", sub: "Confirm and add" },
];

const EMPTY: FormState = {
  deviceType: "server", hostname: "", ip: "", mgmtIp: "", site: "br-mum", environment: "Production",
  vendor: "", model: "", osType: "Linux", osVersion: "", role: "", description: "",
};

export default function OnboardingScreen() {
  const sites = useSites().data;
  const devices = useDevices().data ?? [];
  const onboard = useOnboard();
  const discover = useDiscover();
  const [toast, setToast] = useToast();

  const [step, setStep] = React.useState(0);
  const [f, setF] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const [discovery, setDiscovery] = React.useState<DiscoveryResult | null>(null);
  const [cmdb, setCmdb] = React.useState<Cmdb>({ ciClass: CI_CLASS.server, businessService: "", criticality: "P2 - High", supportGroup: "" });
  const [mon, setMon] = React.useState<Monitoring>({ checks: baseChecks("server"), intervalSec: 60, alertProfile: "Default" });
  const [created, setCreated] = React.useState<DeviceDetail | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    if (k === "ip") setDiscovery(null);
    if (k === "deviceType") {
      const t = v as FormState["deviceType"];
      setCmdb((c) => ({ ...c, ciClass: CI_CLASS[t] }));
      setMon((m) => ({ ...m, checks: [...baseChecks(t), ...m.checks.filter((c) => c.includes("/"))] }));
    }
  };

  const hostnameTaken = devices.some((d) => d.hostname === f.hostname.trim().toUpperCase());
  const ipTaken = devices.some((d) => d.ip === f.ip.trim());
  const siteName = sites.find((s) => s.id === f.site)?.name ?? f.site;

  function runDiscovery() {
    const ip = (f.mgmtIp || f.ip).trim();
    if (!ip) return setErrors((e) => ({ ...e, ip: "Enter an IP address first." }));
    discover.mutate(ip, { onSuccess: setDiscovery, onError: () => setDiscovery(null) });
  }

  function toggleCheck(c: string) {
    setMon((m) => ({ ...m, checks: m.checks.includes(c) ? m.checks.filter((x) => x !== c) : [...m.checks, c] }));
  }

  function next() {
    if (step === 0) {
      const e = validateDevice(f);
      if (hostnameTaken) e.hostname = `${f.hostname.toUpperCase()} is already onboarded.`;
      if (ipTaken) e.ip = `${f.ip} is already used by another device.`;
      setErrors(e);
      if (Object.keys(e).some((k) => e[k])) return;
      if (!discovery) runDiscovery();
    }
    if (step === 2 && !cmdb.ciClass.trim()) return setToast({ kind: "err", text: "CI class is required." });
    setStep((s) => Math.min(4, s + 1));
  }

  function submit() {
    onboard.mutate({ ...f, hostname: f.hostname.trim(), ip: f.ip.trim(), mgmtIp: f.mgmtIp.trim() || undefined, cmdb, monitoring: mon }, {
      onSuccess: (d) => { setCreated(d); setToast({ kind: "ok", text: `${d.hostname} onboarded` }); },
      onError: (err) => {
        const fields = (err as Error & { fields?: Record<string, string[]> }).fields;
        if (fields) {
          setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(" ") : "Invalid value"])));
          setStep(0);
          setToast({ kind: "err", text: "Please fix the highlighted fields." });
        } else setToast({ kind: "err", text: err.message });
      },
    });
  }

  function reset() {
    setF(EMPTY); setErrors({}); setDiscovery(null); setCreated(null); setStep(0); onboard.reset(); discover.reset();
    setCmdb({ ciClass: CI_CLASS.server, businessService: "", criticality: "P2 - High", supportGroup: "" });
    setMon({ checks: baseChecks("server"), intervalSec: 60, alertProfile: "Default" });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Onboarding" }, { label: "Add Device" }]} />
      <div className="page-head">
        <div><h1 className="page-title">Onboarding Device</h1><div className="page-sub">Add and configure new infrastructure devices, servers, network equipment and services</div></div>
        <Link className="btn" to="/devices"><i className="fa-solid fa-clock-rotate-left" /> View Onboarding History</Link>
      </div>

      <div className="stepper card">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.title}>
            <button className={`step${i === step ? " current" : i < step ? " done" : ""}`} onClick={() => i < step && !created && setStep(i)} disabled={i > step || !!created}>
              <span className="step-num">{i < step || created ? <i className="fa-solid fa-check" /> : i + 1}</span>
              <span><b>{s.title}</b><small>{s.sub}</small></span>
            </button>
            {i < STEPS.length - 1 && <span className={`step-line${i < step ? " done" : ""}`} />}
          </React.Fragment>
        ))}
      </div>

      <div className="onb-grid">
        <Card title={created ? "Device Onboarded" : STEPS[step].title} right={step === 0 && !created &&
          <button className="btn" onClick={runDiscovery} disabled={discover.isPending}><i className="fa-solid fa-magnifying-glass" /> Auto Discover</button>}>
          {created ? (
            <div className="success-box">
              <i className="fa-solid fa-circle-check" />
              <div><b>{created.hostname}</b> was added to the CMDB with {mon.checks.length} monitoring check(s). Its status stays <b>Unknown</b> until the first successful poll.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn primary" to={`/devices/${created.id}`}>Open device</Link>
                <button className="btn" onClick={reset}><i className="fa-solid fa-plus" /> Onboard another</button>
              </div>
            </div>
          ) : (<>
            {step === 0 && <><div className="cell-sub" style={{ marginTop: -4, marginBottom: 12 }}>Enter basic details or use auto-discovery to detect device information</div>
              <DeviceForm f={f} set={set} errors={errors} sites={sites} /></>}
            {step === 1 && <ValidationStep f={f} discovery={discovery} discovering={discover.isPending} hostnameTaken={hostnameTaken} ipTaken={ipTaken} />}
            {step === 2 && <ClassificationStep c={cmdb} set={(k, v) => setCmdb((c) => ({ ...c, [k]: v }))} />}
            {step === 3 && <MonitoringStep m={mon} setM={setMon} discovery={discovery} type={f.deviceType} />}
            {step === 4 && <ReviewStep f={f} c={cmdb} m={mon} siteName={siteName} />}
            <div className="wizard-foot">
              <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><i className="fa-solid fa-arrow-left" /> Back</button>
              {step < 4
                ? <button className="btn primary" onClick={next}>Next <i className="fa-solid fa-arrow-right" /></button>
                : <button className="btn primary" onClick={submit} disabled={onboard.isPending}>{onboard.isPending && <i className="fa-solid fa-spinner fa-spin" />} Onboard Device</button>}
            </div>
          </>)}
        </Card>

        <DiscoveryPanel ip={(f.mgmtIp || f.ip).trim()} result={discovery} running={discover.isPending} error={discover.error?.message}
          onRun={runDiscovery} monitored={mon.checks} onToggleService={toggleCheck} />
      </div>

      <div className="onb-grid bottom">
        <RecentDevices />
        <BulkImport onUseIp={(ip) => { set("ip", ip); setStep(0); document.querySelector(".main")?.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </div>
      {toast}
    </div>
  );
}
