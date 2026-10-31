from concurrent.futures import ThreadPoolExecutor

from django.utils import timezone

from .checks import CheckError, http_check, tcp_check
from .models import UptimeCheck

HISTORY = 60


def run_check(check):
    try:
        r = http_check(check.target, check.expected_status, check.timeout_sec) if check.kind == "http" else tcp_check(check.target, check.timeout_sec)
    except CheckError as e:
        r = {"ok": False, "ms": None, "code": None, "error": str(e)}
    now = timezone.now()
    check.status = "up" if r["ok"] else "down"
    check.last_checked = now
    check.last_latency_ms = r["ms"]
    check.last_error = r["error"]
    check.history = (check.history + [{"ts": now.isoformat(), "ok": r["ok"], "ms": r["ms"]}])[-HISTORY:]
    check.save(update_fields=["status", "last_checked", "last_latency_ms", "last_error", "history"])
    return r


def run_many(checks):
    checks = [c for c in checks if c.status != "paused"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(run_check, checks))


def uptime_pct(check):
    h = check.history
    return round(sum(1 for x in h if x["ok"]) / len(h) * 100, 2) if h else None
