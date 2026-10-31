"""Beginning/end-of-day checks evaluated against live Argus data."""
from django.utils import timezone

from monitoring.domain_health import domain_summary
from monitoring.models import BusinessDomain, Exporter, NetworkDevice, Slo, VirtualMachine

from .models import Alert, BodEodCheck, BodEodRun, Ticket, UptimeCheck


def _domain_health(p):
    ok_states = set(p.get("accept", ["ok"]))
    bad = []
    for d in BusinessDomain.objects.filter(pk__in=p.get("domains", [])).prefetch_related("services"):
        h = domain_summary(d, d.services.all())["health"]
        if h not in ok_states:
            bad.append(f"{d.name}={h}")
    return (not bad, ", ".join(bad) or "all domains healthy")


def _device_online(p):
    qs = NetworkDevice.objects.filter(pk__in=p["devices"]) if p.get("devices") else NetworkDevice.objects.filter(device_type__in=p.get("types", []))
    off = [d.hostname for d in qs if d.status != "online"]
    return (not off, f"offline: {', '.join(off)}" if off else f"{qs.count()} device(s) online")


def _vm_running(p):
    qs = VirtualMachine.objects.filter(pk__in=p.get("vms", []))
    off = [v.name for v in qs if v.state != "running"]
    return (not off, f"not running: {', '.join(off)}" if off else f"{qs.count()} VM(s) running")


def _uptime(p):
    qs = UptimeCheck.objects.exclude(status="paused")
    if p.get("tag"):
        qs = qs.filter(tags__icontains=p["tag"])
    down = [c.name for c in qs if c.status != "up"]
    return (not down, f"not up: {', '.join(down)}" if down else f"{qs.count()} check(s) up")


def _exporters(p):
    total = Exporter.objects.count()
    active = Exporter.objects.filter(status="active").count()
    pct = active / total * 100 if total else 0
    return (pct >= p.get("minPct", 80), f"{active}/{total} active ({pct:.0f}%, need {p.get('minPct', 80)}%)")


def _slo(p):
    qs = Slo.objects.filter(pk__in=p["slos"]) if p.get("slos") else Slo.objects.all()
    bad = [s.name for s in qs if s.actual < s.target]
    return (not bad, f"breaching: {', '.join(bad)}" if bad else f"{qs.count()} SLO(s) within target")


def _no_critical_alerts(p):
    n = Alert.objects.filter(severity="critical", status="firing").count()
    return (n == 0, f"{n} critical alert(s) firing" if n else "no critical alerts firing")


def _open_p1(p):
    open_ = Ticket.objects.filter(ticket_type="incident", priority="P1").exclude(state__in=["resolved", "closed", "cancelled"])
    nums = list(open_.values_list("number", flat=True))
    return (not nums, f"open P1: {', '.join(nums)}" if nums else "no open P1 incidents")


EVALUATORS = {"domain_health": _domain_health, "device_online": _device_online, "vm_running": _vm_running, "uptime": _uptime,
              "exporters": _exporters, "slo": _slo, "no_critical_alerts": _no_critical_alerts, "open_p1": _open_p1}


def evaluate(check):
    ok, detail = EVALUATORS[check.kind](check.params or {})
    return {"checkId": check.id, "check": check.name, "category": check.category, "critical": check.critical,
            "status": "pass" if ok else ("fail" if check.critical else "warn"), "detail": detail}


def run(phase, actor):
    started = timezone.now()
    checks = BodEodCheck.objects.filter(enabled=True, phase__in=[phase, "BOTH"])
    results = [evaluate(c) for c in checks]
    status = "fail" if any(r["status"] == "fail" for r in results) else "warn" if any(r["status"] == "warn" for r in results) else "pass"
    return BodEodRun.objects.create(phase=phase, started_at=started, finished_at=timezone.now(), status=status,
                                    triggered_by=actor, results=results)
