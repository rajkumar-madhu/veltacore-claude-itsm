from django.utils import timezone
from rest_framework import serializers

import re

from .models import (
    Datastore, DeviceEvent, Monitor, NetworkDevice, Site, Slo, Snapshot, SyntheticCheck, VirtualMachine, VmEvent,
)


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


class DeviceEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceEvent
        fields = ["id", "ts", "severity", "source", "message"]


def _uptime(device):
    if device.status != "online" or device.booted_at is None:
        return None
    return int((timezone.now() - device.booted_at).total_seconds())


class DeviceListSerializer(serializers.ModelSerializer):
    deviceType = serializers.CharField(source="device_type")
    siteId = serializers.CharField(source="site_id")
    siteName = serializers.CharField(source="site.name")
    lastSeen = serializers.DateTimeField(source="last_seen")
    onboardedAt = serializers.DateTimeField(source="onboarded_at")
    uptimeSeconds = serializers.SerializerMethodField()

    class Meta:
        model = NetworkDevice
        fields = ["id", "hostname", "deviceType", "vendor", "model", "ip", "siteId", "siteName",
                  "environment", "role", "status", "lastSeen", "onboardedAt", "uptimeSeconds"]

    def get_uptimeSeconds(self, d):
        return _uptime(d)


class DeviceDetailSerializer(DeviceListSerializer):
    mgmtIp = serializers.IPAddressField(source="mgmt_ip")
    osType = serializers.CharField(source="os_type")
    osVersion = serializers.CharField(source="os_version")
    cpuPct = serializers.FloatField(source="cpu_pct")
    memPct = serializers.FloatField(source="mem_pct")
    tempC = serializers.FloatField(source="temp_c")
    events = serializers.SerializerMethodField()

    class Meta(DeviceListSerializer.Meta):
        fields = DeviceListSerializer.Meta.fields + [
            "serial", "mgmtIp", "mac", "osType", "osVersion", "location", "contact", "description",
            "cpuPct", "memPct", "tempC", "details", "events",
        ]

    def get_events(self, d):
        return DeviceEventSerializer(d.events.all()[:50], many=True).data


HOSTNAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9.-]{0,62}")


class CmdbClassificationSerializer(serializers.Serializer):
    ciClass = serializers.CharField(max_length=48)
    businessService = serializers.CharField(max_length=64, allow_blank=True, default="")
    criticality = serializers.ChoiceField(choices=["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"])
    supportGroup = serializers.CharField(max_length=64, allow_blank=True, default="")


class MonitoringSetupSerializer(serializers.Serializer):
    checks = serializers.ListField(child=serializers.CharField(max_length=48), max_length=40, allow_empty=True)
    intervalSec = serializers.ChoiceField(choices=[30, 60, 300, 900])
    alertProfile = serializers.ChoiceField(choices=["Default", "Trading critical", "Business hours", "Silent (no paging)"])


class DeviceOnboardSerializer(serializers.Serializer):
    """Onboarding form / CSV row. camelCase in, model fields out."""
    deviceType = serializers.ChoiceField(choices=[c for c, _ in NetworkDevice.TYPE_CHOICES])
    hostname = serializers.CharField(max_length=64)
    ip = serializers.IPAddressField()
    mgmtIp = serializers.IPAddressField(required=False, allow_null=True, allow_blank=True)
    site = serializers.SlugRelatedField(slug_field="id", queryset=Site.objects.all())
    environment = serializers.ChoiceField(choices=[c for c, _ in NetworkDevice.ENV_CHOICES])
    vendor = serializers.CharField(max_length=48, required=False, allow_blank=True, default="")
    model = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    osType = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    osVersion = serializers.CharField(max_length=48, required=False, allow_blank=True, default="")
    role = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    description = serializers.CharField(max_length=240, required=False, allow_blank=True, default="")
    cmdb = CmdbClassificationSerializer(required=False)
    monitoring = MonitoringSetupSerializer(required=False)

    def validate_hostname(self, v):
        v = v.strip().upper()
        if not HOSTNAME_RE.fullmatch(v):
            raise serializers.ValidationError("Use letters, digits, dots and hyphens (max 63).")
        if NetworkDevice.objects.filter(pk=v.lower()).exists():
            raise serializers.ValidationError(f"{v} is already onboarded.")
        return v

    def validate_ip(self, v):
        if NetworkDevice.objects.filter(ip=v).exists():
            raise serializers.ValidationError(f"{v} is already used by another device.")
        return v

    def create(self, d):
        return NetworkDevice.objects.create(
            id=d["hostname"].lower(), hostname=d["hostname"], device_type=d["deviceType"],
            ip=d["ip"], mgmt_ip=d.get("mgmtIp") or None, site=d["site"], environment=d["environment"],
            vendor=d["vendor"], model=d["model"], os_type=d["osType"], os_version=d["osVersion"],
            role=d["role"], description=d["description"], status="unknown",
            onboarded_at=timezone.now(),
            details={k: dict(d[k]) for k in ("cmdb", "monitoring") if k in d},
        )


class DeviceEditSerializer(serializers.Serializer):
    role = serializers.CharField(max_length=64, allow_blank=True)
    location = serializers.CharField(max_length=64, allow_blank=True)
    contact = serializers.EmailField(allow_blank=True)
    description = serializers.CharField(max_length=240, allow_blank=True)
