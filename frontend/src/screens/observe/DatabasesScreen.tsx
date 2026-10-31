import { Link } from "react-router-dom";
import { useDevices } from "@/api/hooks";
import { Card } from "@/components/ui";
import { ago } from "@/lib/itsmFmt";
import { ServicesPage } from "./observeShared";

function DbHosts() {
  const { data = [] } = useDevices({ type: "database" });
  return (
    <Card title={`Database servers (${data.length})`} icon="fa-database" className="mt" bodyPad={false}>
      <div className="table-wrap"><table className="list compact">
        <thead><tr><th>Host</th><th>Role</th><th>IP</th><th>Site</th><th>Status</th><th>Last seen</th></tr></thead>
        <tbody>{data.map((d) => (
          <tr key={d.id}><td><Link className="link cell-strong" to={`/devices/${d.id}`}>{d.hostname}</Link><div className="cell-sub">{d.vendor} {d.model}</div></td>
            <td>{d.role}</td><td className="mono">{d.ip}</td><td>{d.siteName}</td>
            <td><span className={`pill ${d.status === "online" ? "ok" : "crit"}`}>{d.status}</span></td><td className="cell-sub">{ago(d.lastSeen)}</td></tr>
        ))}{!data.length && <tr><td colSpan={6} className="empty-row">No database servers onboarded.</td></tr>}</tbody>
      </table></div>
    </Card>
  );
}

export default function DatabasesScreen() {
  return <ServicesPage title="Databases" icon="fa-database" crumb="Databases"
    sub="Database and data-store services, plus the database servers they run on"
    filter={(s) => s.domainId === "databases"} extra={<DbHosts />} />;
}
