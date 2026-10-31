from django.core.management import call_command
from django.core.management.base import BaseCommand

from monitoring.models import Exporter, Monitor, NetworkDevice, Site, Slo, SyntheticCheck, VirtualMachine

from ._seed_devices import seed_devices
from ._seed_domains import seed_domains
from ._seed_exporters import seed_exporters
from ._seed_vms import seed_vms


class Command(BaseCommand):
    help = "Seed demo data for the monitoring app."

    def handle(self, *args, **opts):
        # VMs, devices and exporters reference sites (PROTECT)
        VirtualMachine.objects.all().delete()
        NetworkDevice.objects.all().delete()
        Exporter.objects.all().delete()
        Site.objects.all().delete()
        Site.objects.bulk_create([
            Site(id="dc-blr-1", name="Bangalore DC-1", region="APAC", devices=412, health=96, lat=12.97, lng=77.59),
            Site(id="dc-fra-1", name="Frankfurt DC-1", region="EMEA", devices=287, health=91, lat=50.11, lng=8.68),
            Site(id="dc-nyc-1", name="New York DC-1", region="AMER", devices=318, health=98, lat=40.71, lng=-74.0),
            Site(id="br-mum", name="Mumbai Branch", region="APAC", devices=46, health=100, lat=19.07, lng=72.87),
            Site(id="br-sgp", name="Singapore Branch", region="APAC", devices=38, health=88, lat=1.35, lng=103.82),
        ])

        # SLOs — all within target (no breaching objectives).
        Slo.objects.all().delete()
        Slo.objects.bulk_create([
            Slo(id="SLO-01", name="Order API availability", service="oms-gateway", type="Availability", target=99.9, actual=99.94, window="30d", burn_rate=0.6),
            Slo(id="SLO-02", name="Order round-trip latency p99 < 250µs", service="oms-core", type="Latency", target=99.0, actual=99.15, window="30d", burn_rate=0.5),
            Slo(id="SLO-03", name="Market-data freshness < 50ms", service="feed-handler", type="Freshness", target=99.5, actual=99.71, window="30d", burn_rate=0.4),
            Slo(id="SLO-04", name="Checkout error rate < 1%", service="payments", type="Error rate", target=99.0, actual=99.25, window="30d", burn_rate=0.3),
            Slo(id="SLO-05", name="Login flow availability", service="auth", type="Availability", target=99.95, actual=99.97, window="30d", burn_rate=0.3),
        ])

        # Monitors — none alerting; two in a routine warning state.
        Monitor.objects.all().delete()
        Monitor.objects.bulk_create([
            Monitor(id="MON-01", name="Order round-trip p99 > 250µs", type="Metric", query="p99:oms.order.latency{tenant:fyers}", state="ok", warn=200, crit=250, window="5m", scope="oms-core", since="—"),
            Monitor(id="MON-02", name="NSE queue depth > 700", type="Metric", query="max:mq.queue.depth{adapter:nse}", state="warn", warn=500, crit=700, window="2m", scope="feed-handler", since="4m"),
            Monitor(id="MON-03", name="Checkout error rate anomaly", type="Anomaly", query="anomalies(sum:payments.errors{*}, 'basic', 2)", state="ok", warn=1, crit=2, window="10m", scope="payments", since="—"),
            Monitor(id="MON-04", name="Feed freshness > 50ms", type="Metric", query="avg:feed.nse.gap{*}", state="ok", warn=40, crit=50, window="1m", scope="feed-handler", since="—"),
            Monitor(id="MON-05", name="iLO exporter down", type="Synthetic", query="up{job='ilo-exporter'} == 0", state="warn", warn=1, crit=1, window="1m", scope="hardware", since="1h"),
            Monitor(id="MON-06", name="OMS latency AND queue high", type="Composite", query="MON-01 && MON-02", state="ok", warn=1, crit=1, window="5m", scope="trading", since="—"),
            Monitor(id="MON-07", name="Timeout log surge > 100/min", type="Log", query="logs('service:oms status:error \"timeout\"').index('*').rollup('count')", state="ok", warn=60, crit=100, window="5m", scope="oms-gateway", since="—"),
        ])

        # Synthetic checks — all up.
        SyntheticCheck.objects.all().delete()
        SyntheticCheck.objects.bulk_create([
            SyntheticCheck(id="SYN-01", name="Fyers login flow", type="Browser", target="https://fs-le-uat.finspot.in/login", uptime=99.98, p95=842, status="up", interval="1m", locations=5, last_run="12s ago"),
            SyntheticCheck(id="SYN-02", name="Order API /v2/orders", type="HTTP", target="https://api.fyers.in/v2/orders", uptime=99.91, p95=214, status="up", interval="30s", locations=5, last_run="8s ago"),
            SyntheticCheck(id="SYN-03", name="Market-data websocket", type="TCP", target="wss://feed.fyers.in:443", uptime=99.95, p95=22, status="up", interval="30s", locations=4, last_run="5s ago"),
            SyntheticCheck(id="SYN-04", name="NSE gateway reachability", type="ICMP", target="10.20.4.11", uptime=100, p95=2, status="up", interval="1m", locations=3, last_run="20s ago"),
            SyntheticCheck(id="SYN-05", name="Status page availability", type="HTTP", target="https://status.finspot.in", uptime=100, p95=96, status="up", interval="1m", locations=5, last_run="18s ago"),
            SyntheticCheck(id="SYN-06", name="Payments gateway checkout", type="HTTP", target="https://pay.finspot.in/checkout", uptime=99.92, p95=165, status="up", interval="1m", locations=5, last_run="3s ago"),
        ])

        sites = {s.id: s for s in Site.objects.all()}
        vm_count = seed_vms(sites)
        device_count = seed_devices(sites)
        domain_count = seed_domains()
        exporter_count = seed_exporters(sites)

        call_command("seed_itsm", stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {Site.objects.count()} sites, {Slo.objects.count()} SLOs, "
            f"{Monitor.objects.count()} monitors, {SyntheticCheck.objects.count()} synthetic checks, {vm_count} VMs, {device_count} devices, {domain_count} domains, {exporter_count} exporters."
        ))
