import React from "react";

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function linePath(data: number[], x: (i: number) => number, y: (v: number) => number) {
  return data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
}

export function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * 100;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <path d={linePath(data, x, y)} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface ChartSeries { label: string; color: string; data: number[]; fill?: boolean }

export function LineChart({
  series, xTicks, yMin = 0, yMax, yTicks, formatY = (v) => `${v}`, height = 170,
}: {
  series: ChartSeries[];
  xTicks: string[];
  yMin?: number;
  yMax: number;
  yTicks: number[];
  formatY?: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const padL = 12 + Math.max(...yTicks.map((t) => formatY(t).length)) * 5.6, padR = 10, padT = 8, padB = 22;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = height - padT - padB;
  const n = series[0]?.data.length ?? 0;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * plotH;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="#eef1f4" />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#8a94a3">{formatY(t)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={padL + (i / (xTicks.length - 1)) * plotW} y={height - 6} fontSize={10} fill="#8a94a3"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>{t}</text>
          ))}
          {series.map((s) => (
            <g key={s.label}>
              {s.fill && (
                <path d={`${linePath(s.data, x, y)}L${x(n - 1)},${y(yMin)}L${x(0)},${y(yMin)}Z`} fill={s.color} opacity={0.08} />
              )}
              <path d={linePath(s.data, x, y)} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" />
            </g>
          ))}
          {hoverIdx != null && (
            <g pointerEvents="none">
              <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + plotH} stroke="#cbd5e1" strokeDasharray="3 3" />
              {series.map((s) => <circle key={s.label} cx={x(hoverIdx)} cy={y(s.data[hoverIdx])} r={3} fill={s.color} />)}
            </g>
          )}
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)} />
        </svg>
      )}
      {hoverIdx != null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(x(hoverIdx) + 10, width - 150), top: 6 }}>
          {series.map((s) => (
            <div key={s.label}><span className="dot" style={{ background: s.color }} />{s.label}: <b>{formatY(Math.round(s.data[hoverIdx] * 10) / 10)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label}><span className="dot" style={{ background: it.color }} />{it.label}{it.value && <b>{it.value}</b>}</span>
      ))}
    </div>
  );
}

export function Donut({ slices, center, sub, size = 150 }: { slices: { label: string; value: number; color: string }[]; center: React.ReactNode; sub?: string; size?: number }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = 40, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="#eef1f4" strokeWidth={16} />
        {slices.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx={50} cy={50} r={r} fill="none" stroke={s.color} strokeWidth={16} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}><title>{`${s.label}: ${s.value}`}</title></circle>;
          offset += len;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div><div style={{ fontSize: size * 0.2, fontWeight: 800, lineHeight: 1 }}>{center}</div>{sub && <div style={{ fontSize: 12, color: "#64748b" }}>{sub}</div>}</div>
      </div>
    </div>
  );
}

export function StackedBars({ data, keys, labels, height = 190, formatY = (v) => `${v}` }: {
  data: Record<string, unknown>[]; keys: { key: string; color: string; label: string }[]; labels: string[]; height?: number; formatY?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const num = (d: Record<string, unknown>, k: string) => Number(d[k] ?? 0);
  const totals = data.map((d) => keys.reduce((a, k) => a + num(d, k.key), 0));
  const max = Math.max(1, ...totals);
  const mag = 10 ** Math.floor(Math.log10(max));
  const yMax = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= max) ?? 10 * mag;
  const ticks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];
  const padL = 12 + Math.max(...ticks.map((t) => formatY(t).length)) * 5.6, padB = 22, padT = 8;
  const plotW = Math.max(10, width - padL - 6), plotH = height - padT - padB;
  const bw = plotW / data.length;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="#eef1f4" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#8a94a3">{formatY(t)}</text></g>)}
          {data.map((d, i) => {
            let acc = 0;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={padL + i * bw} y={padT} width={bw} height={plotH} fill={hover === i ? "#f1f5f9" : "transparent"} />
                {keys.map((k) => {
                  const v = num(d, k.key); const top = y(acc + v); const h = y(acc) - top; acc += v;
                  return <rect key={k.key} x={padL + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={Math.max(0, h)} fill={k.color} />;
                })}
                {i % Math.ceil(data.length / 6) === 0 && <text x={padL + i * bw + bw / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#8a94a3">{labels[i]}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(padL + hover * bw + bw, width - 140), top: 4 }}>
          <div><b>{labels[hover]}</b></div>
          {keys.map((k) => <div key={k.key}><span className="dot" style={{ background: k.color }} />{k.label}: <b>{num(data[hover], k.key).toLocaleString()}</b></div>)}
        </div>
      )}
    </div>
  );
}
