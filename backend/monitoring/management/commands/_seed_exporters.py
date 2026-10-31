import random
from datetime import timedelta

from django.utils import timezone

from monitoring.models import Exporter, LogEntry, LogVolume

# category -> list of (name, type, target, endpoint port, base logs/hour)
CATALOG = {
    "network": [("snmp-switch-01", "SNMP", "10.10.1.10", 9116, 520), ("snmp-switch-02", "SNMP", "10.10.1.11", 9116, 410),
                ("snmp-core-01", "SNMP", "10.10.0.2", 9116, 380), ("snmp-rtr-01", "SNMP", "10.10.1.1", 9116, 300),
                ("netflow-exporter", "NetFlow", "192.168.10.1", 9500, 470), ("snmp-bse-sw-01", "SNMP", "10.20.1.11", 9116, 260),
                ("snmp-mcx-sw-01", "SNMP", "10.50.1.2", 9116, 210), ("snmp-dr-sw-01", "SNMP", "10.60.1.2", 9116, 120),
                ("lldp-collector", "LLDP", "all-switches", 9200, 90), ("snmp-oob-sw-01", "SNMP", "10.99.0.2", 9116, 60)],
    "firewalls": [("fortinet-fw-01", "HTTP API", "192.168.1.1", 9710, 340), ("fortinet-fw-02", "HTTP API", "192.168.1.2", 9710, 280),
                  ("nse-fw-01-exporter", "HTTP API", "10.10.0.1", 9710, 250), ("paloalto-fw-01", "HTTP API", "10.30.0.1", 9711, 220),
                  ("fw-syslog-01", "Syslog", "10.10.0.1", 1514, 410), ("fw-syslog-02", "Syslog", "10.30.0.1", 1514, 330),
                  ("dr-fw-01", "HTTP API", "10.60.0.1", 9710, 90), ("waf-exporter", "HTTP API", "waf-01", 9712, 150),
                  ("vpn-gw-exporter", "HTTP API", "10.10.0.5", 9713, 70)],
    "servers": [("node-exporter-01", "Node Exporter", "srv-app-01", 9100, 1900), ("node-exporter-02", "Node Exporter", "srv-app-02", 9100, 1500),
                ("node-exporter-03", "Node Exporter", "nse-srv-01", 9100, 1300), ("node-exporter-04", "Node Exporter", "nse-srv-02", 9100, 1100),
                ("windows-exporter", "Windows", "win-srv-01", 9182, 960), ("windows-exporter-02", "Windows", "win-srv-02", 9182, 640),
                ("idrac-exporter", "Redfish", "10.10.1.22", 9348, 210), ("ilo-exporter", "Redfish", "10.10.1.24", 9348, 160),
                ("ipmi-exporter", "IPMI", "dc-rack-02", 9290, 80)],
    "virtualization": [("vmware-exporter", "vSphere", "vcenter01", 9272, 660), ("vmware-exporter-dr", "vSphere", "vcenter-dr", 9272, 240),
                       ("esxi-host-01-exp", "vSphere", "esxi-host-01", 9272, 180), ("esxi-host-02-exp", "vSphere", "esxi-host-02", 9272, 170),
                       ("hyperv-exporter", "Hyper-V", "hv-01", 9182, 120), ("proxmox-exporter", "Proxmox", "pve-01", 9221, 110),
                       ("vsan-exporter", "vSphere", "vsan-cluster", 9272, 90), ("nsx-exporter", "HTTP API", "nsx-mgr", 9273, 60)],
    "storage": [("netapp-exporter", "HTTP API", "netapp-01", 9108, 220), ("ceph-exporter", "Ceph", "ceph-mon-01", 9283, 190),
                ("nfs-exporter", "Node Exporter", "nfs-01", 9100, 140), ("minio-exporter", "HTTP API", "minio-01", 9000, 130),
                ("purestorage-exporter", "HTTP API", "pure-01", 9491, 110), ("backup-veeam-exp", "HTTP API", "veeam-01", 9445, 90),
                ("san-switch-exp", "SNMP", "san-sw-01", 9116, 40)],
    "databases": [("mysql-exporter", "MySQL", "db-prod-01", 9104, 1400), ("postgres-exporter", "PostgreSQL", "vm-db-01", 9187, 1250),
                  ("redis-exporter", "Redis", "vm-app-01", 9121, 700), ("mongodb-exporter", "MongoDB", "db-mongo-01", 9216, 520),
                  ("rabbitmq-exporter", "RabbitMQ", "vm-mq-01", 9419, 610), ("elasticsearch-exporter", "Elasticsearch", "es-01", 9114, 390),
                  ("oracle-exporter", "Oracle", "ora-01", 9161, 0), ("mssql-exporter", "MSSQL", "sql-01", 4000, 160)],
    "applications": [("blackbox-exporter", "HTTP/TCP", "https://finspot.in", 9115, 930), ("blackbox-exporter-api", "HTTP/TCP", "https://api.fyers.in", 9115, 820),
                     ("nginx-exporter", "Nginx", "vm-web-02", 9113, 640), ("jmx-exporter-oms", "JMX", "nse-srv-01", 9404, 560),
                     ("keycloak-exporter", "HTTP API", "keycloak-01", 9000, 300), ("jenkins-exporter", "HTTP API", "ci-01", 9118, 240),
                     ("argus-app-exporter", "HTTP API", "vm-app-01", 8001, 410), ("haproxy-exporter", "HAProxy", "lb-01", 8404, 380),
                     ("kafka-exporter", "Kafka", "kafka-01", 9308, 450), ("smtp-probe", "HTTP/TCP", "smtp.finspot.in", 9115, 50)],
    "kubernetes": [("kube-state-metrics", "Kubernetes", "k8s-cluster-01", 8080, 1200), ("kubelet-cadvisor", "Kubernetes", "k8s-cluster-01", 10250, 980),
                   ("kube-state-metrics-dr", "Kubernetes", "k8s-cluster-dr", 8080, 300), ("ingress-nginx-exp", "Nginx", "k8s-cluster-01", 10254, 540),
                   ("coredns-exporter", "Kubernetes", "k8s-cluster-01", 9153, 210), ("argocd-exporter", "HTTP API", "argocd", 8082, 120),
                   ("etcd-exporter", "Kubernetes", "k8s-cluster-01", 2381, 160), ("istio-exporter", "HTTP API", "k8s-cluster-01", 15020, 0)],
    "wireless": [("wlc-exporter-01", "SNMP", "wlc-01", 9116, 230), ("ap-snmp-01", "SNMP", "ap-01", 9116, 120), ("ap-snmp-02", "SNMP", "ap-02", 9116, 110),
                 ("ap-snmp-03", "SNMP", "ap-03", 9116, 100), ("aruba-central-exp", "HTTP API", "aruba-central", 9130, 90),
                 ("meraki-exporter", "HTTP API", "meraki-org", 9131, 70), ("radius-exporter", "HTTP API", "radius-01", 9812, 60)],
    "security": [("syslog-exporter", "Syslog", "syslog-server", 1514, 2800), ("auditd-exporter", "Syslog", "all-linux", 1515, 640),
                 ("vault-exporter", "HTTP API", "vault-01", 8200, 120), ("cert-exporter", "HTTP/TCP", "tls-endpoints", 9793, 60),
                 ("crowdstrike-exporter", "HTTP API", "falcon-api", 9824, 210), ("siem-forwarder", "Syslog", "siem-01", 1516, 900),
                 ("ldap-exporter", "LDAP", "ad-01", 9330, 90)],
    "custom": [("trading-latency-exp", "Custom", "nse-gateway", 9900, 760), ("ctcl-data-exp", "Custom", "ctcl-01", 9901, 330),
               ("bod-eod-exporter", "Custom", "bod-scheduler", 9902, 40), ("legacy-cron-exp", "Custom", "cron-01", 9903, 0)],
}
INACTIVE = {"oracle-exporter", "istio-exporter", "snmp-oob-sw-01", "lldp-collector", "radius-exporter", "nsx-exporter"}
ERRORS = {"mssql-exporter": "No response on 10.40.1.15:4000", "san-switch-exp": "SNMP timeout after 5s",
          "dr-fw-01": "HTTP 401 from FortiOS API", "ap-snmp-03": "No response on 10.10.2.13:9116"}
