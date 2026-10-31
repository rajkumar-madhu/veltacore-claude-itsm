from datetime import timedelta

from django.utils import timezone

from monitoring.models import BusinessDomain, DomainService, Incident

# name, host, availability, response_ms, error_rate, p95_ms, cpu, mem, disk, net
DOMAINS = [
    ("trading", "Trading", "Trading and order management systems", "fa-chart-line",
     ["Exchange", "Market Data", "OMS", "Risk Engine", "Database"], [
         ("OMS", "nse-srv-01", 99.02, 410, 3.1, 820, 74, 58, 79, 91),
         ("Trade Adapter", "nse-srv-02", 99.61, 190, 2.4, 420, 41, 52, 48, 46),
         ("Risk Engine", "nse-srv-01", 99.98, 85, 0.1, 110, 38, 61, 44, 40),
         ("Market Data", "vm-mq-01", 99.95, 340, 0.2, 95, 33, 47, 52, 58),
         ("Order Gateway", "nse-srv-02", 99.71, 120, 1.0, 310, 72, 55, 41, 49),
     ]),
    ("infrastructure", "Infrastructure", "Core infrastructure and platform", "fa-sitemap",
     ["Load Balancers", "Kubernetes", "Node Exporter", "SNMP Devices"], [
         ("Kubernetes", "k8s-cluster-01", 99.85, 140, 0.4, 180, 76, 64, 58, 52),
         ("Node Exporter", "all-hosts", 99.99, 12, 0.0, 30, 22, 31, 40, 77),
         ("SNMP Devices", "nce-sw-01", 99.93, 60, 1.6, 120, 35, 39, 44, 41),
         ("Blackbox Probes", "probe-01", 99.97, 380, 0.3, 150, 18, 27, 33, 30),
         ("Load Balancers", "lb-01", 99.96, 45, 0.2, 90, 44, 41, 37, 63),
     ]),
    ("applications", "Applications", "Business and internal applications", "fa-cubes",
     ["Keycloak", "Argus", "ITSM", "Jenkins"], [
         ("Argus", "vm-app-01", 99.97, 110, 0.2, 120, 46, 58, 64, 38),
         ("ITSM", "vm-web-02", 99.94, 240, 0.4, 210, 39, 52, 47, 35),
         ("Keycloak", "vm-app-01", 99.94, 95, 0.3, 270, 31, 44, 39, 29),
         ("Jenkins", "ci-01", 99.95, 150, 0.6, 160, 58, 63, 66, 34),
         ("Harbor", "ci-01", 99.98, 70, 0.1, 90, 21, 38, 62, 28),
         ("SonarQube", "ci-02", 99.96, 160, 0.2, 140, 27, 49, 54, 22),
     ]),
    ("databases", "Databases", "Database and cache services", "fa-database",
     ["PostgreSQL", "Redis", "RabbitMQ", "MongoDB"], [
         ("PostgreSQL", "vm-db-01", 99.97, 18, 0.1, 85, 41, 71, 68, 44),
         ("Redis", "vm-app-01", 99.99, 2, 0.0, 6, 12, 74, 21, 33),
         ("RabbitMQ", "vm-mq-01", 99.93, 40, 0.3, 75, 64, 77, 44, 88),
         ("MongoDB", "db-mongo-01", 99.98, 25, 0.1, 60, 29, 52, 47, 31),
     ]),
    ("external-services", "External Services", "Third party and exchange services", "fa-globe",
     ["Exchange APIs", "Broker API (MCX)"], [
         ("Exchange APIs", "external", 99.94, 140, 0.4, 410, None, None, None, 38),
         ("Broker API (MCX)", "external", 99.73, 480, 1.1, 340, None, None, None, 89),
     ]),
    ("security", "Security", "Identity and security services", "fa-shield-halved",
     ["WAF", "Keycloak SSO", "Vault"], [
         ("WAF", "waf-01", 99.99, 8, 0.1, 25, 33, 41, 30, 47),
         ("Keycloak SSO", "vm-app-01", 99.98, 60, 0.1, 45, 28, 46, 35, 25),
         ("Vault", "vault-01", 99.99, 12, 0.0, 30, 15, 33, 28, 18),
     ]),
]

