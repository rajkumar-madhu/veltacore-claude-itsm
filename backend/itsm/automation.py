"""Runbook execution and alert-triggered automation rules.

There is no remote execution agent: read-only steps (HTTP/TCP checks, health
verification, waits) really run; steps that would change a system (service
restarts, scripts, notifications) are recorded as skipped in dry-run mode.
"""
import time

from django.utils import timezone

from monitoring.domain_health import domain_summary
from monitoring.models import BusinessDomain, NetworkDevice, VirtualMachine

from .checks import CheckError, http_check, tcp_check
from .models import AutomationRule, RunbookExecution

READ_ONLY = {"http_check", "tcp_check", "verify_health", "wait"}


def _verify_health(target):
    kind, _, ident = target.partition(":")
    if kind == "domain":
        d = BusinessDomain.objects.filter(pk=ident).prefetch_related("services").first()
        if not d:
            return False, f"unknown domain {ident}"
        h = domain_summary(d, d.services.all())["health"]
        return h in ("ok", "warn"), f"{d.name} health = {h}"
    if kind == "device":
        dev = NetworkDevice.objects.filter(pk=ident).first()
        return (bool(dev) and dev.status == "online"), (f"{dev.hostname} is {dev.status}" if dev else f"unknown device {ident}")
    if kind == "vm":
        vm = VirtualMachine.objects.filter(pk=ident).first()
        return (bool(vm) and vm.state == "running"), (f"{vm.name} is {vm.state}" if vm else f"unknown VM {ident}")
    return False, "target must be domain:<id>, device:<id> or vm:<id>"


def _run_step(step):
    t, target = step.get("type"), step.get("target", "")
    start = time.monotonic()
    try:
        if t == "http_check":
            r = http_check(target, int(step.get("params", {}).get("expected", 200)), 5)
            ok, detail = r["ok"], (f"HTTP {r['code']} in {r['ms']} ms" if r["code"] else r["error"])
        elif t == "tcp_check":
            r = tcp_check(target, 5)
            ok, detail = r["ok"], (f"connected in {r['ms']} ms" if r["ok"] else r["error"])
        elif t == "verify_health":
            ok, detail = _verify_health(target)
        elif t == "wait":
            secs = min(5, int(step.get("params", {}).get("seconds", 1)))
            time.sleep(secs)
            ok, detail = True, f"waited {secs}s"
        else:
            return {"name": step.get("name", t), "type": t, "status": "skipped",
                    "detail": f"dry run — would {t.replace('_', ' ')} on {target or 'target'} (no execution agent connected)", "ms": 0}
    except CheckError as e:
        ok, detail = False, str(e)
    return {"name": step.get("name", t), "type": t, "status": "passed" if ok else "failed", "detail": detail,
            "ms": round((time.monotonic() - start) * 1000)}


def execute(runbook, triggered_by):
    started = timezone.now()
    results = [_run_step(s) for s in runbook.steps]
    executed = [r for r in results if r["status"] != "skipped"]
    status = "failed" if any(r["status"] == "failed" for r in executed) else "success"
    return RunbookExecution.objects.create(runbook=runbook, started_at=started, finished_at=timezone.now(), status=status,
                                           triggered_by=triggered_by, step_results=results)


def rule_matches(rule, alert):
    return ((not rule.match_severity or rule.match_severity == alert.severity)
            and (not rule.match_source or rule.match_source.lower() == alert.source.lower())
            and (not rule.match_text or rule.match_text.lower() in f"{alert.title} {alert.target}".lower()))


def matching_rules(alert):
    rules = AutomationRule.objects.filter(enabled=True, runbook__enabled=True).select_related("runbook")
    return [r for r in rules if rule_matches(r, alert)]


def trigger_for_alert(alert):
    executions = []
    for rule in matching_rules(alert):
        executions.append(execute(rule.runbook, f"rule: {rule.name} ({alert.title})"))
        rule.last_triggered = timezone.now()
        rule.trigger_count += 1
        rule.save(update_fields=["last_triggered", "trigger_count"])
    return executions
