import React from "react";
import { Link } from "react-router-dom";
import { useDevices, useDiscover, type DiscoveryResult } from "@/api/hooks";
import { Breadcrumbs, Card } from "@/components/ui";
import { DiscoveryPanel } from "./panels";

export default function DiscoveryScreen() {
  const discover = useDiscover();
  const { data: devices = [] } = useDevices();
  const [ip, setIp] = React.useState("");
  const [result, setResult] = React.useState<DiscoveryResult | null>(null);
  const [history, setHistory] = React.useState<DiscoveryResult[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const valid = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip.trim());
  const known = devices.find((d) => d.ip === (result?.ip ?? ""));

  function run() {
    discover.mutate(ip.trim(), {
      onSuccess: (r) => { setResult(r); setSelected(r.services.filter((s) => s.status === "open").map((s) => s.service)); setHistory((h) => [r, ...h.filter((x) => x.ip !== r.ip)].slice(0, 10)); },
      onError: () => setResult(null),
    });
  }

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Onboarding" }, { label: "Discovery" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-satellite-dish" /><div><h1 className="page-title">Discovery</h1>
        <div className="page-sub">Probe a host for open service ports before onboarding it (private address ranges only)</div></div></div></div>
      <div className="card filter-bar">
        <div className="search-box"><i className="fa-solid fa-network-wired" /><input aria-label="IP address" placeholder="10.20.1.15" value={ip} onChange={(e) => setIp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && run()} /></div>
        {ip && !valid && <span className="field-error">Enter an IPv4 address</span>}
      </div>
      <div className="ticket-grid">
        <div className="stack">
          <DiscoveryPanel ip={valid ? ip.trim() : ""} result={result} running={discover.isPending} error={discover.error?.message} onRun={run}
            monitored={selected} onToggleService={(s) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} />
          {result && (
            <div className={`banner ${known ? "warn" : "ok"}`}>
              <i className={`fa-solid ${known ? "fa-circle-info" : "fa-circle-plus"}`} />
              <div style={{ flex: 1 }}>{known ? <><b>{known.hostname}</b> already uses {result.ip}.</> : <><b>{result.ip}</b> isn't in inventory yet.</>}</div>
              {known ? <Link className="btn sm" to={`/devices/${known.id}`}>Open device</Link> : <Link className="btn sm primary" to={`/onboarding?ip=${result.ip}`}>Onboard this device</Link>}
            </div>
          )}
        </div>
        <Card title="This session" icon="fa-clock-rotate-left">
          {!history.length ? <div className="cell-sub">Probed hosts appear here.</div> : <ul className="stat-list">{history.map((h) => (
            <li key={h.ip}><button className="link-btn mono" onClick={() => { setIp(h.ip); setResult(h); }}>{h.ip}</button>
              <span><span className={`pill ${h.reachable ? "ok" : "muted"}`}>{h.services.filter((s) => s.status === "open").length} open</span></span></li>
          ))}</ul>}
        </Card>
      </div>
    </div>
  );
}