NOT_CONFIGURED = {"legacy-cron-exp", "meraki-exporter", "cert-exporter", "ipmi-exporter", "bod-eod-exporter"}

MESSAGES = {
    "SNMP": [("INFO", "Interface Gi1/0/1 status up"), ("INFO", "Polled 48 interfaces in 1.2s"), ("WARN", "High CRC errors on Gi1/0/3"), ("ERROR", "Interface Gi1/0/24 link down")],
    "HTTP API": [("WARN", "High session count: 9800"), ("INFO", "Policy sync completed"), ("INFO", "API poll OK (200)"), ("ERROR", "API returned HTTP 503")],
    "Node Exporter": [("INFO", "CPU usage: 45%"), ("INFO", "Memory usage: 62%"), ("WARN", "Filesystem /var 86% full"), ("INFO", "Scrape OK in 84ms")],
    "Windows": [("INFO", "Memory usage: 62%"), ("WARN", "Service W32Time stopped"), ("INFO", "Disk C: 54% used")],
    "vSphere": [("INFO", "Datastore usage: 78%"), ("WARN", "VM VM-MQ-01 CPU ready 9%"), ("INFO", "Collected 128 VM metrics")],
    "MySQL": [("ERROR", "Slow query detected (2.3s)"), ("INFO", "Replication lag 0.2s"), ("WARN", "Threads connected 410/500")],
    "PostgreSQL": [("INFO", "checkpoint complete"), ("WARN", "replication lag 4.2s"), ("INFO", "Connections 182/400")],
    "HTTP/TCP": [("INFO", "HTTPS check success (200)"), ("WARN", "TLS certificate expires in 7 days"), ("ERROR", "HTTPS check failed: timeout")],
    "Kubernetes": [("INFO", "Pod restart detected: api-7d9c8"), ("WARN", "Node k8s-worker-03 MemoryPressure"), ("INFO", "Scraped 412 pods")],
    "NetFlow": [("INFO", "High traffic from 192.168.20.10"), ("INFO", "Flow export 12k flows/s")],
    "Syslog": [("WARN", "Failed login attempt from 10.1.1.5"), ("INFO", "sshd: Accepted publickey for deploy"), ("ERROR", "sudo: authentication failure")],
}


