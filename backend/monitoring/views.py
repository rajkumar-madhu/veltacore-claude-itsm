from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from django.utils.text import slugify

from . import device_actions, vm_actions
from .domain_health import domain_summary
from .models import BusinessDomain, Monitor, NetworkDevice, Site, Slo, Snapshot, SyntheticCheck, VirtualMachine
from .serializers import (
    DeviceDetailSerializer, DeviceListSerializer, DeviceOnboardSerializer, DomainCreateSerializer, MonitorSerializer,
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
