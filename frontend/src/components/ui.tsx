import React from "react";
import { Link } from "react-router-dom";
import { RANGE_LABEL, type Range } from "@/lib/series";

export function Card({ title, icon, right, children, className = "", bodyPad = true }: {
  title?: React.ReactNode; icon?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; bodyPad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <span className="card-title">{icon && <i className={`fa-solid ${icon}`} />}{title}</span>
          {right}
        </div>
      )}
      <div className={bodyPad ? "card-body" : undefined}>{children}</div>
    </section>
  );
}

export function InfoTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="info-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}><th>{k}</th><td>{v ?? "—"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; badge?: number }[]; active: T; onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} className={`tab${active === t.id ? " active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}{t.badge ? <span className="tab-badge">({t.badge})</span> : null}
        </button>
      ))}
    </div>
  );
}

export function RangeSelect({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <select className="select-sm" value={value} onChange={(e) => onChange(e.target.value as Range)}>
      {(Object.keys(RANGE_LABEL) as Range[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
    </select>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs">
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <i className="fa-solid fa-chevron-right" />}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span>{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function Meter({ pct, color }: { pct: number; color?: string }) {
  const c = color ?? (pct >= 85 ? "var(--crit)" : pct >= 70 ? "var(--warn)" : "var(--ok)");
  return (
    <div className="meter"><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: c }} /></div>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const l = level.toLowerCase();
  const map: Record<string, [string, string]> = {
    info: ["info", "fa-circle-info"], warning: ["warn", "fa-triangle-exclamation"], warn: ["warn", "fa-triangle-exclamation"],
    error: ["crit", "fa-circle-xmark"], critical: ["crit", "fa-circle-xmark"],
  };
  const [cls, icon] = map[l] ?? ["info", "fa-circle-info"];
  return <span className={`lvl ${cls}`}><i className={`fa-solid ${icon}`} /> {level[0].toUpperCase() + level.slice(1).toLowerCase()}</span>;
}

export function ApiDown({ what, retry }: { what: string; retry: () => void }) {
  return (
    <div className="empty-state">
      <i className="fa-solid fa-plug-circle-xmark" />
      <div className="t">Can't load {what}</div>
      <div className="s">The monitoring API isn't reachable. Check the backend is running on :8000.</div>
      <button className="btn" onClick={retry}><i className="fa-solid fa-rotate" /> Retry</button>
    </div>
  );
}