def _msgs(t):
    return MESSAGES.get(t, [("INFO", "Scrape OK"), ("WARN", "Scrape slower than interval"), ("ERROR", "Scrape failed")])


def seed_exporters(sites):
    rnd = random.Random(42)
    now = timezone.now()
    LogEntry.objects.all().delete()
    LogVolume.objects.all().delete()
    Exporter.objects.all().delete()
    site_ids = list(sites)

    exporters = []
    for cat, items in CATALOG.items():
        for i, (name, typ, target, port, rate) in enumerate(items):
            status = ("inactive" if name in INACTIVE else "error" if name in ERRORS
                      else "not_configured" if name in NOT_CONFIGURED else "active")
            endpoint = "" if status == "not_configured" else f"10.10.{1 + list(CATALOG).index(cat)}.{200 + i}:{port}"
            last_seen = (now - timedelta(seconds=rnd.choice([30, 60, 60, 120, 180]))) if status == "active" else (
                now - timedelta(hours=rnd.randint(2, 30)) if status in ("inactive", "error") else None)
            exporters.append(Exporter(
                id=name, name=name, exporter_type=typ, category=cat, target=target, endpoint=endpoint,
                site=sites[site_ids[(i + len(cat)) % len(site_ids)]], status=status, interval_sec=rnd.choice([30, 60, 60, 300]),
                last_seen=last_seen, last_error=ERRORS.get(name, ""), created_at=now - timedelta(days=rnd.randint(3, 400)),
            ))
    Exporter.objects.bulk_create(exporters)

    # 48h of hourly counts; previous day ~8% quieter so the 24h trend is visible.
    start = (now - timedelta(hours=47)).replace(minute=0, second=0, microsecond=0)
    vols = []
    for e in exporters:
        rate = next(r for items in CATALOG.values() for (n, _, _, _, r) in items if n == e.name)
        if e.status in ("not_configured",) or rate == 0:
            continue
        for h in range(48):
            hour = start + timedelta(hours=h)
            if e.status in ("inactive", "error") and hour > (e.last_seen or now):
                continue
            day_factor = 0.92 if h < 24 else 1.0
            diurnal = 0.55 + 0.45 * (1 if 9 <= (hour.hour + 5) % 24 <= 16 else 0.4)  # busier in IST market hours
            total = int(rate * day_factor * diurnal * rnd.uniform(0.8, 1.2))
            err = int(total * rnd.uniform(0.01, 0.05))
            warn = int(total * rnd.uniform(0.04, 0.12))
            vols.append(LogVolume(exporter=e, hour=hour, info=total - err - warn, warn=warn, error=err))
    LogVolume.objects.bulk_create(vols)

    # recent tail, oldest first so ids increase with time
    active = [e for e in exporters if e.status == "active"]
    entries = []
    for k in range(240, 0, -1):
        e = rnd.choice(active)
        level, msg = rnd.choice(_msgs(e.exporter_type))
        entries.append(LogEntry(exporter=e, ts=now - timedelta(seconds=k * 15), level=level, message=msg))
    LogEntry.objects.bulk_create(entries)
    return len(exporters)
