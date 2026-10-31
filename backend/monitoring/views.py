from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import device_actions, logs, vm_actions
from .domain_health import domain_summary
from .models import (
    BusinessDomain, DeviceEvent, Exporter, LogEntry, LogVolume, Monitor, NetworkDevice, Site, Slo, Snapshot,
    SyntheticCheck, VirtualMachine, VmEvent,
)
from .serializers import (
    DeviceDetailSerializer, DeviceListSerializer, DeviceOnboardSerializer, DomainCreateSerializer, ExporterSerializer,
    ExporterWriteSerializer, MonitorSerializer,
    SiteSerializer, SloSerializer, SyntheticCheckSerializer, VmDetailSerializer, VmListSerializer,
)


class SiteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer


class SloViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Slo.objects.all()
    serializer_class = SloSerializer


class MonitorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Monitor.objects.all()
    serializer_class = MonitorSerializer


class SyntheticCheckViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SyntheticCheck.objects.all()
    serializer_class = SyntheticCheckSerializer


class DebugOrAuthenticated(BasePermission):
    """Reads are public like every other endpoint; power/config changes are
    open to anonymous callers only in DEBUG (there is no login UI yet)."""

    def has_permission(self, request, view):
        return settings.DEBUG or bool(request.user and request.user.is_authenticated)


class VirtualMachineViewSet(viewsets.ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = VirtualMachine.objects.select_related("site", "datastore")
        if self.action == "retrieve":
            qs = qs.prefetch_related(Prefetch("snapshots", queryset=Snapshot.objects.all()))
        return qs

    def get_serializer_class(self):
        return VmDetailSerializer if self.action == "retrieve" else VmListSerializer

    @action(detail=True, methods=["post"], url_path="action", permission_classes=[DebugOrAuthenticated])
    def perform_action(self, request, pk=None):
        self.get_object()  # 404 for unknown VM ids
        try:
            message = vm_actions.perform(pk, request.data.get("action", ""), request.data)
        except vm_actions.ActionError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": message})


MAX_BULK_ROWS = 500


class NetworkDeviceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    def get_queryset(self):
        qs = NetworkDevice.objects.select_related("site")
        if t := self.request.query_params.get("type"):
            qs = qs.filter(device_type=t)
        if self.request.query_params.get("sort") == "recent":
            qs = qs.order_by("-onboarded_at")
        return qs

    def get_serializer_class(self):
        return DeviceDetailSerializer if self.action == "retrieve" else DeviceListSerializer

    def get_permissions(self):
        return [DebugOrAuthenticated()] if self.request.method == "POST" else super().get_permissions()

    def create(self, request):
        s = DeviceOnboardSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        device = s.save()
        return Response(DeviceDetailSerializer(device).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "Send a non-empty 'rows' list."}, status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > MAX_BULK_ROWS:
            return Response({"detail": f"At most {MAX_BULK_ROWS} rows per import."}, status=status.HTTP_400_BAD_REQUEST)
        created, errors = [], []
        with transaction.atomic():
            for i, row in enumerate(rows, start=1):
                s = DeviceOnboardSerializer(data=row)
                if s.is_valid():
                    created.append(s.save().hostname)
                else:
                    errors.append({"row": i, "errors": {k: [str(e) for e in v] for k, v in s.errors.items()}})
        return Response({"created": created, "errors": errors})

    @action(detail=False, methods=["post"])
    def discover(self, request):
        try:
            return Response(device_actions.discover(str(request.data.get("ip", "")).strip()))
        except device_actions.ActionError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="action")
    def perform_action(self, request, pk=None):
        self.get_object()
        try:
            message = device_actions.perform(pk, request.data.get("action", ""), request.data)
        except device_actions.ActionError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": message})


