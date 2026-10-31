import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useItsmList, useItsmMutation } from "@/api/itsm";
import { ApiDown, Breadcrumbs, Card } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { fmtDate, relDays } from "@/lib/itsmFmt";

interface Event { type: "asset" | "software" | "license"; kind: string; name: string; date: string; overdue: boolean; ref: number }

const TYPE_META: Record<Event["type"], { icon: string; label: string; to: string }> = {
  asset: { icon: "fa-server", label: "Hardware", to: "/assets" },
  software: { icon: "fa-compact-disc", label: "Software", to: "/assets/software" },
  license: { icon: "fa-key", label: "Licenses", to: "/assets/licenses" },
};

export default function LifecycleScreen() {
  const navigate = useNavigate();
  const [days, setDays] = React.useState("180");
  const [type, setType] = React.useState<"" | Event["type"]>("");
  const { data, isError, isLoading, refetch } = useItsmList<Event>("/assets/lifecycle/", { days });
  const change = useItsmMutation<Record<string, unknown>, { id: number; number: string }>("POST", () => "/tickets/");
  const [toast, setToast] = useToast();

  const rows = (data ?? []).filter((e) => !type || e.type === type);
  const months = new Map<string, Event[]>();
  rows.forEach((e) => {
    const k = e.overdue ? "Overdue" : new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    months.set(k, [...(months.get(k) ?? []), e]);
  });

  function raise(e: Event) {
    const verb = e.type === "license" ? "Renew" : e.kind === "Warranty ends" ? "Extend warranty for" : "Plan replacement of";
    change.mutate({
      ticketType: "change", title: `${verb} ${e.name}`.slice(0, 200), priority: e.overdue ? "P2" : "P3", category: "Lifecycle",
      assignmentGroup: "Infra", description: `${e.kind} on ${fmtDate(e.date)} (${relDays(e.date)}). Raised from the asset lifecycle view.`,
      extra: { risk: "Low", impact: e.overdue ? "Medium" : "Low" },
    }, {
      onSuccess: (t) => { setToast({ kind: "ok", text: `${t.number} raised` }); navigate(`/tickets/${t.id}`); },
      onError: (err) => setToast({ kind: "err", text: err.message }),
    });
  }

  const count = (t: Event["type"]) => (data ?? []).filter((e) => e.type === t).length;
  const overdue = (data ?? []).filter((e) => e.overdue).length;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Assets" }, { label: "Lifecycle" }]} />
      <div className="page-head">
        <div className="title-with-icon"><i className="fa-solid fa-hourglass-half" /><div><h1 className="page-title">Asset Lifecycle</h1>
          <div className="page-sub">Upcoming warranty expiries, end-of-life dates, software end-of-support and license renewals</div></div></div>
        <select className="select-sm" aria-label="Horizon" value={days} onChange={(e) => setDays(e.target.value)}>
          {[["30", "Next 30 days"], ["90", "Next 90 days"], ["180", "Next 180 days"], ["365", "Next 12 months"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="kpi-strip">
        <div className={`kpi${overdue ? " tone-crit" : ""}`}><div className="l">Overdue</div><div className="v">{data ? overdue : "—"}</div></div>
        {(Object.keys(TYPE_META) as Event["type"][]).map((t) => (
          <div key={t} className="kpi"><div className="l">{TYPE_META[t].label}</div><div className="v">{data ? count(t) : "—"}</div><div className="s">events in window</div></div>
        ))}
      </div>
      <Card title="Timeline" icon="fa-calendar-days" right={
        <div className="pill-tabs" style={{ margin: 0 }}>
          <button className={!type ? "active" : ""} onClick={() => setType("")}>All</button>
          {(Object.keys(TYPE_META) as Event["type"][]).map((t) => <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>{TYPE_META[t].label}</button>)}
        </div>}>
        {isError ? <ApiDown what="lifecycle events" retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : !rows.length
          ? <div className="empty-card"><i className="fa-solid fa-circle-check" />Nothing expires in this window.</div>
          : [...months.entries()].map(([m, evs]) => (
            <div key={m}>
              <div className="section-title" style={m === "Overdue" ? { color: "var(--crit)" } : undefined}>{m} · {evs.length}</div>
              <table className="list compact" style={{ tableLayout: "fixed" }}><colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 230 }} /></colgroup><tbody>
                {evs.map((e) => (
                  <tr key={`${e.type}-${e.ref}-${e.kind}`}>
                    <td style={{ width: 34 }}><i className={`fa-solid ${TYPE_META[e.type].icon}`} style={{ color: "var(--muted)" }} /></td>
                    <td><b>{e.name}</b><div className="cell-sub">{e.kind}</div></td>
                    <td className="nowrap"><span className={`pill ${e.overdue ? "crit" : "warn"}`}>{fmtDate(e.date)}</span><div className="cell-sub">{relDays(e.date)}</div></td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      <Link className="btn sm" to={TYPE_META[e.type].to}>View</Link>{" "}
                      <button className="btn sm primary" disabled={change.isPending} onClick={() => raise(e)}><i className="fa-solid fa-code-pull-request" /> Raise change</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
      </Card>
      {toast}
    </div>
  );
}
