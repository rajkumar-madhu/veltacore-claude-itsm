import React from "react";
import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { SeverityPill } from "@/components/itsmBadges";
import { ago, pairs } from "@/lib/itsmFmt";

interface Channel extends Row { id: number; name: string; kind: string; target: string; enabled: boolean; lastTest: string | null; lastTestResult: string }
interface Rule extends Row { id: number; name: string; minSeverity: string; matchSource: string; channel: number; channelName: string; businessHoursOnly: boolean; enabled: boolean }

const KINDS = pairs([["email", "Email"], ["slack", "Slack"], ["teams", "MS Teams"], ["webhook", "Webhook"], ["sms", "SMS"]]);
const KIND_ICON: Record<string, string> = { email: "fa-envelope", slack: "fa-hashtag", teams: "fa-users-rectangle", webhook: "fa-code", sms: "fa-comment-sms" };
const crumbs = [{ label: "Home", to: "/" }, { label: "Administration" }, { label: "Notifications" }];

export default function NotificationsScreen() {
  const [tab, setTab] = React.useState<"channels" | "rules">("channels");
  const switcher = () => (
    <div className="seg"><button className={tab === "channels" ? "active" : ""} onClick={() => setTab("channels")}>Channels</button>
      <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>Routing rules</button></div>
  );

  const channels: ResourceConfig<Channel> = {
    title: "Notifications", subtitle: "Where alerts are sent, and which alerts go where", icon: "fa-bullhorn", crumbs,
    path: "/channels/", createLabel: "Channel", canDelete: true, defaults: { enabled: true, kind: "slack" }, headerActions: switcher,
    kpis: (rows) => [
      { label: "Channels", value: rows.length, sub: `${rows.filter((r) => r.enabled).length} enabled` },
      { label: "Tested", value: rows.filter((r) => r.lastTest).length },
      { label: "Kinds", value: new Set(rows.map((r) => r.kind)).size },
    ],
    filters: [{ key: "kind", label: "Kind", options: KINDS }],
    columns: [
      { key: "name", label: "Channel", render: (r) => <><b><i className={`fa-solid ${KIND_ICON[r.kind]}`} style={{ color: "var(--muted)", width: 18 }} />{r.name}</b><div className="cell-sub">{KINDS.find((k) => k.value === r.kind)?.label}</div></> },
      { key: "target", label: "Target", render: (r) => <span className="mono cell-sub" style={{ overflowWrap: "anywhere" }}>{r.target}</span> },
      { key: "lastTest", label: "Last test", render: (r) => r.lastTest ? <><span className="cell-sub">{ago(r.lastTest)}</span><div className={r.lastTestResult.startsWith("Delivered") ? "cell-sub" : "warn-text"} style={{ fontSize: 12 }}>{r.lastTestResult}</div></> : <span className="cell-sub">never</span> },
      { key: "enabled", label: "State", render: (r) => <span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span> },
    ],
    rowActions: [{ label: "Send test", icon: "fa-paper-plane", run: (r, ctx) => ctx.post(`/channels/${r.id}/test/`).then((x) => {
      const res = (x as Channel).lastTestResult;
      ctx.toast(res.startsWith("Delivered") ? "ok" : "err", `${r.name}: ${res}`);
    }).catch((e: Error) => ctx.toast("err", e.message)) }],
    fields: [
      { key: "name", label: "Name", required: true }, { key: "kind", label: "Kind", type: "select", options: KINDS, required: true },
      { key: "target", label: "Target", required: true, wide: true, placeholder: "#channel · ops@company.com · https://hooks.example.com/…", help: "Webhooks receive a real test POST. Email, Slack, Teams and SMS need provider credentials on the server before anything is sent." },
      { key: "enabled", label: "Enabled", type: "checkbox" },
    ],
  };

  const rules: ResourceConfig<Rule> = {
    title: "Notifications", subtitle: "Where alerts are sent, and which alerts go where", icon: "fa-bullhorn", crumbs,
    path: "/notification-rules/", createLabel: "Rule", canDelete: true, defaults: { enabled: true, minSeverity: "critical" }, headerActions: switcher,
    filters: [{ key: "channelName", label: "Channel" }],
    columns: [
      { key: "name", label: "Rule", render: (r) => <b>{r.name}</b> },
      { key: "minSeverity", label: "Minimum severity", render: (r) => <SeverityPill s={r.minSeverity} /> },
      { key: "matchSource", label: "Source", render: (r) => r.matchSource || <span className="cell-sub">any</span> },
      { key: "channelName", label: "Send to" },
      { key: "businessHoursOnly", label: "When", render: (r) => (r.businessHoursOnly ? "Business hours" : "24×7") },
      { key: "enabled", label: "State", render: (r) => <span className={`pill ${r.enabled ? "ok" : "muted"}`}>{r.enabled ? "Enabled" : "Disabled"}</span> },
    ],
    fields: [
      { key: "name", label: "Name", required: true, wide: true },
      { key: "minSeverity", label: "Minimum severity", type: "select", options: pairs([["critical", "Critical"], ["warning", "Warning and above"], ["info", "Everything"]]), required: true },
      { key: "matchSource", label: "Source", placeholder: "empty = any" },
      { key: "channel", label: "Channel", type: "select", required: true, optionsFrom: { path: "/channels/", value: "id", label: (r) => String(r.name) } },
      { key: "businessHoursOnly", label: "Business hours only", type: "checkbox" }, { key: "enabled", label: "Enabled", type: "checkbox" },
    ],
  };
  return tab === "channels" ? <ResourcePage key="c" cfg={channels} /> : <ResourcePage key="r" cfg={rules} />;
}
