"""Single source of truth for heatmap thresholds and derived health.

Each metric maps to ok / warn / crit / unknown. A service's health is its
worst user-facing signal (availability, response, errors, latency); resource
saturation (CPU, memory, disk, network) can raise it to warn but never to
crit on its own. A domain's health is its worst service (unknown when none
of its services report data).
"""
RANK = {"unknown": -1, "ok": 0, "warn": 1, "crit": 2}

# metric -> (warn_at, crit_at, higher_is_better)
THRESHOLDS = {
    "availability": (99.9, 99.5, True),
    "responseMs": (300, 600, False),
    "errorRate": (1.0, 2.0, False),
    "latencyP95Ms": (300, 600, False),
    "cpuPct": (70, 85, False),
    "memPct": (70, 85, False),
    "diskPct": (75, 90, False),
    "netPct": (70, 85, False),
}

FIELD = {
    "availability": "availability", "responseMs": "response_ms", "errorRate": "error_rate",
    "latencyP95Ms": "latency_p95_ms", "cpuPct": "cpu_pct", "memPct": "mem_pct", "diskPct": "disk_pct", "netPct": "net_pct",
}


def metric_status(metric, value):
    if value is None:
        return "unknown"
    warn, crit, higher_better = THRESHOLDS[metric]
    if higher_better:
        return "ok" if value >= warn else "warn" if value >= crit else "crit"
    return "ok" if value < warn else "warn" if value < crit else "crit"


def worst(statuses):
    statuses = [s for s in statuses if s != "unknown"]
    return max(statuses, key=RANK.__getitem__) if statuses else "unknown"


SIGNALS = ("availability", "responseMs", "errorRate", "latencyP95Ms")
SATURATION = ("cpuPct", "memPct", "diskPct", "netPct")


def service_health(statuses):
    signal = worst(statuses[m] for m in SIGNALS)
    saturation = worst(statuses[m] for m in SATURATION)
    if saturation == "crit":
        saturation = "warn"
    return worst([signal, saturation])


def service_snapshot(svc):
    values = {m: getattr(svc, f) for m, f in FIELD.items()}
    statuses = {m: metric_status(m, v) for m, v in values.items()}
    return {"id": svc.id, "name": svc.name, "host": svc.host, "values": values,
            "statuses": statuses, "health": service_health(statuses)}


def domain_summary(domain, services):
    snaps = [service_snapshot(s) for s in services]
    avail = [s["values"]["availability"] for s in snaps if s["values"]["availability"] is not None]
    err = [s["values"]["errorRate"] for s in snaps if s["values"]["errorRate"] is not None]
    p95 = [s["values"]["latencyP95Ms"] for s in snaps if s["values"]["latencyP95Ms"] is not None]
    return {
        "health": worst(s["health"] for s in snaps),
        "availability": round(min(avail), 2) if avail else None,      # weakest link
        "errorRate": round(sum(err) / len(err), 2) if err else None,
        "latencyP95Ms": round(max(p95)) if p95 else None,
        "services": snaps,
    }
