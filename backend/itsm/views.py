import csv
import io
import json
import urllib.request
from datetime import timedelta
from functools import reduce
from operator import or_

from django.contrib.auth import get_user_model
from django.db import IntegrityError, models
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from djangorestframework_camel_case.parser import CamelCaseJSONParser
from djangorestframework_camel_case.render import CamelCaseJSONRenderer
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes, renderer_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from monitoring.domain_health import THRESHOLDS, domain_summary
from monitoring.models import (
    BusinessDomain, DeviceEvent, DomainService, Exporter, Incident, LogEntry, NetworkDevice, Site, Slo, VirtualMachine, VmEvent,
)
from monitoring.views import DebugOrAuthenticated

from . import audit, automation, bod, cmdb_sync, uptime, workflow
from .checks import CheckError, http_check
from .models import (
    Alert, Asset, AuditLog, AutomationRule, BodEodCheck, BodEodRun, CatalogItem, CiRelationship, ConfigurationItem, Integration,
    KubeCluster, License, MonitoringTemplate, NotificationChannel, NotificationRule, RcaReport, Runbook, RunbookExecution,
    SoftwareProduct, SystemSetting, Ticket, TicketActivity, UptimeCheck, VmTemplate,
)
from .serializers import (
    AlertSerializer, AssetSerializer, AuditLogSerializer, AutomationRuleSerializer, BodEodCheckSerializer, BodEodRunSerializer,
    CatalogItemSerializer, CiRelationshipSerializer, ConfigurationItemSerializer, IntegrationSerializer, KubeClusterSerializer,
    LicenseSerializer, MonitoringTemplateSerializer, NotificationChannelSerializer, NotificationRuleSerializer, RcaReportSerializer,
    RunbookExecutionSerializer, RunbookSerializer, SiteAdminSerializer, SoftwareProductSerializer, SystemSettingSerializer,
    TicketDetailSerializer, TicketSerializer, UptimeCheckSerializer, UserSerializer, VmTemplateSerializer,
)

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CAMEL = {"renderer_classes": [CamelCaseJSONRenderer], "parser_classes": [CamelCaseJSONParser]}


class Base(viewsets.ModelViewSet):
    """camelCase JSON, writes gated like the rest of the API, ?field= filters, ?q= search, audit on write."""
    renderer_classes = CAMEL["renderer_classes"]
    parser_classes = CAMEL["parser_classes"]
    filter_fields: tuple = ()
    search_fields: tuple = ()
    audit_type = ""
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        return [DebugOrAuthenticated()] if self.request.method in WRITE_METHODS else [AllowAny()]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        for f in self.filter_fields:
            v = p.get(f)
            if v not in (None, ""):
                qs = qs.filter(**{f: v})
        q = p.get("q")
        if q and self.search_fields:
            qs = qs.filter(reduce(or_, [Q(**{f"{f}__icontains": q}) for f in self.search_fields]))
        return qs

    def _label(self, obj):
        return getattr(obj, "number", None) or getattr(obj, "name", None) or getattr(obj, "asset_tag", None) or str(obj.pk)

    def perform_create(self, serializer):
        obj = serializer.save()
        audit.record(self.request, "create", self.audit_type, obj.pk, f"Created {self.audit_type} {self._label(obj)}")

    def perform_update(self, serializer):
        obj = serializer.save()
        changed = ", ".join(sorted(serializer.validated_data)) or "no fields"
        audit.record(self.request, "update", self.audit_type, obj.pk, f"Updated {self.audit_type} {self._label(obj)} ({changed})")

    def perform_destroy(self, obj):
        label, pk = self._label(obj), obj.pk
        try:
            obj.delete()
        except models.ProtectedError:
            raise ValidationError({"detail": f"{label} is still referenced and can't be deleted."})
        audit.record(self.request, "delete", self.audit_type, pk, f"Deleted {self.audit_type} {label}")


