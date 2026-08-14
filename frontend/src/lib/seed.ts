// Local fallback data so screens render standalone when the backend is
// unreachable. Mirrors the backend seed_demo command exactly.
import type { MonitorRow, SiteRow, SloRow, SyntheticRow } from "@/api/hooks";

export const SEED_SITES: SiteRow[] = [
  { id: "dc-blr-1", name: "Bangalore DC-1", region: "APAC", devices: 412, health: 96, lat: 12.97, lng: 77.59 },
  { id: "dc-fra-1", name: "Frankfurt DC-1", region: "EMEA", devices: 287, health: 91, lat: 50.11, lng: 8.68 },
  { id: "dc-nyc-1", name: "New York DC-1", region: "AMER", devices: 318, health: 98, lat: 40.71, lng: -74.0 },
  { id: "br-mum", name: "Mumbai Branch", region: "APAC", devices: 46, health: 100, lat: 19.07, lng: 72.87 },
  { id: "br-sgp", name: "Singapore Branch", region: "APAC", devices: 38, health: 88, lat: 1.35, lng: 103.82 },
];

export const SEED_SLOS: SloRow[] = [
  { id: "SLO-01", name: "Order API availability", service: "oms-gateway", type: "Availability", target: 99.9, actual: 99.94, window: "30d", burnRate: 0.6 },
  { id: "SLO-02", name: "Order round-trip latency p99 < 250µs", service: "oms-core", type: "Latency", target: 99.0, actual: 99.15, window: "30d", burnRate: 0.5 },
  { id: "SLO-03", name: "Market-data freshness < 50ms", service: "feed-handler", type: "Freshness", target: 99.5, actual: 99.71, window: "30d", burnRate: 0.4 },
  { id: "SLO-04", name: "Checkout error rate < 1%", service: "payments", type: "Error rate", target: 99.0, actual: 99.25, window: "30d", burnRate: 0.3 },
  { id: "SLO-05", name: "Login flow availability", service: "auth", type: "Availability", target: 99.95, actual: 99.97, window: "30d", burnRate: 0.3 },
];

export const SEED_MONITORS: MonitorRow[] = [
  { id: "MON-01", name: "Order round-trip p99 > 250µs", type: "Metric", query: "p99:oms.order.latency{tenant:fyers}", state: "ok", warn: 200, crit: 250, window: "5m", scope: "oms-core", since: "—" },
  { id: "MON-02", name: "NSE queue depth > 700", type: "Metric", query: "max:mq.queue.depth{adapter:nse}", state: "warn", warn: 500, crit: 700, window: "2m", scope: "feed-handler", since: "4m" },
  { id: "MON-03", name: "Checkout error rate anomaly", type: "Anomaly", query: "anomalies(sum:payments.errors{*}, 'basic', 2)", state: "ok", warn: 1, crit: 2, window: "10m", scope: "payments", since: "—" },
  { id: "MON-04", name: "Feed freshness > 50ms", type: "Metric", query: "avg:feed.nse.gap{*}", state: "ok", warn: 40, crit: 50, window: "1m", scope: "feed-handler", since: "—" },
  { id: "MON-05", name: "iLO exporter down", type: "Synthetic", query: "up{job='ilo-exporter'} == 0", state: "warn", warn: 1, crit: 1, window: "1m", scope: "hardware", since: "1h" },
  { id: "MON-06", name: "OMS latency AND queue high", type: "Composite", query: "MON-01 && MON-02", state: "ok", warn: 1, crit: 1, window: "5m", scope: "trading", since: "—" },
  { id: "MON-07", name: "Timeout log surge > 100/min", type: "Log", query: "logs('service:oms status:error \"timeout\"').index('*').rollup('count')", state: "ok", warn: 60, crit: 100, window: "5m", scope: "oms-gateway", since: "—" },
];

export const SEED_SYNTHETICS: SyntheticRow[] = [
  { id: "SYN-01", name: "Fyers login flow", type: "Browser", target: "https://fs-le-uat.finspot.in/login", uptime: 99.98, p95: 842, status: "up", interval: "1m", locations: 5, lastRun: "12s ago" },
  { id: "SYN-02", name: "Order API /v2/orders", type: "HTTP", target: "https://api.fyers.in/v2/orders", uptime: 99.91, p95: 214, status: "up", interval: "30s", locations: 5, lastRun: "8s ago" },
  { id: "SYN-03", name: "Market-data websocket", type: "TCP", target: "wss://feed.fyers.in:443", uptime: 99.95, p95: 22, status: "up", interval: "30s", locations: 4, lastRun: "5s ago" },
  { id: "SYN-04", name: "NSE gateway reachability", type: "ICMP", target: "10.20.4.11", uptime: 100, p95: 2, status: "up", interval: "1m", locations: 3, lastRun: "20s ago" },
  { id: "SYN-05", name: "Status page availability", type: "HTTP", target: "https://status.finspot.in", uptime: 100, p95: 96, status: "up", interval: "1m", locations: 5, lastRun: "18s ago" },
  { id: "SYN-06", name: "Payments gateway checkout", type: "HTTP", target: "https://pay.finspot.in/checkout", uptime: 99.92, p95: 165, status: "up", interval: "1m", locations: 5, lastRun: "3s ago" },
];
