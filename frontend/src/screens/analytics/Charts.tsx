import React from "react";

export interface Series { key: string; label: string; color: string; values: number[] }

/** Grouped daily bars on one shared axis, with a per-day hover tooltip and a legend. */
export function DailyBars({ days, series, height = 220 }: { days: string[]; series: Series[]; height?: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 720, H = height, padL = 36, padB = 26, padT = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const slot = (W - padL) / days.length;
  const gap = 2, bw = Math.max(3, Math.min(14, (slot * 0.7 - gap * (series.length - 1)) / series.length));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  return (
    <div style={{ position: "relative" }}>
      {series.length > 1 && <div className="graph-legend" style={{ paddingTop: 0 }}>{series.map((s) => <span key={s.key}><b style={{ background: s.color, borderRadius: 2 }} />{s.label}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
        aria-label={`${series.map((s) => s.label).join(" and ")} per day`} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="#eef1f4" />
            <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" style={{ fontSize: 13, fill: "#64748b" }}>{v}</text></g>
        ))}
        {days.map((d, i) => {
          const x0 = padL + i * slot + (slot - (bw * series.length + gap * (series.length - 1))) / 2;
          return (
            <g key={d} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill={hover === i ? "#f1f5f9" : "transparent"} />
              {series.map((s, j) => {
                const v = s.values[i], h = (H - padT - padB) * (v / top);
                return v > 0 ? <path key={s.key} fill={s.color}
                  d={`M${x0 + j * (bw + gap)},${H - padB} v${-Math.max(0, h - 3)} q0,-3 3,-3 h${bw - 6} q3,0 3,3 v${Math.max(0, h - 3)} z`} /> : null;
              })}
              {(i % Math.ceil(days.length / 7) === 0 || i === days.length - 1) &&
                <text x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 13, fill: "#64748b" }}>{label(d)}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="#cbd5e1" />
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${Math.min(88, Math.max(12, ((padL + (hover + 0.5) * slot) / W) * 100))}%` }}>
          <b style={{ color: "var(--ink)", display: "block" }}>{label(days[hover])}</b>
          {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}<span>{s.values[hover]}</span></div>)}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars for one measure (single hue). */
export function BarList({ data, color = "#2a78d6", empty = "No data" }: { data: [string, number][]; color?: string; empty?: string }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  if (!data.length) return <div className="cell-sub">{empty}</div>;
  return (
    <div>{data.map(([k, v]) => (
      <div key={k} className="bar-row" title={`${k}: ${v}`}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
        <span className="bar"><span style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
        <b style={{ textAlign: "right" }}>{v}</b>
      </div>
    ))}</div>
  );
}
