/**
 * Read-only demo mode (VITE_DEMO=1 builds only).
 * Serves GET requests from a captured API snapshot embedded in the page as
 * <script type="application/json" id="argus-demo-data">, and refuses writes.
 */
type Snap = Record<string, { s: number; t: string; b: string }>;

const READ_ONLY = "This is a read-only demo snapshot, so changes aren't saved. Run Argus locally to create, edit and run things.";

function camel(k: string) { return k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()); }

/** When an exact URL wasn't captured, filter the captured base list by the query parameters. */
function fallback(snap: Snap, path: string, params: URLSearchParams): unknown | undefined {
  const base = snap[path];
  if (!base) return undefined;
  let rows: unknown;
  try { rows = JSON.parse(base.b); } catch { return undefined; }
  if (!Array.isArray(rows)) return rows;
  let out = rows as Record<string, unknown>[];
  for (const [k, v] of params) {
    if (!v || k === "limit") continue;
    if (k === "q") { const q = v.toLowerCase(); out = out.filter((r) => JSON.stringify(r).toLowerCase().includes(q)); continue; }
    if (k === "open") { out = out.filter((r) => !["resolved", "closed", "cancelled", "rejected", "fulfilled", "implemented"].includes(String(r.state))); continue; }
    const key = k === "exporter" ? "exporterId" : camel(k);
    if (out.length && !(key in out[0])) continue;
    out = out.filter((r) => String(r[key]).toLowerCase() === v.toLowerCase());
  }
  const limit = Number(params.get("limit"));
  return limit > 0 ? out.slice(0, limit) : out;
}

export function installDemo() {
  const el = document.getElementById("argus-demo-data");
  const snap: Snap = el ? JSON.parse(el.textContent || "{}") : {};
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://demo.local");
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/data/")) return realFetch(input, init);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (method !== "GET") return json({ detail: READ_ONLY }, 403);
    const hit = snap[url.pathname + url.search] ?? (url.search ? undefined : snap[url.pathname]);
    if (hit) return new Response(hit.b, { status: hit.s, headers: { "Content-Type": hit.t } });
    const fb = fallback(snap, url.pathname, url.searchParams);
    if (fb !== undefined) return json(fb);
    if (url.pathname === "/api/itsm/search/") return json([]);
    return json({ detail: "Not included in this demo snapshot." }, 404);
  };

  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.textContent = "Read-only demo · snapshot of Argus demo data · saving and running actions are disabled";
  document.body.appendChild(bar);
}
