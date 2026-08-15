from rest_framework import viewsets

from .models import Monitor, Site, Slo, SyntheticCheck
from .serializers import MonitorSerializer, SiteSerializer, SloSerializer, SyntheticCheckSerializer


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
