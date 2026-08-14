// Choropleth world map panel (Global Domain Map). Real country borders
// (Natural Earth 1:50m via world-atlas/topojson, fetched once from
// /data/world-countries-50m.json) rendered on a dark ground, hover-highlighted
// with a floating name tag. Datacenter/branch markers come straight off the
// live Site records (falling back to the local seed offline): give a site a
// lat/lng and it appears on the map automatically — no separate marker list
// to maintain, no manual "which country is this in" bookkeeping (that's
// derived from the coordinates via d3-geo's point-in-polygon test). A hub
// (the site with the most devices) fans traffic-arc routes out to every
// other site, so a newly onboarded site is wired into the map on sight.
import React from "react";
import { feature } from "topojson-client";
import { geoEquirectangular, geoPath, geoContains } from "d3-geo";
import { useSites } from "@/api/hooks";
import { SEED_SITES } from "@/lib/seed";
import type { SiteRow } from "@/api/hooks";

type Status = "ok" | "warn" | "crit";
const COLOR = { ok: "#2ecc71", warn: "#f2a01e", crit: "#e0321c" } as const;
const RANK = { ok: 0, warn: 1, crit: 2 } as const;
const worst = (a: Status, b: Status): Status => (RANK[a] >= RANK[b] ? a : b);
const statusOf = (health: number): Status => (health >= 95 ? "ok" : health >= 80 ? "warn" : "crit");

const vx = (lng: number) => lng + 180;
const vy = (lat: number) => 90 - lat;
const px = (lng: number) => ((lng + 180) / 360) * 100;
const py = (lat: number) => ((90 - lat) / 180) * 100;

function arcPath(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const cy = my - Math.min(28, dist * 0.22);
  return `M${p1.x},${p1.y} Q${mx},${cy} ${p2.x},${p2.y}`;
}

// scale/translate chosen so this reproduces vx()/vy() exactly (degrees, not
// radians): plain equirectangular, north up, seam at ±180° (mid-Pacific).
// Using d3-geo's projection/path pipeline (rather than hand-rolling the ring
// coordinates) matters for one reason: countries that cross the antimeridian
// (Russia, Fiji, the Aleutians…) get properly clipped into separate pieces —
// a naive lng/lat-to-x/y walk instead draws one long stray line connecting
// +179° straight across to -179°.
const projection = geoEquirectangular().scale(180 / Math.PI).translate([180, 90]);
const geoPathGen = geoPath(projection);
interface CountryFeature { name: string; geometry: any; d: string; labelX: number; labelY: number }

