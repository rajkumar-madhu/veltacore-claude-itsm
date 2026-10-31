import { RESULT_ICON, RESULT_LABEL, RESULT_TONE, type BodResult } from "./bodMeta";

/** Check results grouped by category. */
export function BodResults({ results }: { results: BodResult[] }) {
  const cats = [...new Set(results.map((r) => r.category))];
  return (
    <>
      {cats.map((c) => (
        <div key={c}>
          <div className="section-title">{c}</div>
          <ul className="result-steps">
            {results.filter((r) => r.category === c).map((r) => (
              <li key={r.checkId}>
                <i className={`fa-solid ${RESULT_ICON[r.status]}`} style={{ color: `var(--${RESULT_TONE[r.status] === "ok" ? "ok" : RESULT_TONE[r.status] === "warn" ? "warn" : "crit"})` }} />
                <div style={{ flex: 1, minWidth: 0 }}><b>{r.check}</b>{r.critical && <span className="cell-sub"> · critical</span>}<div className="cell-sub" style={{ overflowWrap: "anywhere" }}>{r.detail}</div></div>
                <span className={`pill ${RESULT_TONE[r.status]}`}>{RESULT_LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
