import ResourcePage, { type ResourceConfig, type Row } from "@/components/resource/ResourcePage";
import { useItsmList } from "@/api/itsm";
import { pairs } from "@/lib/itsmFmt";
import { formatShort } from "@/lib/series";

interface User extends Row {
  id: number; username: string; email: string; firstName: string; lastName: string; isActive: boolean;
  role: string; team: string; phone: string; site: string | null; lastLogin: string | null; dateJoined: string;
}
interface Role { id: string; label: string; permissions: string[]; users: number }

const ROLES = pairs([["super_admin", "Super Admin"], ["admin", "Admin"], ["operator", "Operator"], ["viewer", "Viewer"]]);
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
const ROLE_TONE: Record<string, string> = { super_admin: "crit", admin: "warn", operator: "info", viewer: "muted" };

function RoleCards() {
  const { data: roles = [] } = useItsmList<Role>("/roles/");
  return (
    <>
      <div className="catalog-grid" style={{ marginTop: 0, marginBottom: 14, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {roles.map((r) => (
          <div key={r.id} className="catalog-card" style={{ gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className={`pill ${ROLE_TONE[r.id]}`}>{r.label}</span><span className="cell-sub">{r.users} user{r.users === 1 ? "" : "s"}</span></div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "#475569" }}>{r.permissions.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="banner info" style={{ marginBottom: 14 }}><i className="fa-solid fa-circle-info" />
        <div>Roles are recorded per user. Sign-in isn't enabled yet, so new users get no password and roles aren't enforced until authentication is switched on.</div></div>
    </>
  );
}

export default function UsersScreen() {
  const cfg: ResourceConfig<User> = {
    title: "Users & Roles", subtitle: "People who work tickets, alerts and changes, and what each role may do", icon: "fa-users",
    crumbs: [{ label: "Home", to: "/" }, { label: "Administration" }, { label: "Users & Roles" }],
    path: "/users/", createLabel: "User", label: (r) => r.username, defaults: { role: "viewer", isActive: true },
    search: (r) => `${r.username} ${r.email} ${r.firstName} ${r.lastName} ${r.team}`,
    aboveTable: () => <RoleCards />,
    kpis: (rows) => [
      { label: "Users", value: rows.length, sub: `${rows.filter((r) => r.isActive).length} active` },
      { label: "Admins", value: rows.filter((r) => r.role === "admin" || r.role === "super_admin").length },
      { label: "Operators", value: rows.filter((r) => r.role === "operator").length },
      { label: "Teams", value: new Set(rows.map((r) => r.team).filter(Boolean)).size },
    ],
    filters: [{ key: "role", label: "Role", options: ROLES }, { key: "team", label: "Team" },
      { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Disabled" }] }],
    columns: [
      { key: "username", label: "User", render: (r) => <><b>{[r.firstName, r.lastName].filter(Boolean).join(" ") || r.username}</b><div className="cell-sub mono">{r.username}</div></> },
      { key: "email", label: "Email" },
      { key: "role", label: "Role", render: (r) => <span className={`pill ${ROLE_TONE[r.role]}`}>{ROLE_LABEL[r.role] ?? r.role}</span> },
      { key: "team", label: "Team", render: (r) => r.team || "—" },
      { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
      { key: "isActive", label: "Status", render: (r) => <span className={`pill ${r.isActive ? "ok" : "muted"}`}>{r.isActive ? "Active" : "Disabled"}</span> },
      { key: "dateJoined", label: "Added", render: (r) => <span className="cell-sub">{formatShort(r.dateJoined)}</span> },
    ],
    fields: [
      { key: "username", label: "Username", required: true, createOnly: true, placeholder: "firstname.lastname" },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "firstName", label: "First name" }, { key: "lastName", label: "Last name" },
      { key: "role", label: "Role", type: "select", options: ROLES, required: true },
      { key: "team", label: "Team" }, { key: "phone", label: "Phone" },
      { key: "site", label: "Home site", type: "select", optionsFrom: { path: "/sites/", value: "id", label: (r) => String(r.name) } },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
  };
  return <ResourcePage cfg={cfg} />;
}