def _err(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": msg}, status=code)


# ---------------- Service Desk ----------------

class TicketViewSet(Base):
    queryset = Ticket.objects.select_related("ci", "domain", "catalog_item")
    filter_fields = ("ticket_type", "state", "priority", "assignee", "assignment_group", "ci")
    search_fields = ("number", "title", "description", "requester", "assignee")
    audit_type = "ticket"
    http_method_names = ["get", "post", "patch"]  # tickets are cancelled/closed, never deleted

    def get_serializer_class(self):
        return TicketDetailSerializer if self.action == "retrieve" else TicketSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("open") == "true":
            qs = qs.exclude(state__in=workflow.DONE_STATES)
        return qs

    def create(self, request):
        s = TicketSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = dict(s.validated_data)
        ttype = d.pop("ticket_type")
        t = workflow.create(ticket_type=ttype, actor=audit.actor_of(request), **d)
        audit.record(request, "create", "ticket", t.number, f"Opened {t.number}: {t.title}")
        return Response(TicketDetailSerializer(t).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        t = serializer.instance
        if "extra" in serializer.validated_data:
            serializer.validated_data["extra"] = {**t.extra, **serializer.validated_data["extra"]}
        serializer.validated_data.pop("ticket_type", None)
        t = serializer.save(updated_at=timezone.now())
        TicketActivity.objects.create(ticket=t, ts=timezone.now(), author=audit.actor_of(self.request), kind="system",
                                      body="Updated " + ", ".join(sorted(serializer.validated_data)))
        audit.record(self.request, "update", "ticket", t.number, f"Updated {t.number}")

    def partial_update(self, request, *args, **kwargs):
        super().partial_update(request, *args, **kwargs)
        return Response(TicketDetailSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        t = self.get_object()
        try:
            workflow.transition(t, request.data.get("to", ""), audit.actor_of(request), request.data.get("note", ""))
        except workflow.WorkflowError as e:
            return _err(str(e))
        audit.record(request, "transition", "ticket", t.number, f"{t.number} → {t.state}")
        return Response(TicketDetailSerializer(t).data)

    @action(detail=True, methods=["post"])
    def comment(self, request, pk=None):
        t = self.get_object()
        body, kind = str(request.data.get("body", "")).strip(), request.data.get("kind", "comment")
        if not body or kind not in ("comment", "work_note"):
            return _err("Write something, and use kind 'comment' or 'work_note'.")
        TicketActivity.objects.create(ticket=t, ts=timezone.now(), author=audit.actor_of(request), kind=kind, body=body[:5000])
        t.updated_at = timezone.now()
        t.save(update_fields=["updated_at"])
        return Response(TicketDetailSerializer(t).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = Ticket.objects.all()
        if t := request.query_params.get("ticket_type"):
            qs = qs.filter(ticket_type=t)
        open_qs = qs.exclude(state__in=workflow.DONE_STATES)
        now = timezone.now()
        breached = sum(1 for x in qs.exclude(sla_due=None) if workflow.sla_status(x, now) == "breached")
        resolved = qs.exclude(resolved_at=None)
        mttr = [(x.resolved_at - x.created_at).total_seconds() / 3600 for x in resolved]
        return Response({
            "total": qs.count(), "open": open_qs.count(),
            "byState": dict(qs.values_list("state").annotate(n=Count("id"))),
            "byPriority": dict(open_qs.values_list("priority").annotate(n=Count("id"))),
            "slaBreached": breached, "mttrHours": round(sum(mttr) / len(mttr), 1) if mttr else None,
            "unassigned": open_qs.filter(assignee="").count(),
        })


class CatalogItemViewSet(Base):
    queryset = CatalogItem.objects.all()
    serializer_class = CatalogItemSerializer
    filter_fields = ("category", "active")
    search_fields = ("name", "description", "category")
    audit_type = "catalog item"

    @action(detail=True, methods=["post"])
    def order(self, request, pk=None):
        item = self.get_object()
        if not item.active:
            return _err("This catalog item is not available.")
        answers = request.data.get("answers") or {}
        missing = [f["label"] for f in item.form_fields if f.get("required") and not str(answers.get(f["key"], "")).strip()]
        if missing:
            return _err(f"Please fill in: {', '.join(missing)}")
        requester = str(request.data.get("requester", "")).strip() or audit.actor_of(request)
        t = workflow.create(ticket_type="request", actor=requester, title=item.name, category=item.category,
                            description=str(request.data.get("notes", ""))[:2000], priority=request.data.get("priority", "P3"),
                            requester=requester, catalog_item=item, assignment_group="Service Desk", extra={"answers": answers})
        if not item.approval_required:
            workflow.transition(t, "approved", "system", "auto-approved (no approval required)")
        audit.record(request, "create", "ticket", t.number, f"Requested {item.name} ({t.number})")
        return Response(TicketDetailSerializer(t).data, status=status.HTTP_201_CREATED)


# ---------------- CMDB & Assets ----------------

class ConfigurationItemViewSet(Base):
    queryset = ConfigurationItem.objects.select_related("site")
    serializer_class = ConfigurationItemSerializer
    filter_fields = ("ci_class", "status", "site", "source", "environment", "criticality")
    search_fields = ("ci_id", "name", "ip", "ci_class", "owner")
    audit_type = "CI"

    def perform_create(self, serializer):
        last = ConfigurationItem.objects.order_by("-ci_id").values_list("ci_id", flat=True).first()
        obj = serializer.save(ci_id=f"CI{int(last[2:]) + 1 if last else 100001}", source="manual", updated_at=timezone.now())
        audit.record(self.request, "create", "CI", obj.ci_id, f"Created CI {obj.name}")

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())
        audit.record(self.request, "update", "CI", serializer.instance.ci_id, f"Updated CI {serializer.instance.name}")

    def perform_destroy(self, obj):
        if obj.source != "manual":
            raise ValidationError({"detail": f"{obj.name} is synced from discovered inventory; retire it instead of deleting."})
        super().perform_destroy(obj)

    def retrieve(self, request, pk=None):
        ci = self.get_object()
        data = ConfigurationItemSerializer(ci).data
        rel = lambda r, other, direction: {"id": r.id, "relType": r.rel_type, "direction": direction, "ciId": other.id,
                                            "name": other.name, "ciClass": other.ci_class, "status": other.status}
        data["relationships"] = ([rel(r, r.target, "out") for r in ci.outgoing.select_related("target")]
                                 + [rel(r, r.source, "in") for r in ci.incoming.select_related("source")])
        data["tickets"] = TicketSerializer(ci.tickets.all()[:20], many=True).data
        data["assets"] = AssetSerializer(ci.assets.all(), many=True).data
        return Response(data)

    @action(detail=False, methods=["post"])
    def sync(self, request):
        result = cmdb_sync.sync()
        audit.record(request, "sync", "CMDB", "-", f"CMDB sync: {result['created']} created, {result['updated']} updated")
        return Response(result)

    @action(detail=False, methods=["get"])
    def graph(self, request):
        root = request.query_params.get("root")
        depth = min(4, int(request.query_params.get("depth", 2) or 2))
        rels = CiRelationship.objects.select_related("source", "target")
        if root:
            ids, frontier = {int(root)}, {int(root)}
            for _ in range(depth):
                nxt = set()
                for r in rels.filter(Q(source_id__in=frontier) | Q(target_id__in=frontier)):
                    nxt |= {r.source_id, r.target_id}
                frontier = nxt - ids
                ids |= nxt
            rels = rels.filter(source_id__in=ids, target_id__in=ids)
            nodes_qs = ConfigurationItem.objects.filter(id__in=ids)
        else:
            nodes_qs = ConfigurationItem.objects.filter(Q(outgoing__isnull=False) | Q(incoming__isnull=False)).distinct()
        nodes = [{"id": c.id, "name": c.name, "ciClass": c.ci_class, "status": c.status, "ciId": c.ci_id} for c in nodes_qs]
        edges = [{"id": r.id, "source": r.source_id, "target": r.target_id, "relType": r.rel_type} for r in rels]
        return Response({"nodes": nodes, "edges": edges})


class CiRelationshipViewSet(Base):
    queryset = CiRelationship.objects.select_related("source", "target")
    serializer_class = CiRelationshipSerializer
    filter_fields = ("rel_type", "source", "target")
    search_fields = ("source__name", "target__name")
    audit_type = "relationship"
    http_method_names = ["get", "post", "delete"]

    def perform_create(self, serializer):
        try:
            obj = serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "That relationship already exists."})
        audit.record(self.request, "create", "relationship", obj.pk, f"{obj.source.name} {obj.rel_type} {obj.target.name}")

    def _label(self, obj):
        return f"{obj.source.name} {obj.rel_type} {obj.target.name}"


class AssetViewSet(Base):
    queryset = Asset.objects.select_related("ci")
    serializer_class = AssetSerializer
    filter_fields = ("asset_type", "status", "vendor", "location")
    search_fields = ("asset_tag", "name", "serial", "model", "assigned_to")
    audit_type = "asset"

    @action(detail=False, methods=["get"])
    def lifecycle(self, request):
        today = timezone.localdate()
        horizon = today + timedelta(days=int(request.query_params.get("days", 180)))
        rows = []
        for a in Asset.objects.exclude(status="retired"):
            for kind, d in (("Warranty ends", a.warranty_end), ("End of life", a.eol_date)):
                if d and d <= horizon:
                    rows.append({"type": "asset", "kind": kind, "name": f"{a.asset_tag} · {a.name}", "date": d, "overdue": d < today, "ref": a.id})
        for s in SoftwareProduct.objects.exclude(eol_date=None).filter(eol_date__lte=horizon):
            rows.append({"type": "software", "kind": "Software end of support", "name": f"{s.name} {s.version} ({s.installs} installs)",
                         "date": s.eol_date, "overdue": s.eol_date < today, "ref": s.id})
        for lic in License.objects.select_related("product").exclude(expiry=None).filter(expiry__lte=horizon):
            rows.append({"type": "license", "kind": "License expiry", "name": f"{lic.product.name} — {lic.seats_used}/{lic.seats_total} seats",
                         "date": lic.expiry, "overdue": lic.expiry < today, "ref": lic.id})
        return Response(sorted(rows, key=lambda r: r["date"]))


class SoftwareProductViewSet(Base):
    queryset = SoftwareProduct.objects.all()
    serializer_class = SoftwareProductSerializer
    filter_fields = ("category", "vendor")
    search_fields = ("name", "vendor", "version")
    audit_type = "software"


class LicenseViewSet(Base):
    queryset = License.objects.select_related("product")
    serializer_class = LicenseSerializer
    filter_fields = ("license_type", "product")
    search_fields = ("product__name", "contract_ref")
    audit_type = "license"

    def _label(self, obj):
        return f"{obj.product.name} license"


# ---------------- Monitoring ----------------

class AlertViewSet(Base):
    queryset = Alert.objects.select_related("ticket")
    serializer_class = AlertSerializer
    filter_fields = ("status", "severity", "source")
    search_fields = ("title", "target", "rule", "fingerprint")
    audit_type = "alert"
    http_method_names = ["get", "post"]

    def _label(self, obj):
        return obj.title

    def create(self, request):
        """Alert ingestion: identical fingerprints re-fire the existing alert instead of duplicating it."""
        s = AlertSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        existing = Alert.objects.filter(fingerprint=d["fingerprint"]).first()
        now = timezone.now()
        if existing:
            if existing.status == "resolved":
                existing.status, existing.resolved_at, existing.started_at = "firing", None, now
                existing.save(update_fields=["status", "resolved_at", "started_at"])
            alert, created = existing, False
        else:
            alert, created = Alert.objects.create(started_at=now, **d), True
        executions = automation.trigger_for_alert(alert) if alert.status == "firing" else []
        audit.record(request, "create" if created else "refire", "alert", alert.pk, alert.title)
        out = AlertSerializer(alert).data
        out["automation"] = [{"runbook": e.runbook.name, "status": e.status, "executionId": e.id} for e in executions]
        return Response(out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def _set(self, request, alert, **fields):
        for k, v in fields.items():
            setattr(alert, k, v)
        alert.save()
        audit.record(request, fields.get("status", "update"), "alert", alert.pk, f"{alert.title} → {alert.status}")
        return Response(AlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        a = self.get_object()
        if a.status != "firing":
            return _err(f"Only firing alerts can be acknowledged (this one is {a.status}).")
        return self._set(request, a, status="acknowledged", acknowledged_by=audit.actor_of(request), acknowledged_at=timezone.now())

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        a = self.get_object()
        if a.status == "resolved":
            return _err("Already resolved.")
        return self._set(request, a, status="resolved", resolved_at=timezone.now())

    @action(detail=True, methods=["post"])
    def silence(self, request, pk=None):
        a = self.get_object()
        try:
            hours = int(request.data.get("hours", 2))
        except (TypeError, ValueError):
            hours = 0
        if not 1 <= hours <= 72:
            return _err("Silence for 1–72 hours.")
        if a.status == "resolved":
            return _err("Resolved alerts can't be silenced.")
        return self._set(request, a, status="silenced", silenced_until=timezone.now() + timedelta(hours=hours))

    @action(detail=True, methods=["post"], url_path="create-incident")
    def create_incident(self, request, pk=None):
        a = self.get_object()
        if a.ticket_id:
            return _err(f"Already linked to {a.ticket.number}.")
        prio = {"critical": "P1", "warning": "P3", "info": "P4"}[a.severity]
        ci = ConfigurationItem.objects.filter(name__iexact=a.target).first()
        t = workflow.create(ticket_type="incident", actor=audit.actor_of(request), title=a.title, priority=prio, ci=ci,
                            category="Monitoring", assignment_group="NOC", requester="Argus Alerting",
                            description=f"Raised from alert #{a.id} ({a.source}) on {a.target}. Rule: {a.rule or '—'}")
        a.ticket = t
        a.save(update_fields=["ticket"])
        audit.record(request, "create", "ticket", t.number, f"{t.number} raised from alert {a.title}")
        return Response(TicketSerializer(t).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        active = Alert.objects.exclude(status="resolved")
        return Response({
            "bySeverity": dict(active.filter(status="firing").values_list("severity").annotate(n=Count("id"))),
            "byStatus": dict(Alert.objects.values_list("status").annotate(n=Count("id"))),
            "bySource": dict(active.values_list("source").annotate(n=Count("id"))),
            "last24h": Alert.objects.filter(started_at__gte=timezone.now() - timedelta(hours=24)).count(),
        })


class UptimeCheckViewSet(Base):
    queryset = UptimeCheck.objects.all()
    serializer_class = UptimeCheckSerializer
    filter_fields = ("kind", "status")
    search_fields = ("name", "target", "tags")
    audit_type = "uptime check"

    @action(detail=True, methods=["post"])
    def run(self, request, pk=None):
        c = self.get_object()
        if c.status == "paused":
            return _err("This check is paused.")
        r = uptime.run_check(c)
        return Response({**UptimeCheckSerializer(c).data, "result": r})

    @action(detail=False, methods=["post"], url_path="run-all")
    def run_all(self, request):
        qs = self.get_queryset()[:50]
        results = uptime.run_many(list(qs))
        return Response({"ran": len(results), "up": sum(1 for r in results if r["ok"])})

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        c = self.get_object()
        c.status = "unknown" if c.status == "paused" else "paused"
        c.save(update_fields=["status"])
        audit.record(request, "update", "uptime check", c.pk, f"{c.name} {'paused' if c.status == 'paused' else 'resumed'}")
        return Response(UptimeCheckSerializer(c).data)


class MonitoringTemplateViewSet(Base):
    queryset = MonitoringTemplate.objects.all()
    serializer_class = MonitoringTemplateSerializer
    filter_fields = ("applies_to", "enabled")
    search_fields = ("name", "description", "applies_to")
    audit_type = "template"


# ---------------- BOD / EOD ----------------

class BodEodCheckViewSet(Base):
    queryset = BodEodCheck.objects.all()
    serializer_class = BodEodCheckSerializer
    filter_fields = ("phase", "category", "kind", "enabled")
    search_fields = ("name", "category")
    audit_type = "BOD/EOD check"

    @action(detail=True, methods=["post"])
    def evaluate(self, request, pk=None):
        return Response(bod.evaluate(self.get_object()))


class BodEodRunViewSet(Base):
    queryset = BodEodRun.objects.all()
    serializer_class = BodEodRunSerializer
    filter_fields = ("phase", "status")
    audit_type = "BOD/EOD run"
    http_method_names = ["get", "post"]

    def create(self, request):
        phase = request.data.get("phase")
        if phase not in ("BOD", "EOD"):
            return _err("phase must be BOD or EOD")
        run = bod.run(phase, audit.actor_of(request))
        audit.record(request, "run", "BOD/EOD run", run.pk, f"{phase} run: {run.status}")
        return Response(BodEodRunSerializer(run).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def latest(self, request):
        return Response({p: (BodEodRunSerializer(r).data if (r := BodEodRun.objects.filter(phase=p).first()) else None) for p in ("BOD", "EOD")})


# ---------------- Automation ----------------

class RunbookViewSet(Base):
    queryset = Runbook.objects.prefetch_related("executions")
    serializer_class = RunbookSerializer
    filter_fields = ("category", "enabled")
    search_fields = ("name", "description", "category")
    audit_type = "runbook"

    def perform_create(self, serializer):
        serializer.validated_data["updated_at"] = timezone.now()
        super().perform_create(serializer)

    def perform_update(self, serializer):
        serializer.validated_data["updated_at"] = timezone.now()
        super().perform_update(serializer)

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        rb = self.get_object()
        if not rb.enabled:
            return _err("Enable this runbook before running it.")
        e = automation.execute(rb, f"manual: {audit.actor_of(request)}")
        audit.record(request, "run", "runbook", rb.pk, f"Ran {rb.name}: {e.status}")
        return Response(RunbookExecutionSerializer(e).data, status=status.HTTP_201_CREATED)


class RunbookExecutionViewSet(Base):
    queryset = RunbookExecution.objects.select_related("runbook")
    serializer_class = RunbookExecutionSerializer
    filter_fields = ("runbook", "status")
    http_method_names = ["get"]


class AutomationRuleViewSet(Base):
    queryset = AutomationRule.objects.select_related("runbook")
    serializer_class = AutomationRuleSerializer
    filter_fields = ("enabled", "runbook")
    search_fields = ("name",)
    audit_type = "automation rule"

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """Which currently firing alerts this rule would act on (ignores the enabled flag)."""
        rule = self.get_object()
        return Response(AlertSerializer([a for a in Alert.objects.filter(status="firing") if automation.rule_matches(rule, a)], many=True).data)


# ---------------- Reports / audit ----------------

class RcaReportViewSet(Base):
    queryset = RcaReport.objects.select_related("problem")
    serializer_class = RcaReportSerializer
    filter_fields = ("status",)
    search_fields = ("number", "title", "summary", "root_cause")
    audit_type = "RCA"

    def perform_create(self, serializer):
        last = RcaReport.objects.order_by("-number").values_list("number", flat=True).first()
        n = int(last.split("-")[1]) + 1 if last else 1
        obj = serializer.save(number=f"RCA-{n:04d}", author=audit.actor_of(self.request), created_at=timezone.now())
        audit.record(self.request, "create", "RCA", obj.number, f"Drafted {obj.number}: {obj.title}")

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        r = self.get_object()
        missing = [f for f in ("summary", "root_cause", "impact") if not getattr(r, f).strip()]
        if missing:
            return _err(f"Fill in {', '.join(m.replace('_', ' ') for m in missing)} before publishing.")
        r.status, r.published_at = "published", timezone.now()
        r.save(update_fields=["status", "published_at"])
        audit.record(request, "publish", "RCA", r.number, f"Published {r.number}")
        return Response(RcaReportSerializer(r).data)

    @action(detail=True, methods=["get"])
    def markdown(self, request, pk=None):
        r = self.get_object()
        lines = [f"# {r.number}: {r.title}", "", f"Status: {r.get_status_display()} · Author: {r.author} · Created: {r.created_at:%Y-%m-%d}",
                 f"Problem: {r.problem.number if r.problem else '—'} · Incidents: {', '.join(r.incidents) or '—'}", "",
                 "## Summary", r.summary or "—", "", "## Impact", r.impact or "—", "", "## Root cause", r.root_cause or "—", "",
                 "## Timeline", *[f"- {t.get('ts', '')} — {t.get('event', '')}" for t in r.timeline], "",
                 "## Corrective actions", *[f"- [{'x' if a.get('done') else ' '}] {a.get('action', '')} ({a.get('owner', '—')}, due {a.get('due', '—')})" for a in r.actions]]
        resp = HttpResponse("\n".join(lines), content_type="text/markdown; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{r.number}.md"'
        return resp


class AuditLogViewSet(Base):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    filter_fields = ("action", "object_type", "actor")
    search_fields = ("summary", "object_id", "actor")
    http_method_names = ["get"]

    def list(self, request):
        qs = self.get_queryset()[:500]
        return Response(AuditLogSerializer(qs, many=True).data)


# ---------------- Administration ----------------

class UserViewSet(Base):
    serializer_class = UserSerializer
    search_fields = ("username", "email", "first_name", "last_name")
    audit_type = "user"
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = get_user_model().objects.select_related("profile").order_by("username")
        if q := self.request.query_params.get("q"):
            qs = qs.filter(reduce(or_, [Q(**{f"{f}__icontains": q}) for f in self.search_fields]))
        if r := self.request.query_params.get("role"):
            qs = qs.filter(profile__role=r)
        return qs

    def _label(self, obj):
        return obj.username


ROLE_MATRIX = {
    "super_admin": {"label": "Super Admin", "permissions": ["Everything, including users, roles and system settings"]},
    "admin": {"label": "Admin", "permissions": ["Manage tickets, CMDB, assets, monitoring and automation", "Manage sites and integrations"]},
    "operator": {"label": "Operator", "permissions": ["Work tickets and alerts", "Run runbooks and BOD/EOD checks", "Device/VM actions"]},
    "viewer": {"label": "Viewer", "permissions": ["Read-only access to all dashboards and records"]},
}


class SiteAdminViewSet(Base):
    queryset = Site.objects.all()
    serializer_class = SiteAdminSerializer
    filter_fields = ("region",)
    search_fields = ("id", "name", "region")
    audit_type = "site"


class IntegrationViewSet(Base):
    queryset = Integration.objects.all()
    serializer_class = IntegrationSerializer
    filter_fields = ("kind", "status")
    search_fields = ("name", "description")
    audit_type = "integration"

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        i = self.get_object()
        if not i.base_url:
            i.status, i.detail = "not_configured", "No base URL configured"
        else:
            try:
                r = http_check(i.base_url, 200, 5)
                ok = r["ok"] or (r["code"] is not None and r["code"] < 500)  # 401/403 still proves reachability
                i.status = "connected" if ok else "error"
                i.detail = f"HTTP {r['code']} in {r['ms']} ms" if r["code"] else r["error"]
            except CheckError as e:
                i.status, i.detail = "error", str(e)
        i.last_checked = timezone.now()
        i.save(update_fields=["status", "detail", "last_checked"])
        audit.record(request, "test", "integration", i.pk, f"Tested {i.name}: {i.status}")
        return Response(IntegrationSerializer(i).data)


class NotificationChannelViewSet(Base):
    queryset = NotificationChannel.objects.all()
    serializer_class = NotificationChannelSerializer
    filter_fields = ("kind", "enabled")
    search_fields = ("name", "target")
    audit_type = "notification channel"

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        ch = self.get_object()
        if ch.kind == "webhook":
            try:
                if not ch.target.startswith(("http://", "https://")):
                    raise CheckError("Webhook target must be an http(s) URL")
                from .checks import _guard_host
                from urllib.parse import urlsplit
                _guard_host(urlsplit(ch.target).hostname or "")
                body = json.dumps({"source": "argus", "type": "test", "message": f"Test notification from Argus ({ch.name})"}).encode()
                req = urllib.request.Request(ch.target, data=body, method="POST", headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    result = f"Delivered: HTTP {resp.status}"
            except Exception as e:  # noqa: BLE001 — report any delivery failure to the user
                result = f"Failed: {str(getattr(e, 'reason', e))[:150]}"
        else:
            result = f"Not sent: no {ch.get_kind_display()} provider credentials are configured on this server"
        ch.last_test, ch.last_test_result = timezone.now(), result
        ch.save(update_fields=["last_test", "last_test_result"])
        audit.record(request, "test", "notification channel", ch.pk, f"{ch.name}: {result}")
        return Response(NotificationChannelSerializer(ch).data)


class NotificationRuleViewSet(Base):
    queryset = NotificationRule.objects.select_related("channel")
    serializer_class = NotificationRuleSerializer
    filter_fields = ("enabled", "channel")
    search_fields = ("name",)
    audit_type = "notification rule"


class SystemSettingViewSet(Base):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    filter_fields = ("group",)
    search_fields = ("key", "description")
    audit_type = "setting"
    http_method_names = ["get", "patch"]

    def _label(self, obj):
        return obj.key


class VmTemplateViewSet(Base):
    queryset = VmTemplate.objects.all()
    serializer_class = VmTemplateSerializer
    filter_fields = ("platform",)
    search_fields = ("name", "os")
    audit_type = "VM template"

    def perform_create(self, serializer):
        serializer.validated_data["updated_at"] = timezone.now()
        super().perform_create(serializer)

    def perform_update(self, serializer):
        serializer.validated_data["updated_at"] = timezone.now()
        super().perform_update(serializer)


class KubeClusterViewSet(Base):
    queryset = KubeCluster.objects.select_related("site")
    serializer_class = KubeClusterSerializer
    http_method_names = ["get"]


# ---------------- computed views ----------------

def camel_api(methods=("GET",), write=False):
    def deco(fn):
        fn = renderer_classes(CAMEL["renderer_classes"])(fn)
        fn = parser_classes(CAMEL["parser_classes"])(fn)
        fn = permission_classes([DebugOrAuthenticated] if write else [AllowAny])(fn)
        return api_view(list(methods))(fn)
    return deco


@camel_api()
def roles(request):
    counts = dict(get_user_model().objects.values_list("profile__role").annotate(n=Count("id")))
    return Response([{"id": k, **v, "users": counts.get(k, 0)} for k, v in ROLE_MATRIX.items()])


@camel_api()
def thresholds(request):
    labels = {"availability": "Availability (%)", "responseMs": "Response time (ms)", "errorRate": "Error rate (%)",
              "latencyP95Ms": "p95 latency (ms)", "cpuPct": "CPU (%)", "memPct": "Memory (%)", "diskPct": "Disk (%)", "netPct": "Network (%)"}
    return Response({
        "metrics": [{"metric": k, "label": labels[k], "warn": w, "crit": c, "higherIsBetter": hb} for k, (w, c, hb) in THRESHOLDS.items()],
        "slos": [{"id": s.id, "name": s.name, "service": s.service, "target": s.target, "actual": s.actual, "window": s.window} for s in Slo.objects.all()],
    })


@camel_api(methods=("PATCH",), write=True)
def slo_target(request, slo_id):
    slo = Slo.objects.filter(pk=slo_id).first()
    if slo is None:
        return _err("Not found.", status.HTTP_404_NOT_FOUND)
    try:
        target = float(request.data.get("target"))
    except (TypeError, ValueError):
        return _err("target must be a number")
    if not 50 <= target < 100:
        return _err("target must be at least 50 and below 100")
    before = slo.target
    slo.target = target
    slo.save(update_fields=["target"])
    audit.record(request, "update", "SLO", slo.pk, f"{slo.name} target {before} → {target}")
    return Response({"id": slo.id, "target": slo.target})


def _domains_health():
    return {d.id: domain_summary(d, d.services.all()) for d in BusinessDomain.objects.prefetch_related("services")}


@camel_api()
def overview(request):
    dh = _domains_health()
    devices = NetworkDevice.objects.all()
    vms = VirtualMachine.objects.all()
    open_t = Ticket.objects.exclude(state__in=workflow.DONE_STATES)
    return Response({
        "domains": {h: sum(1 for d in dh.values() if d["health"] == h) for h in ("ok", "warn", "crit", "unknown")},
        "devices": {"total": devices.count(), "online": devices.filter(status="online").count(),
                    "byType": dict(devices.values_list("device_type").annotate(n=Count("id")))},
        "vms": {"total": vms.count(), "running": vms.filter(state="running").count()},
        "exporters": {"total": Exporter.objects.count(), "active": Exporter.objects.filter(status="active").count()},
        "alerts": dict(Alert.objects.filter(status="firing").values_list("severity").annotate(n=Count("id"))),
        "tickets": {"open": open_t.count(), "p1": open_t.filter(priority="P1").count(),
                    "byType": dict(open_t.values_list("ticket_type").annotate(n=Count("id")))},
        "uptime": {"total": UptimeCheck.objects.exclude(status="paused").count(), "up": UptimeCheck.objects.filter(status="up").count()},
        "slos": {"total": Slo.objects.count(), "breaching": sum(1 for s in Slo.objects.all() if s.actual < s.target)},
        "cis": ConfigurationItem.objects.count(),
    })


@camel_api()
def search(request):
    q = request.query_params.get("q", "").strip()
    if len(q) < 2:
        return _err("Search for at least 2 characters.")
    since = timezone.now() - timedelta(hours=int(request.query_params.get("hours", 168) or 168))
    out = []
    for t in Ticket.objects.filter(Q(number__icontains=q) | Q(title__icontains=q) | Q(description__icontains=q))[:25]:
        out.append({"kind": "ticket", "ts": t.created_at, "title": f"{t.number} {t.title}", "detail": f"{t.ticket_type} · {t.state} · {t.priority}", "link": f"/tickets/{t.id}"})
    for a in Alert.objects.filter(Q(title__icontains=q) | Q(target__icontains=q), started_at__gte=since)[:25]:
        out.append({"kind": "alert", "ts": a.started_at, "title": a.title, "detail": f"{a.severity} · {a.status} · {a.target}", "link": "/alerts"})
    for c in ConfigurationItem.objects.filter(Q(name__icontains=q) | Q(ip__icontains=q) | Q(ci_id__icontains=q))[:25]:
        out.append({"kind": "ci", "ts": c.updated_at, "title": f"{c.ci_id} {c.name}", "detail": f"{c.ci_class} · {c.status}", "link": f"/cmdb/cis/{c.id}"})
    for e in VmEvent.objects.select_related("vm").filter(Q(message__icontains=q) | Q(vm__name__icontains=q), ts__gte=since)[:25]:
        out.append({"kind": "event", "ts": e.ts, "title": f"{e.vm.name}: {e.message}", "detail": e.level, "link": f"/vms/{e.vm_id}"})
    for e in DeviceEvent.objects.select_related("device").filter(Q(message__icontains=q) | Q(device__hostname__icontains=q), ts__gte=since)[:25]:
        out.append({"kind": "event", "ts": e.ts, "title": f"{e.device.hostname}: {e.message}", "detail": e.severity, "link": f"/devices/{e.device_id}"})
    for lg in LogEntry.objects.select_related("exporter").filter(Q(message__icontains=q) | Q(exporter__name__icontains=q), ts__gte=since)[:25]:
        out.append({"kind": "log", "ts": lg.ts, "title": lg.message, "detail": f"{lg.level} · {lg.exporter.name}", "link": "/observe/logs"})
    for i in Incident.objects.select_related("domain").filter(Q(title__icontains=q) | Q(id__icontains=q), opened_at__gte=since)[:25]:
        out.append({"kind": "incident", "ts": i.opened_at, "title": f"{i.id} {i.title}", "detail": f"{i.priority} · {i.domain.name}", "link": "/heatmap"})
    return Response(sorted(out, key=lambda r: r["ts"], reverse=True))


@camel_api()
def rca(request):
    """Health/RCA for one domain service: its worst signals, related alerts, tickets, recent changes and events."""
    try:
        svc = DomainService.objects.select_related("domain").get(pk=int(request.query_params.get("service", 0)))
    except (DomainService.DoesNotExist, ValueError):
        return _err("Pick a service.", status.HTTP_404_NOT_FOUND)
    from monitoring.domain_health import service_snapshot
    snap = service_snapshot(svc)
    since = timezone.now() - timedelta(hours=24)
    names = {svc.name.lower(), svc.host.lower()}
    alerts = [a for a in Alert.objects.filter(started_at__gte=since) if a.target.lower() in names or svc.name.lower() in a.title.lower()]
    ci = ConfigurationItem.objects.filter(source="service", source_id=str(svc.id)).first()
    deps = [r.target for r in ci.outgoing.select_related("target")] if ci else []
    related_cis = ([ci] if ci else []) + deps
    changes = Ticket.objects.filter(ticket_type="change", updated_at__gte=timezone.now() - timedelta(days=7), ci__in=related_cis)
    incidents = Ticket.objects.filter(ticket_type="incident", ci__in=related_cis).exclude(state__in=workflow.DONE_STATES)
    vm_events = VmEvent.objects.filter(vm_id=svc.host, ts__gte=since)[:10]
    causes = []
    order = {"crit": 0, "warn": 1}
    for m, st in sorted(snap["statuses"].items(), key=lambda kv: order.get(kv[1], 9)):
        if st in order:
            causes.append({"kind": "metric", "confidence": "high" if st == "crit" else "medium",
                           "text": f"{m} is {st} ({snap['values'][m]})"})
    for c in changes:
        causes.append({"kind": "change", "confidence": "high", "text": f"Recent change {c.number}: {c.title} ({c.state})"})
    for e in vm_events:
        if e.level != "info":
            causes.append({"kind": "event", "confidence": "medium", "text": f"{svc.host}: {e.message}"})
    return Response({
        "service": {"id": svc.id, "name": svc.name, "host": svc.host, "domain": svc.domain.name, **snap},
        "causes": causes,
        "alerts": AlertSerializer(alerts, many=True).data,
        "incidents": TicketSerializer(incidents, many=True).data,
        "changes": TicketSerializer(changes, many=True).data,
        "dependencies": [{"name": c.name, "ciClass": c.ci_class, "status": c.status} for c in deps],
        "events": [{"ts": e.ts, "level": e.level, "message": e.message} for e in vm_events],
    })


@camel_api()
def provisioning(request):
    """Onboarding follow-up: what each recently onboarded device still needs."""
    rows = []
    ci_sources = set(ConfigurationItem.objects.filter(source="device").values_list("source_id", flat=True))
    exporter_targets = {t.lower() for t in Exporter.objects.values_list("target", flat=True)}
    for d in NetworkDevice.objects.select_related("site").order_by("-onboarded_at")[:30]:
        mon = d.details.get("monitoring", {})
        tasks = [
            {"task": "Reachable (discovery or poll)", "done": d.status == "online" or bool(d.details.get("lastDiscovery", {}).get("reachable"))},
            {"task": "Registered in CMDB", "done": d.id in ci_sources},
            {"task": "Monitoring checks configured", "done": bool(mon.get("checks")) or d.status == "online"},
            {"task": "Exporter / agent reporting", "done": d.hostname.lower() in exporter_targets or d.ip in exporter_targets or d.status == "online"},
            {"task": "Owner / contact set", "done": bool(d.contact)},
        ]
        rows.append({"id": d.id, "hostname": d.hostname, "deviceType": d.device_type, "ip": d.ip, "site": d.site.name,
                     "onboardedAt": d.onboarded_at, "status": d.status, "tasks": tasks, "done": sum(t["done"] for t in tasks)})
    return Response(rows)


@camel_api()
def analytics(request):
    now = timezone.now()
    days = [(now - timedelta(days=i)).date() for i in range(13, -1, -1)]
    tickets = list(Ticket.objects.all())
    per_day = lambda items, attr: [sum(1 for x in items if getattr(x, attr) and getattr(x, attr).date() == d) for d in days]
    incidents = [t for t in tickets if t.ticket_type == "incident"]
    resolved = [t for t in incidents if t.resolved_at]
    alerts = list(Alert.objects.all())
    return Response({
        "days": [d.isoformat() for d in days],
        "incidentsOpened": per_day(incidents, "created_at"),
        "incidentsResolved": per_day(incidents, "resolved_at"),
        "alerts": per_day(alerts, "started_at"),
        "mttrHours": round(sum((t.resolved_at - t.created_at).total_seconds() for t in resolved) / len(resolved) / 3600, 1) if resolved else None,
        "slaCompliance": round(sum(1 for t in tickets if workflow.sla_status(t, now) in ("met", "on_track", "at_risk"))
                               / max(1, sum(1 for t in tickets if t.sla_due)) * 100, 1),
        "ticketsByCategory": dict(Ticket.objects.values_list("category").annotate(n=Count("id"))),
        "ticketsByGroup": dict(Ticket.objects.exclude(assignment_group="").values_list("assignment_group").annotate(n=Count("id"))),
        "alertsBySource": dict(Alert.objects.values_list("source").annotate(n=Count("id"))),
        "topCis": [{"name": r["ci__name"], "count": r["n"]} for r in Ticket.objects.exclude(ci=None).values("ci__name").annotate(n=Count("id")).order_by("-n")[:6]],
    })


REPORTS = {
    "sla": "SLA compliance by ticket", "incidents": "Incident summary", "availability": "Service availability",
    "assets": "Asset register", "licenses": "License utilisation", "alerts": "Alert history (7 days)",
}


@camel_api()
def report_list(request):
    return Response([{"id": k, "name": v} for k, v in REPORTS.items()])


@api_view(["GET"])
@permission_classes([AllowAny])
def report_csv(request, report_id):
    if report_id not in REPORTS:
        return Response({"detail": "Unknown report."}, status=404)
    buf = io.StringIO()
    w = csv.writer(buf)
    now = timezone.now()
    if report_id == "sla":
        w.writerow(["Number", "Type", "Priority", "State", "Created", "SLA due", "Resolved", "SLA status"])
        for t in Ticket.objects.exclude(sla_due=None):
            w.writerow([t.number, t.ticket_type, t.priority, t.state, t.created_at.isoformat(), t.sla_due.isoformat(),
                        t.resolved_at.isoformat() if t.resolved_at else "", workflow.sla_status(t, now)])
    elif report_id == "incidents":
        w.writerow(["Number", "Title", "Priority", "State", "Assignee", "CI", "Created", "Resolved", "Hours open"])
        for t in Ticket.objects.filter(ticket_type="incident").select_related("ci"):
            end = t.resolved_at or now
            w.writerow([t.number, t.title, t.priority, t.state, t.assignee, t.ci.name if t.ci else "", t.created_at.isoformat(),
                        t.resolved_at.isoformat() if t.resolved_at else "", round((end - t.created_at).total_seconds() / 3600, 1)])
    elif report_id == "availability":
        w.writerow(["Domain", "Service", "Host", "Availability %", "Error rate %", "p95 ms", "Health"])
        from monitoring.domain_health import service_snapshot
        for s in DomainService.objects.select_related("domain"):
            snap = service_snapshot(s)
            w.writerow([s.domain.name, s.name, s.host, s.availability, s.error_rate, s.latency_p95_ms, snap["health"]])
    elif report_id == "assets":
        w.writerow(["Asset tag", "Name", "Type", "Vendor", "Model", "Serial", "Status", "Assigned to", "Location", "Warranty end", "EOL"])
        for a in Asset.objects.all():
            w.writerow([a.asset_tag, a.name, a.asset_type, a.vendor, a.model, a.serial, a.status, a.assigned_to, a.location, a.warranty_end or "", a.eol_date or ""])
    elif report_id == "licenses":
        w.writerow(["Product", "Version", "Type", "Seats used", "Seats total", "Utilisation %", "Expiry", "Annual cost"])
        for lic in License.objects.select_related("product"):
            w.writerow([lic.product.name, lic.product.version, lic.license_type, lic.seats_used, lic.seats_total,
                        round(lic.seats_used / lic.seats_total * 100, 1) if lic.seats_total else "", lic.expiry or "", lic.annual_cost or ""])
    elif report_id == "alerts":
        w.writerow(["Started", "Severity", "Status", "Source", "Target", "Title", "Ticket"])
        for a in Alert.objects.filter(started_at__gte=now - timedelta(days=7)).select_related("ticket"):
            w.writerow([a.started_at.isoformat(), a.severity, a.status, a.source, a.target, a.title, a.ticket.number if a.ticket else ""])
    resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="argus-{report_id}-{now:%Y%m%d}.csv"'
    return resp
