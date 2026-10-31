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