INCIDENTS = [
    ("INC000123", "trading", "OMS", "P1", "OMS processing delay", timedelta(minutes=87)),
    ("INC000122", "trading", "Trade Adapter", "P2", "Adapter connection errors", timedelta(hours=2)),
    ("INC000121", "trading", "Order Gateway", "P2", "High order rejection rate", timedelta(hours=3)),
    ("INC000118", "trading", "Market Data", "P3", "Market data feed latency", timedelta(hours=5)),
    ("INC000117", "trading", "Risk Engine", "P3", "Risk engine timeout", timedelta(hours=8)),
    ("INC000115", "databases", "RabbitMQ", "P2", "nse.ticks queue depth above 700", timedelta(minutes=34)),
    ("INC000112", "external-services", "Broker API (MCX)", "P2", "MCX broker API p95 above 500 ms", timedelta(hours=1)),
    ("INC000109", "infrastructure", "Kubernetes", "P3", "Node pressure on k8s-worker-03", timedelta(hours=6)),
]

TRADING_LOGS = [
    {"ts": "14:32:18", "level": "ERROR", "source": "oms", "message": "Order queue backlog 1,842 > 1,000 threshold"},
    {"ts": "14:31:02", "level": "WARN", "source": "trade-adapter", "message": "NSE session reconnect (attempt 3)"},
    {"ts": "14:29:44", "level": "WARN", "source": "order-gateway", "message": "Rejection rate 1.0% (5m window)"},
    {"ts": "14:27:10", "level": "INFO", "source": "risk-engine", "message": "Margin recalculation completed in 82 ms"},
    {"ts": "14:25:31", "level": "INFO", "source": "market-data", "message": "Snapshot published (NSE, 2,140 symbols)"},
]

TRADING_TRACES = [
    {"traceId": "7f3c9a21e04b", "root": "POST /v2/orders", "service": "Order Gateway", "durationMs": 912, "spans": 14, "status": "error"},
    {"traceId": "a81d02ff7c19", "root": "POST /v2/orders", "service": "Order Gateway", "durationMs": 284, "spans": 12, "status": "ok"},
    {"traceId": "c4e7b6d0a311", "root": "GET /v2/positions", "service": "OMS", "durationMs": 133, "spans": 7, "status": "ok"},
    {"traceId": "19bb3e7d5a02", "root": "risk.check_margin", "service": "Risk Engine", "durationMs": 76, "spans": 5, "status": "ok"},
    {"traceId": "e0c512a9f8d6", "root": "feed.publish", "service": "Market Data", "durationMs": 41, "spans": 3, "status": "ok"},
]


def seed_domains():
    now = timezone.now()
    Incident.objects.all().delete()
    BusinessDomain.objects.all().delete()  # cascades services

    for order, (did, name, desc, icon, flow, services) in enumerate(DOMAINS):
        details = {"logs": TRADING_LOGS, "traces": TRADING_TRACES} if did == "trading" else {"logs": [], "traces": []}
        domain = BusinessDomain.objects.create(id=did, name=name, description=desc, icon=icon, sort_order=order, flow=flow, details=details)
        DomainService.objects.bulk_create([
            DomainService(domain=domain, name=n, host=h, availability=a, response_ms=r, error_rate=e, latency_p95_ms=p,
                          cpu_pct=c, mem_pct=m, disk_pct=dk, net_pct=nt)
            for n, h, a, r, e, p, c, m, dk, nt in services
        ])

    services = {(s.domain_id, s.name): s for s in DomainService.objects.all()}
    Incident.objects.bulk_create([
        Incident(id=i, domain_id=d, service=services.get((d, svc)), priority=p, title=t, opened_at=now - ago)
        for i, d, svc, p, t, ago in INCIDENTS
    ])
    return BusinessDomain.objects.count()