def _domain_payload(domain, detail=False):
    summary = domain_summary(domain, domain.services.all())
    out = {"id": domain.id, "name": domain.name, "description": domain.description, "icon": domain.icon,
           "serviceCount": len(summary["services"]), **summary}
    if detail:
        health_by_name = {s["name"].lower(): s["health"] for s in summary["services"]}
        out["flow"] = [{"label": n, "health": health_by_name.get(n.lower(), "unknown")} for n in domain.flow]
        out["incidents"] = [
            {"id": i.id, "priority": i.priority, "title": i.title, "status": i.status, "openedAt": i.opened_at,
             "service": i.service.name if i.service else None}
            for i in domain.incidents.select_related("service").all()
        ]
        out["logs"] = domain.details.get("logs", [])
        out["traces"] = domain.details.get("traces", [])
    return out


class BusinessDomainViewSet(viewsets.ViewSet):
    def get_permissions(self):
        return [DebugOrAuthenticated()] if self.request.method in ("POST", "DELETE") else []

    def list(self, request):
        return Response([_domain_payload(d) for d in BusinessDomain.objects.prefetch_related("services")])

    def retrieve(self, request, pk=None):
        domain = BusinessDomain.objects.prefetch_related("services").filter(pk=pk).first()
        if domain is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_domain_payload(domain, detail=True))

    def create(self, request):
        s = DomainCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        last = BusinessDomain.objects.order_by("-sort_order").values_list("sort_order", flat=True).first() or 0
        d = BusinessDomain.objects.create(id=slugify(s.validated_data["name"])[:48], name=s.validated_data["name"],
                                          description=s.validated_data["description"], sort_order=last + 1)
        return Response(_domain_payload(d, detail=True), status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        domain = BusinessDomain.objects.filter(pk=pk).first()
        if domain is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if domain.services.exists():
            return Response({"detail": "Move or remove this domain's services before deleting it."}, status=status.HTTP_400_BAD_REQUEST)
        domain.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _pct_change(now, prev):
    return round((now - prev) / prev * 100, 1) if prev else None


def _vol_sum(qs):
    return qs.aggregate(t=Coalesce(Sum(F("info") + F("warn") + F("error")), 0))["t"]


class ExporterViewSet(viewsets.ViewSet):
    def get_permissions(self):
        return [DebugOrAuthenticated()] if self.request.method in ("POST", "PATCH", "DELETE") else []

    def _qs(self):
        since = timezone.now() - timedelta(hours=24)
        return Exporter.objects.select_related("site").annotate(logs24h=Coalesce(
            Sum(F("log_volumes__info") + F("log_volumes__warn") + F("log_volumes__error"), filter=Q(log_volumes__hour__gte=since)), 0))

    def _get(self, pk):
        return self._qs().filter(pk=pk).first()

    def list(self, request):
        qs, p = self._qs(), request.query_params
        if p.get("category"):
            qs = qs.filter(category=p["category"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("site"):
            qs = qs.filter(site_id=p["site"])
        if p.get("q"):
            qs = qs.filter(Q(name__icontains=p["q"]) | Q(target__icontains=p["q"]) | Q(exporter_type__icontains=p["q"]))
        return Response(ExporterSerializer(qs, many=True).data)

    def retrieve(self, request, pk=None):
        e = self._get(pk)
        if e is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        since = timezone.now() - timedelta(hours=24)
        data = ExporterSerializer(e).data
        data["recentLogs"] = [{"id": l.id, "ts": l.ts, "level": l.level, "message": l.message} for l in e.log_entries.all()[:20]]
        data["hourly"] = [{"hour": v.hour, "info": v.info, "warn": v.warn, "error": v.error}
                          for v in e.log_volumes.filter(hour__gte=since).order_by("hour")]
        return Response(data)

    def _save(self, serializer, instance=None):
        d = serializer.validated_data
        fields = dict(name=d["name"], exporter_type=d["exporterType"], category=d["category"], target=d["target"],
                      endpoint=d["endpoint"], site=d["site"], interval_sec=d["intervalSec"])
        if instance is None:
            # Unverified until a successful test or its first data; "inactive" is reserved for user-disabled.
            return Exporter.objects.create(id=slugify(d["name"])[:64], created_at=timezone.now(), status="not_configured", **fields)
        for k, v in fields.items():
            setattr(instance, k, v)
        if not instance.endpoint:
            instance.status = "not_configured"
        instance.save()
        return instance

    def create(self, request):
        s = ExporterWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(ExporterSerializer(self._get(self._save(s).pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        e = Exporter.objects.filter(pk=pk).first()
        if e is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        current = {"name": e.name, "exporterType": e.exporter_type, "category": e.category, "target": e.target,
                   "endpoint": e.endpoint, "site": e.site_id, "intervalSec": e.interval_sec}
        s = ExporterWriteSerializer(e, data={**current, **request.data})
        s.is_valid(raise_exception=True)
        if s.validated_data["name"] != e.name:
            return Response({"name": ["Renaming an exporter isn't supported; create a new one."]}, status=status.HTTP_400_BAD_REQUEST)
        self._save(s, e)
        return Response(ExporterSerializer(self._get(pk)).data)

    def destroy(self, request, pk=None):
        deleted, _ = Exporter.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        e = Exporter.objects.filter(pk=pk).first()
        if e is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not e.endpoint:
            return Response({"detail": "Set the exporter's host:port endpoint first."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ok, latency, err = device_actions.check_endpoint(e.endpoint)
        except device_actions.ActionError as ex:
            return Response({"detail": str(ex)}, status=status.HTTP_400_BAD_REQUEST)
        if e.status != "inactive":
            e.status = "active" if ok else "error"
        e.last_error = "" if ok else (err or "")[:200]
        if ok:
            e.last_seen = timezone.now()
        e.save(update_fields=["status", "last_error", "last_seen"])
        detail = f"{e.endpoint} answered in {latency} ms" if ok else err
        if e.status == "inactive":
            detail += " (exporter is disabled — enable it to resume collection)"
        return Response({"ok": ok, "latencyMs": latency, "status": e.status, "detail": detail})

    @action(detail=False, methods=["post"], url_path="bulk-action")
    def bulk_action(self, request):
        ids, act = request.data.get("ids"), request.data.get("action")
        if not isinstance(ids, list) or not ids or act not in ("enable", "disable", "delete"):
            return Response({"detail": "Send 'ids' and an action of enable, disable or delete."}, status=status.HTTP_400_BAD_REQUEST)
        qs = Exporter.objects.filter(pk__in=ids)
        if act == "delete":
            n = qs.count()  # delete() also counts cascaded log rows
            qs.delete()
            return Response({"detail": f"Deleted {n} exporter(s)", "count": n})
        if act == "disable":
            n = qs.update(status="inactive")
        else:
            n = qs.exclude(endpoint="").update(status="active") + qs.filter(endpoint="").update(status="not_configured")
        return Response({"detail": f"{act.capitalize()}d {n} exporter(s)", "count": n})

    @action(detail=False, methods=["post"], url_path="import")
    def import_rows(self, request):
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows or len(rows) > MAX_BULK_ROWS:
            return Response({"detail": f"Send 1–{MAX_BULK_ROWS} rows."}, status=status.HTTP_400_BAD_REQUEST)
        created, errors = [], []
        with transaction.atomic():
            for i, row in enumerate(rows, start=1):
                s = ExporterWriteSerializer(data=row)
                if s.is_valid():
                    created.append(self._save(s).name)
                else:
                    errors.append({"row": i, "errors": {k: [str(x) for x in v] for k, v in s.errors.items()}})
        return Response({"created": created, "errors": errors})

    @action(detail=False, methods=["get"])
    def stats(self, request):
        now = timezone.now()
        d24, d48 = now - timedelta(hours=24), now - timedelta(hours=48)
        all_exp = Exporter.objects.all()
        total = all_exp.count()
        new30 = all_exp.filter(created_at__gte=now - timedelta(days=30)).count()
        by_status = {k: all_exp.filter(status=k).count() for k, _ in Exporter.STATUS_CHOICES}
        by_cat = {k: all_exp.filter(category=k).count() for k, _ in Exporter.CATEGORY_CHOICES}
        logs_now = _vol_sum(LogVolume.objects.filter(hour__gte=d24))
        logs_prev = _vol_sum(LogVolume.objects.filter(hour__gte=d48, hour__lt=d24))
        ev_now = VmEvent.objects.filter(ts__gte=d24).count() + DeviceEvent.objects.filter(ts__gte=d24).count()
        ev_prev = (VmEvent.objects.filter(ts__gte=d48, ts__lt=d24).count()
                   + DeviceEvent.objects.filter(ts__gte=d48, ts__lt=d24).count())
        start = (now - timedelta(hours=23)).replace(minute=0, second=0, microsecond=0)
        buckets = {start + timedelta(hours=h): {"info": 0, "warn": 0, "error": 0} for h in range(24)}
        for v in LogVolume.objects.filter(hour__gte=start).values("hour").annotate(i=Sum("info"), w=Sum("warn"), e=Sum("error")):
            if v["hour"] in buckets:
                buckets[v["hour"]] = {"info": v["i"], "warn": v["w"], "error": v["e"]}
        top = self._qs().order_by("-logs24h")[:8]
        return Response({
            "total": total, "totalChangePct": _pct_change(total, total - new30), "byStatus": by_status, "byCategory": by_cat,
            "logs24h": logs_now, "logsChangePct": _pct_change(logs_now, logs_prev),
            "events24h": ev_now, "eventsChangePct": _pct_change(ev_now, ev_prev),
            "trend": [{"hour": h, **c} for h, c in buckets.items()],
            "topSources": [{"id": e.id, "name": e.name, "count": e.logs24h} for e in top],
        })


class LogViewSet(viewsets.ViewSet):
    def get_permissions(self):
        return [DebugOrAuthenticated()] if self.request.method == "POST" else []

    def list(self, request):
        p = request.query_params
        qs = LogEntry.objects.select_related("exporter")
        if p.get("exporter"):
            qs = qs.filter(exporter_id=p["exporter"])
        if p.get("level"):
            qs = qs.filter(level=p["level"].upper())
        try:
            limit = max(1, min(200, int(p.get("limit", 50))))
        except ValueError:
            limit = 50
        return Response([{"id": l.id, "ts": l.ts, "exporter": l.exporter.name, "exporterId": l.exporter_id,
                          "level": l.level, "message": l.message} for l in qs[:limit]])

    # Exporters/agents push batches here. Outside DEBUG this requires an
    # authenticated session; per-exporter API tokens are not implemented yet.
    @action(detail=False, methods=["post"])
    def ingest(self, request):
        try:
            return Response(logs.ingest(request.data.get("entries")))
        except logs.IngestError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class EventViewSet(viewsets.ViewSet):
    SEVERITY = {"info": "info", "warning": "warning", "error": "critical", "critical": "critical"}

    def list(self, request):
        try:
            limit = max(1, min(100, int(request.query_params.get("limit", 10))))
        except ValueError:
            limit = 10
        vm = [{"ts": e.ts, "severity": self.SEVERITY[e.level], "source": e.vm.name, "message": e.message}
              for e in VmEvent.objects.select_related("vm")[:limit]]
        dev = [{"ts": e.ts, "severity": self.SEVERITY[e.severity], "source": f"{e.device.hostname}{f' {e.source}' if e.source and e.source != 'System' else ''}",
                "message": e.message} for e in DeviceEvent.objects.select_related("device")[:limit]]
        return Response(sorted(vm + dev, key=lambda x: x["ts"], reverse=True)[:limit])
