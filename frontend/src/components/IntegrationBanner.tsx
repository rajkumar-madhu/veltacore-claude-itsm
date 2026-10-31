import { Link } from "react-router-dom";
import { useItsmList } from "@/api/itsm";
import { ago } from "@/lib/itsmFmt";

interface Integration { id: number; name: string; status: string; baseUrl: string; lastChecked: string | null; detail: string }

/** Honest status line for an external tool this screen could pull from. */
export function IntegrationBanner({ name, what }: { name: string; what: string }) {
  const { data } = useItsmList<Integration>("/integrations/");
  const i = data?.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!i) return null;
  const connected = i.status === "connected";
  return (
    <div className={`banner ${connected ? "ok" : i.status === "error" ? "crit" : "info"}`}>
      <i className={`fa-solid ${connected ? "fa-plug-circle-check" : "fa-plug-circle-exclamation"}`} />
      <div style={{ flex: 1 }}>
        {connected
          ? <><b>{i.name} connected</b> at <span className="mono">{i.baseUrl}</span> · checked {ago(i.lastChecked)}.</>
          : <><b>{i.name} is {i.status === "error" ? "unreachable" : "not connected"}.</b> {what}{i.detail ? ` (${i.detail})` : ""}</>}
      </div>
      <Link className="btn sm" to="/admin/integrations">{connected ? "Manage" : "Configure"}</Link>
    </div>
  );
}
