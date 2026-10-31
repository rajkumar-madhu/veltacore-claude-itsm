import React from "react";
import { useNavigate } from "react-router-dom";
import { useItsmList, useItsmMutation, type ApiError } from "@/api/itsm";
import { ApiDown, Breadcrumbs } from "@/components/ui";
import { useToast } from "@/lib/useToast";
import { ConfirmModal } from "@/screens/device/deviceCommon";
import { ResourceForm, type FieldDef, type FormValues } from "./ResourceForm";

export type Row = Record<string, unknown> & { id: number | string };

export interface Column<T extends Row> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortValue?: (row: T) => string | number;
}

export interface Filter<T extends Row> {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  /** derive options from loaded rows */
  fromRows?: (row: T) => string;
  match?: (row: T, value: string) => boolean;
}

export interface Kpi { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "crit"; sub?: string }

export interface RowAction<T extends Row> {
  label: string;
  icon: string;
  danger?: boolean;
  show?: (row: T) => boolean;
  run: (row: T, ctx: ActionCtx) => void;
}

export interface ActionCtx {
  toast: (kind: "ok" | "err", text: string) => void;
  post: (path: string, body?: unknown) => Promise<unknown>;
  refresh: () => void;
}

export interface ResourceConfig<T extends Row> {
  title: string;
  subtitle?: string;
  icon?: string;
  crumbs: { label: string; to?: string }[];
  path: string;                                  // e.g. "/assets/"
  params?: Record<string, string | undefined>;
  columns: Column<T>[];
  filters?: Filter<T>[];
  search?: (row: T) => string;
  kpis?: (rows: T[]) => Kpi[];
  fields?: FieldDef[];                           // enables create + edit
  createLabel?: string;
  canCreate?: boolean;
  canEdit?: boolean | ((row: T) => boolean);
  canDelete?: boolean | ((row: T) => boolean);
  defaults?: FormValues;
  /** map form values to the request body (e.g. nest fields into "extra") */
  transform?: (v: FormValues, row?: T) => FormValues;
  /** map a row to initial form values when editing */
  toForm?: (row: T) => FormValues;
  rowLink?: (row: T) => string;
  rowActions?: RowAction<T>[];
  headerActions?: (ctx: ActionCtx) => React.ReactNode;
  aboveTable?: (rows: T[]) => React.ReactNode;
  emptyText?: string;
  pageSize?: number;
  refetchInterval?: number;
  label?: (row: T) => string;
}

const PAGE = 15;

