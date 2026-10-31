import React from "react";
import { useNavigate } from "react-router-dom";
import { CLASS_LEGEND, REL_LABEL, classColor } from "./cmdbMeta";

export interface GNode { id: number; name: string; ciClass: string; status: string; ciId: string }
export interface GEdge { id: number; source: number; target: number; relType: string }
interface P { x: number; y: number; vx: number; vy: number }

/** Deterministic force-directed layout (repulsion + springs + centring), computed once per graph. */
function layout(nodes: GNode[], edges: GEdge[], w: number, h: number) {
  const pos = new Map<number, P>();
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const r = Math.min(w, h) * 0.35;
    pos.set(n.id, { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, vx: 0, vy: 0 });
  });
  const list = [...pos.values()];
  const k = Math.sqrt((w * h) / Math.max(1, nodes.length)) * 0.55;
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 320;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const f = (k * k) / d2;
        const d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const e of edges) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = ((d - k) / d) * 0.08;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of list) {
      p.vx += (w / 2 - p.x) * 0.004; p.vy += (h / 2 - p.y) * 0.004;
      const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), max = 18 * cool + 1;
      if (sp > max) { p.vx = (p.vx / sp) * max; p.vy = (p.vy / sp) * max; }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.5; p.vy *= 0.5;
    }
  }
  return pos;
}

const W = 1200, H = 640;

export function TopologyGraph({ nodes, edges, rootId, height = 620 }: { nodes: GNode[]; edges: GEdge[]; rootId?: number; height?: number }) {
  const navigate = useNavigate();
  const pos = React.useMemo(() => layout(nodes, edges, W, H), [nodes, edges]);
  // fit the viewBox to the laid-out nodes (with room for labels) so small graphs aren't tiny and big ones aren't clipped
  const box = React.useMemo(() => {
    const ps = [...pos.values()];
    if (!ps.length) return { x: 0, y: 0, w: W, h: H };
    let x0 = Math.min(...ps.map((p) => p.x)) - 90, x1 = Math.max(...ps.map((p) => p.x)) + 90;
    let y0 = Math.min(...ps.map((p) => p.y)) - 40, y1 = Math.max(...ps.map((p) => p.y)) + 50;
    const minW = 560, aspect = W / H;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    // keep the container's aspect ratio
    if ((x1 - x0) / (y1 - y0) > aspect) { const c = (y0 + y1) / 2, h = (x1 - x0) / aspect; y0 = c - h / 2; y1 = c + h / 2; }
    else { const c = (x0 + x1) / 2, w = (y1 - y0) * aspect; x0 = c - w / 2; x1 = c + w / 2; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [pos]);
  const [view, setView] = React.useState({ x: 0, y: 0, s: 1 });
  const [hover, setHover] = React.useState<number | null>(null);
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const linked = React.useMemo(() => {
    if (hover === null) return null;
    const s = new Set([hover]);
    edges.forEach((e) => { if (e.source === hover) s.add(e.target); if (e.target === hover) s.add(e.source); });
    return s;
  }, [hover, edges]);

  const zoom = (f: number) => setView((v) => ({ ...v, s: Math.min(3, Math.max(0.4, v.s * f)) }));

  return (
    <>
      <div className="graph-wrap" style={{ height }}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="CI relationship graph"
          onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}
          onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }}
          onMouseMove={(e) => {
            const d = drag.current; if (!d) return;
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
            const k = box.w / (e.currentTarget.clientWidth || box.w);
            setView((v) => ({ ...v, x: d.vx + ((e.clientX - d.x) * k) / v.s, y: d.vy + ((e.clientY - d.y) * k) / v.s }));
          }}
          onMouseUp={() => { setTimeout(() => { drag.current = null; }, 0); }} onMouseLeave={() => { drag.current = null; }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <g transform={`translate(${box.x + box.w / 2} ${box.y + box.h / 2}) scale(${view.s}) translate(${-(box.x + box.w / 2) + view.x} ${-(box.y + box.h / 2) + view.y})`}>
            {edges.map((e) => {
              const a = pos.get(e.source), b = pos.get(e.target);
              if (!a || !b) return null;
              const dim = linked && !(linked.has(e.source) && linked.has(e.target));
              return (
                <g key={e.id} opacity={dim ? 0.12 : 1}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={1.3} markerEnd="url(#arrow)" />
                  {hover !== null && !dim && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} textAnchor="middle" style={{ fontSize: 10, fill: "#64748b" }}>{REL_LABEL[e.relType] ?? e.relType}</text>}
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id)!;
              const dim = linked && !linked.has(n.id);
              const c = classColor(n.ciClass);
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.2 : 1} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                  onClick={() => { if (!drag.current?.moved) navigate(`/cmdb/cis/${n.id}`); }}>
                  <title>{`${n.name} · ${n.ciClass} · ${n.status}`}</title>
                  <circle r={n.id === rootId ? 15 : 11} fill={c} stroke={n.status === "operational" ? "white" : n.status === "degraded" ? "#f59e0b" : "#94a3b8"} strokeWidth={n.status === "operational" ? 2 : 3.5} />
                  {n.id === rootId && <circle r={20} fill="none" stroke={c} strokeDasharray="3 3" />}
                  <text y={(n.id === rootId ? 15 : 11) + 13} textAnchor="middle">{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
                </g>
              );
            })}
          </g>
        </svg>
        <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 4 }}>
          <button className="btn sm" onClick={() => zoom(1.2)} aria-label="Zoom in"><i className="fa-solid fa-plus" /></button>
          <button className="btn sm" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out"><i className="fa-solid fa-minus" /></button>
          <button className="btn sm" onClick={() => setView({ x: 0, y: 0, s: 1 })} aria-label="Reset view"><i className="fa-solid fa-expand" /></button>
        </div>
      </div>
      <div className="graph-legend">
        {CLASS_LEGEND.map(([l, c]) => <span key={l}><b style={{ background: c }} />{l}</span>)}
        <span><b style={{ background: "white", border: "3px solid #f59e0b" }} />Degraded</span>
        <span className="cell-sub">Hover to highlight neighbours · click to open · drag to pan · scroll to zoom</span>
      </div>
    </>
  );
}
