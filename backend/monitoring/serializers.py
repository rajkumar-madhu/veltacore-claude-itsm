from rest_framework import serializers

from .models import Monitor, Site, Slo, SyntheticCheck


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "name", "region", "devices", "health", "lat", "lng"]


class SloSerializer(serializers.ModelSerializer):
    burnRate = serializers.FloatField(source="burn_rate")

    class Meta:
        model = Slo
        fields = ["id", "name", "service", "type", "target", "actual", "window", "burnRate"]


class MonitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Monitor
        fields = ["id", "name", "type", "query", "state", "warn", "crit", "window", "scope", "since"]


class SyntheticCheckSerializer(serializers.ModelSerializer):
    lastRun = serializers.CharField(source="last_run")

    class Meta:
        model = SyntheticCheck
        fields = ["id", "name", "type", "target", "uptime", "p95", "status", "interval", "locations", "lastRun"]
