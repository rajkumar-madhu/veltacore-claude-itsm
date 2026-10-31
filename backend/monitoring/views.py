from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import device_actions, vm_actions
from .models import Monitor, NetworkDevice, Site, Slo, Snapshot, SyntheticCheck, VirtualMachine
from .serializers import (
    DeviceDetailSerializer, DeviceListSerializer, DeviceOnboardSerializer, MonitorSerializer,
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