export function WorldMap({ title = "Global Domain Map" }: { title?: string }) {
  const [countries, setCountries] = React.useState<CountryFeature[] | null>(null);
  const [hover, setHover] = React.useState<{ name: string; x: number; y: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/data/world-countries-50m.json")
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
        const geo = feature(topo, topo.objects.countries) as unknown as { features: any[] };
        const shapes: CountryFeature[] = geo.features.map((f) => {
          const [labelX, labelY] = geoPathGen.centroid(f);
          return { name: f.properties.name as string, geometry: f.geometry, d: geoPathGen(f) ?? "", labelX, labelY };
        });
        setCountries(shapes);
      })
      .catch(() => setCountries([]));
    return () => { cancelled = true; };
  }, []);

  const sitesQuery = useSites();
  const sites: SiteRow[] = (sitesQuery.data?.length ? sitesQuery.data : SEED_SITES).filter(
    (s): s is SiteRow & { lat: number; lng: number } => s.lat != null && s.lng != null
  );

  const markers = React.useMemo(
    () => sites.map((s) => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng!, status: statusOf(s.health), devices: s.devices })),
    [sites]
  );
  const posOf = React.useCallback((m: { lng: number; lat: number }) => ({ x: vx(m.lng), y: vy(m.lat) }), []);

  const countryStatus = React.useMemo(() => {
    const map: Record<string, Status> = {};
    if (!countries) return map;
    for (const m of markers) {
      const hit = countries.find((c) => geoContains({ type: "Feature", geometry: c.geometry, properties: {} } as any, [m.lng, m.lat]));
      if (hit) map[hit.name] = worst(map[hit.name] ?? "ok", m.status);
    }
    return map;
  }, [countries, markers]);

  const routes = React.useMemo(() => {
    if (markers.length < 2) return [];
    const hub = markers.reduce((a, b) => (b.devices > a.devices ? b : a));
    return markers.filter((m) => m.id !== hub.id).map((m) => ({
      a: hub, b: m, mbps: 200 + m.devices * 3,
    }));
  }, [markers]);

  const totalMbps = routes.reduce((s, r) => s + r.mbps, 0);
  const impactedRoutes = routes.filter((r) => worst(r.a.status, r.b.status) !== "ok").length;

  return (
    <div style={{ background: "#0e0e0e", border: "1px solid #2b2b2b", borderRadius: 8, overflow: "hidden" }}>
      <style>{`
        @keyframes wmFlow { to { stroke-dashoffset: -20; } }
        .wm-arc { stroke-dasharray: 5 5; animation: wmFlow linear infinite; }
        @keyframes wmPing { 0% { transform: scale(0.5); opacity: 0.75; } 100% { transform: scale(2.2); opacity: 0; } }
        .wm-ping { position: absolute; inset: -7px; border-radius: 50%; border: 2px solid currentColor; animation: wmPing 1.6s ease-out infinite; }
        .wm-ping.warn { animation-duration: 2.1s; }
        .wm-country { fill: #e7e9ec; stroke: #3a3f47; stroke-width: 0.35; transition: fill 0.12s ease; cursor: default; }
        .wm-country:hover { fill: #9aa1ab; }
        .wm-country.ok { fill: #bfead0; }
        .wm-country.ok:hover { fill: #93dcb0; }
        .wm-country.warn { fill: #f7d79a; }
        .wm-country.warn:hover { fill: #f2c46d; }
        .wm-country.crit { fill: #f0a89f; }
        .wm-country.crit:hover { fill: #e8806f; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #2b2b2b", flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "#f0f0f0", fontWeight: 700, fontSize: 15 }}>{title}</span>
        <span style={{ display: "inline-flex", gap: 14, fontSize: 11.5, color: "#b8b8b8", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i className="fa-solid fa-arrow-right-arrow-left" style={{ fontSize: 9.5 }} /> {(totalMbps / 1000).toFixed(1)} Gbps cross-region
          </span>
          {impactedRoutes > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#ff8a80" }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 9.5 }} /> {impactedRoutes} route{impactedRoutes === 1 ? "" : "s"} impacted
            </span>
          )}
          {(["ok", "warn", "crit"] as const).map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR[s] }} />
              {s === "ok" ? "Healthy" : s === "warn" ? "Warning" : "Critical"}
            </span>
          ))}
        </span>
      </div>

      <div style={{ position: "relative", width: "100%", aspectRatio: "2 / 1" }}>
        <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {!countries && (
            <text x="180" y="90" textAnchor="middle" fill="#7d8896" fontSize="6">
              <tspan>Loading map…</tspan>
            </text>
          )}

          {countries?.map((c) => {
            const status = countryStatus[c.name];
            return (
              <path
                key={c.name}
                className={`wm-country${status ? ` ${status}` : ""}`}
                d={c.d}
                onMouseEnter={() => setHover({ name: c.name, x: c.labelX, y: c.labelY })}
                onMouseLeave={() => setHover((h) => (h?.name === c.name ? null : h))}
              />
            );
          })}

          {countries && routes.map((r) => {
            const status = worst(r.a.status, r.b.status);
            const d = arcPath(posOf(r.a), posOf(r.b));
            const width = Math.min(3, 0.7 + r.mbps / 900);
            const speed = Math.max(1.4, 4.4 - r.mbps / 700);
            return (
              <path
                key={r.a.id + r.b.id}
                className="wm-arc"
                d={d}
                fill="none"
                stroke={COLOR[status]}
                strokeWidth={width}
                strokeLinecap="round"
                opacity={status === "ok" ? 0.7 : 0.9}
                style={{ animationDuration: `${speed}s` }}
              >
                <title>{`${r.a.name} ↔ ${r.b.name} · ${r.mbps} Mbps${status !== "ok" ? ` · ${status}` : ""}`}</title>
              </path>
            );
          })}
        </svg>

        {hover && (
          <div style={{ position: "absolute", left: `${(hover.x / 360) * 100}%`, top: `${(hover.y / 180) * 100}%`, transform: "translate(-50%, -130%)", zIndex: 3, pointerEvents: "none", background: "#12181f", color: "#f0f0f0", fontSize: 11.5, fontWeight: 600, padding: "4px 9px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(0,0,0,.4)" }}>
            {hover.name}
            {countryStatus[hover.name] && (
              <span style={{ marginLeft: 6, color: COLOR[countryStatus[hover.name]] }}>
                <i className="fa-solid fa-circle" style={{ fontSize: 7 }} />
              </span>
            )}
          </div>
        )}

        {markers.map((m) => (
          <div key={m.id} title={`${m.name} · ${m.status}`} style={{ position: "absolute", left: `${px(m.lng)}%`, top: `${py(m.lat)}%`, transform: "translate(-50%,-50%)", zIndex: 2, color: COLOR[m.status] }}>
            {m.status !== "ok" && <span className={`wm-ping ${m.status}`} />}
            <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: COLOR[m.status], boxShadow: `0 0 0 3px ${COLOR[m.status]}33, 0 0 8px ${COLOR[m.status]}` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
