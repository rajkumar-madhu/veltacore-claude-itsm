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