export default function ResourcePage<T extends Row>({ cfg }: { cfg: ResourceConfig<T> }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useItsmList<T>(cfg.path, cfg.params, { refetchInterval: cfg.refetchInterval });
  const [toastNode, setToast] = useToast();
  const [q, setQ] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [form, setForm] = React.useState<null | { row?: T }>(null);
  const [del, setDel] = React.useState<T | null>(null);

  const save = useItsmMutation<{ id?: Row["id"]; body: FormValues }>(
    "POST", () => cfg.path, (v) => v.body);
  const patch = useItsmMutation<{ id: Row["id"]; body: FormValues }>("PATCH", (v) => `${cfg.path}${v.id}/`, (v) => v.body);
  const remove = useItsmMutation<Row["id"]>("DELETE", (id) => `${cfg.path}${id}/`);
  const action = useItsmMutation<{ path: string; body?: unknown }, unknown>("POST", (v) => v.path, (v) => v.body ?? {});

  React.useEffect(() => setPage(0), [q, filters, cfg.path]);

  const ctx: ActionCtx = {
    toast: (kind, text) => setToast({ kind, text }),
    post: (path, body) => action.mutateAsync({ path, body }),
    refresh: () => refetch(),
  };
  const label = (r: T) => cfg.label?.(r) ?? String(r.name ?? r.number ?? r.id);

  const all = data ?? [];
  let rows = all.filter((r) => (!q || (cfg.search ? cfg.search(r) : JSON.stringify(r)).toLowerCase().includes(q.toLowerCase()))
    && (cfg.filters ?? []).every((f) => !filters[f.key] || (f.match ? f.match(r, filters[f.key]) : String(f.fromRows ? f.fromRows(r) : r[f.key]) === filters[f.key])));
  if (sort) {
    const col = cfg.columns.find((c) => c.key === sort.key);
    const val = (r: T) => (col?.sortValue ? col.sortValue(r) : (r[sort.key] as string | number) ?? "");
    rows = [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }
  const size = cfg.pageSize ?? PAGE;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const pageRows = rows.slice(page * size, page * size + size);
  const editable = (r: T) => (typeof cfg.canEdit === "function" ? cfg.canEdit(r) : cfg.canEdit ?? !!cfg.fields);
  const deletable = (r: T) => (typeof cfg.canDelete === "function" ? cfg.canDelete(r) : !!cfg.canDelete);
  const hasActions = !!cfg.fields || !!cfg.canDelete || !!cfg.rowActions?.length;

  function submit(v: FormValues) {
    const onError = (e: ApiError) => !e.fields && setToast({ kind: "err", text: e.message });
    const body = cfg.transform ? cfg.transform(v, form?.row) : v;
    if (form?.row) patch.mutate({ id: form.row.id, body }, { onSuccess: () => { setForm(null); setToast({ kind: "ok", text: `${label(form.row as T)} updated` }); }, onError });
    else save.mutate({ body: { ...cfg.defaults, ...body } }, { onSuccess: () => { setForm(null); setToast({ kind: "ok", text: `${cfg.createLabel ?? "Item"} created` }); }, onError });
  }

  const filterOpts = (f: Filter<T>) => f.options ?? [...new Set(all.map((r) => String(f.fromRows ? f.fromRows(r) : r[f.key] ?? "")).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));

  return (
    <div className="page">
      <Breadcrumbs items={cfg.crumbs} />
      <div className="page-head">
        <div className="title-with-icon">{cfg.icon && <i className={`fa-solid ${cfg.icon}`} />}
          <div><h1 className="page-title">{cfg.title}</h1>{cfg.subtitle && <div className="page-sub">{cfg.subtitle}</div>}</div></div>
        <div className="detail-actions">
          {cfg.headerActions?.(ctx)}
          {cfg.fields && cfg.canCreate !== false && <button className="btn primary" onClick={() => setForm({})}><i className="fa-solid fa-plus" /> {cfg.createLabel ? `New ${cfg.createLabel}` : "New"}</button>}
        </div>
      </div>

      {cfg.kpis && data && (
        <div className="kpi-strip">{cfg.kpis(all).map((k) => (
          <div key={k.label} className={`kpi${k.tone ? ` tone-${k.tone}` : ""}`}><div className="l">{k.label}</div><div className="v">{k.value}</div>{k.sub && <div className="s">{k.sub}</div>}</div>
        ))}</div>
      )}
      {cfg.aboveTable && data && cfg.aboveTable(all)}

      <div className="card">
        <div className="toolbar">
          <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {(cfg.filters ?? []).map((f) => (
            <select key={f.key} className="select-sm" value={filters[f.key] ?? ""} onChange={(e) => setFilters((p) => ({ ...p, [f.key]: e.target.value }))}>
              <option value="">{f.label}: all</option>
              {filterOpts(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          <button className="btn" onClick={() => refetch()} title="Refresh"><i className="fa-solid fa-rotate" /></button>
        </div>
        {isError ? <ApiDown what={cfg.title.toLowerCase()} retry={() => refetch()} /> : isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table className="list res-table">
              <thead><tr>
                {cfg.columns.map((c) => (
                  <th key={c.key} className="sortable" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                    {c.label}{sort?.key === c.key && <i className={`fa-solid fa-caret-${sort.dir === 1 ? "up" : "down"}`} />}</th>
                ))}
                {hasActions && <th className="actions-col">Actions</th>}
              </tr></thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={String(r.id)} className={cfg.rowLink ? "row-clickable" : ""} onClick={() => cfg.rowLink && navigate(cfg.rowLink(r))}>
                    {cfg.columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}
                    {hasActions && (
                      <td className="nowrap row-actions actions-col" onClick={(e) => e.stopPropagation()}>
                        {(cfg.rowActions ?? []).filter((a) => !a.show || a.show(r)).map((a) => (
                          <button key={a.label} title={a.label} className={a.danger ? "danger" : ""} onClick={() => a.run(r, ctx)}><i className={`fa-solid ${a.icon}`} /></button>
                        ))}
                        {cfg.fields && editable(r) && <button title="Edit" onClick={() => setForm({ row: r })}><i className="fa-solid fa-pen" /></button>}
                        {deletable(r) && <button title="Delete" className="danger" onClick={() => setDel(r)}><i className="fa-solid fa-trash" /></button>}
                      </td>
                    )}
                  </tr>
                ))}
                {!pageRows.length && <tr><td colSpan={cfg.columns.length + 1} className="empty-row">{cfg.emptyText ?? "Nothing here yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > size && (
          <div className="pager" style={{ padding: "10px 14px" }}>
            <span className="cell-sub">Showing {page * size + 1}–{Math.min(rows.length, (page + 1) * size)} of {rows.length}</span>
            <div><button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><i className="fa-solid fa-chevron-left" /></button>
              <span className="page-no">{page + 1}</span>
              <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next"><i className="fa-solid fa-chevron-right" /></button></div>
          </div>
        )}
      </div>

      {form && cfg.fields && (
        <ResourceForm title={form.row ? `Edit ${label(form.row)}` : `New ${cfg.createLabel ?? "item"}`} fields={cfg.fields} editing={!!form.row}
          initial={form.row ? (cfg.toForm ? cfg.toForm(form.row) : form.row) : cfg.defaults ?? {}} onClose={() => { setForm(null); save.reset(); patch.reset(); }} onSubmit={submit}
          busy={save.isPending || patch.isPending} error={(form.row ? patch.error : save.error) ?? null} />
      )}
      {del && <ConfirmModal title="Delete" danger text={`Delete ${label(del)}? This can't be undone.`} busy={remove.isPending} onClose={() => setDel(null)}
        onConfirm={() => remove.mutate(del.id, {
          onSuccess: () => { setToast({ kind: "ok", text: `${label(del)} deleted` }); setDel(null); },
          onError: (e) => { setToast({ kind: "err", text: e.message }); setDel(null); },
        })} />}
      {toastNode}
    </div>
  );
}
