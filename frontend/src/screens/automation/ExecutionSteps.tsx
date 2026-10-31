import { STEP_META, STEP_TONE, type StepResult } from "./automationMeta";

export function ExecutionSteps({ steps }: { steps: StepResult[] }) {
  return (
    <ul className="result-steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="cell-sub" style={{ width: 18 }}>{i + 1}.</span>
          <i className={`fa-solid ${STEP_META[s.type]?.icon ?? "fa-circle"}`} style={{ color: "var(--muted)" }} />
          <div style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b> <span className="cell-sub">· {STEP_META[s.type]?.label ?? s.type}</span>
            <div className="cell-sub" style={{ overflowWrap: "anywhere" }}>{s.detail}</div></div>
          {s.status !== "skipped" && <span className="cell-sub">{s.ms} ms</span>}
          <span className={`pill ${STEP_TONE[s.status]}`}>{s.status === "skipped" ? "Dry run" : s.status[0].toUpperCase() + s.status.slice(1)}</span>
        </li>
      ))}
    </ul>
  );
}
