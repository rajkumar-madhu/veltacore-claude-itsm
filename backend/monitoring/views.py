from django.conf import settings
from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import vm_actions
from .models import Monitor, Site, Slo, Snapshot, SyntheticCheck, VirtualMachine
from .serializers import (
    MonitorSerializer, SiteSerializer, SloSerializer, SyntheticCheckSerializer,
    VmDetailSerializer, VmListSerializer,
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
