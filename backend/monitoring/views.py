from rest_framework import viewsets

from .models import Monitor, Site, Slo, SyntheticCheck
from .serializers import MonitorSerializer, SiteSerializer, SloSerializer, SyntheticCheckSerializer


class SiteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer
    pagination_class = None


class SloViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Slo.objects.all()
    serializer_class = SloSerializer
    pagination_class = None


class MonitorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Monitor.objects.all()
    serializer_class = MonitorSerializer
    pagination_class = None


class SyntheticCheckViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SyntheticCheck.objects.all()
    serializer_class = SyntheticCheckSerializer
    pagination_class = None
