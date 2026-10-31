from django.utils import timezone
from rest_framework import serializers

from .models import Datastore, Monitor, Site, Slo, Snapshot, SyntheticCheck, VirtualMachine, VmEvent


class DatastoreSerializer(serializers.ModelSerializer):
    capacityGb = serializers.IntegerField(source="capacity_gb")
    usedGb = serializers.IntegerField(source="used_gb")

    class Meta:
        model = Datastore
        fields = ["id", "name", "type", "capacityGb", "usedGb", "provisioning", "status"]


class SnapshotSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source="created_at")
    sizeGb = serializers.IntegerField(source="size_gb")

    class Meta:
        model = Snapshot
        fields = ["id", "name", "createdAt", "sizeGb", "description"]


class VmEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = VmEvent
        fields = ["id", "ts", "level", "message"]


class VmListSerializer(serializers.ModelSerializer):
    siteName = serializers.CharField(source="site.name")
    osFamily = serializers.CharField(source="os_family")
    memoryGb = serializers.IntegerField(source="memory_gb")
    cpuPct = serializers.FloatField(source="cpu_pct")
    memPct = serializers.FloatField(source="mem_pct")
    diskPct = serializers.FloatField(source="disk_pct")
    uptimeSeconds = serializers.SerializerMethodField()

    class Meta:
        model = VirtualMachine
        fields = [
            "id", "name", "ip", "platform", "cluster", "host", "siteName", "os", "osFamily",
            "environment", "role", "vcpu", "memoryGb", "state", "cpuPct", "memPct", "diskPct",
            "uptimeSeconds",
        ]

    def get_uptimeSeconds(self, vm):
        if vm.state != "running" or vm.powered_on_at is None:
            return None
        return int((timezone.now() - vm.powered_on_at).total_seconds())


class VmDetailSerializer(VmListSerializer):
    datastore = DatastoreSerializer()
    hostIp = serializers.SerializerMethodField()
    toolsStatus = serializers.CharField(source="tools_status")
    createdAt = serializers.DateTimeField(source="created_at")
    poweredOnAt = serializers.DateTimeField(source="powered_on_at")
    haProtected = serializers.BooleanField(source="ha_protected")
    diskUsedGb = serializers.IntegerField(source="disk_used_gb")
    diskProvisionedGb = serializers.IntegerField(source="disk_provisioned_gb")
    netInMbps = serializers.FloatField(source="net_in_mbps")
    netOutMbps = serializers.FloatField(source="net_out_mbps")
    snapshots = SnapshotSerializer(many=True)
    events = serializers.SerializerMethodField()

    class Meta(VmListSerializer.Meta):
        fields = VmListSerializer.Meta.fields + [
            "hypervisor", "vcenter", "hostIp", "datastore", "toolsStatus", "createdAt",
            "poweredOnAt", "description", "haProtected", "diskUsedGb", "diskProvisionedGb",
            "netInMbps", "netOutMbps", "details", "snapshots", "events",
        ]

    def get_hostIp(self, vm):
        return next((h["ip"] for h in vm.details.get("clusterHosts", []) if h["name"] == vm.host), None)

    def get_events(self, vm):
        return VmEventSerializer(vm.events.all()[:50], many=True).data


class VmSettingsSerializer(serializers.Serializer):
    vcpu = serializers.IntegerField(min_value=1, max_value=128)
    memoryGb = serializers.IntegerField(min_value=1, max_value=4096)
    description = serializers.CharField(max_length=240, allow_blank=True)


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
