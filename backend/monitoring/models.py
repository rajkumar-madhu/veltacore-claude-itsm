from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Site(models.Model):
    """A datacenter or branch location, plotted on the Global Domain Map by
    lat/lng. Give a site coordinates and it appears on the map automatically —
    no separate marker list to maintain."""
    id = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=200)
    region = models.CharField(max_length=32)
    devices = models.PositiveIntegerField(default=0)
    health = models.PositiveIntegerField(default=100, validators=[MaxValueValidator(100)])
    lat = models.FloatField(null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    lng = models.FloatField(null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Slo(models.Model):
    """A service level objective with its measured SLI and burn rate."""
    id = models.CharField(primary_key=True, max_length=16)   # "SLO-01"
    name = models.CharField(max_length=120)
    service = models.CharField(max_length=48)
    type = models.CharField(max_length=24)                   # Availability · Latency · Error rate · Freshness
    target = models.FloatField(default=99.0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    actual = models.FloatField(default=99.0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    window = models.CharField(max_length=8, default="30d")
    burn_rate = models.FloatField(default=1.0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name


class Monitor(models.Model):
    """An alert-rule monitor (metric/anomaly/composite/log/synthetic)."""
    STATE_CHOICES = [
        ("ok", "OK"),
        ("warn", "Warn"),
        ("alert", "Alert"),
        ("nodata", "No Data"),
    ]
    id = models.CharField(primary_key=True, max_length=16)   # "MON-01"
    name = models.CharField(max_length=140)
    type = models.CharField(max_length=16, default="Metric")
    query = models.CharField(max_length=240, blank=True, default="")
    state = models.CharField(max_length=8, default="ok", choices=STATE_CHOICES)
    warn = models.FloatField(default=0)
    crit = models.FloatField(default=0)
    window = models.CharField(max_length=8, default="5m")
    scope = models.CharField(max_length=48, blank=True, default="")
    since = models.CharField(max_length=16, blank=True, default="—")

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name


class Datastore(models.Model):
    STATUS_CHOICES = [("ok", "Healthy"), ("warn", "Warning"), ("crit", "Critical")]
    id = models.SlugField(primary_key=True, max_length=32)
    name = models.CharField(max_length=64)
    type = models.CharField(max_length=32)                    # "VMFS6 (SSD)"
    capacity_gb = models.PositiveIntegerField()
    used_gb = models.PositiveIntegerField()
    provisioning = models.CharField(max_length=32, default="Thin Provisioned")
    status = models.CharField(max_length=8, default="ok", choices=STATUS_CHOICES)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name


class VirtualMachine(models.Model):
    STATE_CHOICES = [("running", "Running"), ("stopped", "Powered Off"), ("suspended", "Suspended")]
    PCT = [MinValueValidator(0), MaxValueValidator(100)]

    id = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=64)
    ip = models.GenericIPAddressField()
    platform = models.CharField(max_length=16, default="VMware")      # VMware · Hyper-V · Proxmox
    hypervisor = models.CharField(max_length=48)                      # "VMware ESXi 7.0"
    vcenter = models.CharField(max_length=128, blank=True, default="")
    cluster = models.CharField(max_length=64)
    host = models.CharField(max_length=64)
    datastore = models.ForeignKey(Datastore, on_delete=models.PROTECT, related_name="vms")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="vms")
    os = models.CharField(max_length=64)
    os_family = models.CharField(max_length=16, default="Linux")
    environment = models.CharField(max_length=16, default="Production")
    role = models.CharField(max_length=32, blank=True, default="")
    vcpu = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(128)])
    memory_gb = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(4096)])
    tools_status = models.CharField(max_length=32, default="Running")
    state = models.CharField(max_length=10, default="running", choices=STATE_CHOICES)
    powered_on_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    description = models.CharField(max_length=240, blank=True, default="")
    ha_protected = models.BooleanField(default=True)
    cpu_pct = models.FloatField(default=0, validators=PCT)
    mem_pct = models.FloatField(default=0, validators=PCT)
    disk_pct = models.FloatField(default=0, validators=PCT)
    disk_used_gb = models.PositiveIntegerField(default=0)
    disk_provisioned_gb = models.PositiveIntegerField(default=0)
    net_in_mbps = models.FloatField(default=0)
    net_out_mbps = models.FloatField(default=0)
    # Inventory the hypervisor reports per VM (disks, NICs, guest processes &
    # services, recent log lines, open alerts, cluster hosts, advanced config).
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Snapshot(models.Model):
    vm = models.ForeignKey(VirtualMachine, on_delete=models.CASCADE, related_name="snapshots")
    name = models.CharField(max_length=80)
    created_at = models.DateTimeField()
    size_gb = models.PositiveIntegerField(default=0)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]


class VmEvent(models.Model):
    LEVEL_CHOICES = [("info", "Info"), ("warning", "Warning"), ("error", "Error")]
    vm = models.ForeignKey(VirtualMachine, on_delete=models.CASCADE, related_name="events")
    ts = models.DateTimeField()
    level = models.CharField(max_length=8, default="info", choices=LEVEL_CHOICES)
    message = models.CharField(max_length=240)

    class Meta:
        ordering = ["-ts", "-id"]


class SyntheticCheck(models.Model):
    """An uptime / API synthetic check (HTTP/TCP/ICMP/browser)."""
    STATUS_CHOICES = [
        ("up", "Up"),
        ("degraded", "Degraded"),
        ("down", "Down"),
    ]
    id = models.CharField(primary_key=True, max_length=16)   # "SYN-01"
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=12, default="HTTP")
    target = models.CharField(max_length=200)
    uptime = models.FloatField(default=100.0)
    p95 = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, default="up", choices=STATUS_CHOICES)
    interval = models.CharField(max_length=8, default="1m")
    locations = models.PositiveIntegerField(default=5)
    last_run = models.CharField(max_length=16, default="—")

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name
