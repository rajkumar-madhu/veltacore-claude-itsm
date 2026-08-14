from django.db import models


class Site(models.Model):
    """A datacenter or branch location, plotted on the Global Domain Map by
    lat/lng. Give a site coordinates and it appears on the map automatically —
    no separate marker list to maintain."""
    id = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=200)
    region = models.CharField(max_length=32)
    devices = models.PositiveIntegerField(default=0)
    health = models.PositiveIntegerField(default=100)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)

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
    target = models.FloatField(default=99.0)
    actual = models.FloatField(default=99.0)
    window = models.CharField(max_length=8, default="30d")
    burn_rate = models.FloatField(default=1.0)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.name


class Monitor(models.Model):
    """An alert-rule monitor (metric/anomaly/composite/log/synthetic)."""
    id = models.CharField(primary_key=True, max_length=16)   # "MON-01"
    name = models.CharField(max_length=140)
    type = models.CharField(max_length=16, default="Metric")
    query = models.CharField(max_length=240, blank=True, default="")
    state = models.CharField(max_length=8, default="ok")     # ok · warn · alert · nodata
    warn = models.FloatField(default=0)
    crit = models.FloatField(default=0)
    window = models.CharField(max_length=8, default="5m")
    scope = models.CharField(max_length=48, blank=True, default="")
    since = models.CharField(max_length=16, blank=True, default="—")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.name


class SyntheticCheck(models.Model):
    """An uptime / API synthetic check (HTTP/TCP/ICMP/browser)."""
    id = models.CharField(primary_key=True, max_length=16)   # "SYN-01"
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=12, default="HTTP")
    target = models.CharField(max_length=200)
    uptime = models.FloatField(default=100.0)
    p95 = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, default="up")   # up · degraded · down
    interval = models.CharField(max_length=8, default="1m")
    locations = models.PositiveIntegerField(default=5)
    last_run = models.CharField(max_length=16, default="—")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.name
