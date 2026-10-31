from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from itsm import bod, cmdb_sync, workflow
from itsm.models import (
    Alert, Asset, AuditLog, AutomationRule, BodEodCheck, BodEodRun, CatalogItem, CiRelationship, ConfigurationItem, Integration,
    KubeCluster, License, MonitoringTemplate, NotificationChannel, NotificationRule, RcaReport, Runbook, RunbookExecution,
    SoftwareProduct, SystemSetting, Ticket, TicketActivity, UptimeCheck, UserProfile, VmTemplate,
)
from monitoring.models import BusinessDomain, Site

PEOPLE = ["Priya Nair", "Arjun Mehta", "Sneha Rao", "Vikram Iyer", "Kavya Shah", "Rohit Verma", "Ananya Das", "Imran Khan"]


def ago(**kw):
    return timezone.now() - timedelta(**kw)


class Command(BaseCommand):
    help = "Seed demo ITSM data (service desk, CMDB, assets, alerts, automation, admin)."

    @transaction.atomic
    def handle(self, *args, **opts):
        for m in (AuditLog, RunbookExecution, AutomationRule, Runbook, BodEodRun, BodEodCheck, RcaReport, Alert, TicketActivity, Ticket,
                  CatalogItem, Asset, License, SoftwareProduct, CiRelationship, ConfigurationItem, UptimeCheck, MonitoringTemplate,
                  NotificationRule, NotificationChannel, Integration, SystemSetting, VmTemplate, KubeCluster, UserProfile):
            m.objects.all().delete()
        get_user_model().objects.filter(is_superuser=False).delete()
        sites = {s.id: s for s in Site.objects.all()}
        mum = sites.get("br-mum")

        self.users(sites)
        cmdb_sync.sync()
        cis = {c.name: c for c in ConfigurationItem.objects.all()}
        self.business_services(cis)
        cis = {c.name: c for c in ConfigurationItem.objects.all()}
        self.catalog()
        self.tickets(cis)
        self.assets(cis, mum)
        self.software()
        self.alerts()
        self.uptime()
        self.templates()
        self.bod_checks()
        self.automation()
        self.rca()
        self.admin()
        self.vm_templates()
        self.kubernetes(sites)
        for phase in ("BOD", "EOD"):
            bod.run(phase, "scheduler")
        AuditLog.objects.create(ts=timezone.now(), actor="system", action="seed", object_type="system", object_id="-",
                                summary="Demo data loaded")
        self.stdout.write(f"  ITSM: {Ticket.objects.count()} tickets, {ConfigurationItem.objects.count()} CIs, "
                          f"{Asset.objects.count()} assets, {Alert.objects.count()} alerts, {Runbook.objects.count()} runbooks")

    def users(self, sites):
        User = get_user_model()
        rows = [("priya.nair", "Priya", "Nair", "super_admin", "Platform"), ("arjun.mehta", "Arjun", "Mehta", "admin", "Network"),
                ("sneha.rao", "Sneha", "Rao", "operator", "NOC"), ("vikram.iyer", "Vikram", "Iyer", "operator", "NOC"),
                ("kavya.shah", "Kavya", "Shah", "operator", "Service Desk"), ("rohit.verma", "Rohit", "Verma", "admin", "Infra"),
                ("ananya.das", "Ananya", "Das", "viewer", "Trading Ops"), ("imran.khan", "Imran", "Khan", "operator", "DBA")]
        for i, (u, f, l, role, team) in enumerate(rows):
            user = User(username=u, first_name=f, last_name=l, email=f"{u}@finspot.in")
            user.set_unusable_password()
            user.save()
            UserProfile.objects.create(user=user, role=role, team=team, phone=f"+91 98200 0{1000 + i * 37}", site=sites.get("br-mum"))

    def business_services(self, cis):
        now = timezone.now()
        seq = int(ConfigurationItem.objects.order_by("-ci_id").values_list("ci_id", flat=True).first()[2:]) + 1
        bs = {}
        for name, crit, deps in [("NSE Trading Platform", "P1", ["OMS", "Order Gateway", "Risk Engine", "Market Data", "Trade Adapter"]),
                                 ("Client Login & Identity", "P1", ["Keycloak", "Keycloak SSO"]),
                                 ("Back-office Reporting", "P3", ["PostgreSQL", "Argus"])]:
            ci = ConfigurationItem.objects.create(ci_id=f"CI{seq}", name=name, ci_class="Business Service", criticality=crit, owner="Trading Ops",
                                                  source="manual", updated_at=now, attributes={"tier": "Gold" if crit == "P1" else "Silver"})
            seq += 1
            bs[name] = ci
            for d in deps:
                if d in cis:
                    CiRelationship.objects.get_or_create(source=ci, target=cis[d], rel_type="depends_on")

    def catalog(self):
        items = [
            ("New Virtual Machine", "Infrastructure", "fa-cube", 3, True, [{"key": "os", "label": "Operating system", "type": "select", "options": ["Ubuntu 22.04", "RHEL 9", "Windows Server 2022"], "required": True},
                {"key": "vcpu", "label": "vCPU", "type": "number", "required": True}, {"key": "memory", "label": "Memory (GB)", "type": "number", "required": True},
                {"key": "purpose", "label": "Purpose", "type": "text", "required": True}]),
            ("Firewall Rule Change", "Network", "fa-shield-halved", 2, True, [{"key": "source", "label": "Source", "type": "text", "required": True},
                {"key": "destination", "label": "Destination", "type": "text", "required": True}, {"key": "port", "label": "Port / protocol", "type": "text", "required": True}]),
            ("VPN Access", "Access", "fa-key", 1, True, [{"key": "justification", "label": "Justification", "type": "text", "required": True}]),
            ("Database Access", "Access", "fa-database", 1, True, [{"key": "database", "label": "Database", "type": "select", "options": ["PostgreSQL (OMS)", "MySQL (reporting)", "MongoDB"], "required": True},
                {"key": "level", "label": "Access level", "type": "select", "options": ["Read-only", "Read-write"], "required": True}]),
            ("New Monitoring Check", "Monitoring", "fa-heart-pulse", 1, False, [{"key": "target", "label": "URL or host:port", "type": "text", "required": True}]),
            ("Software Installation", "Workplace", "fa-download", 2, True, [{"key": "software", "label": "Software", "type": "text", "required": True}]),
            ("New Laptop", "Workplace", "fa-laptop", 5, True, [{"key": "model", "label": "Model", "type": "select", "options": ["Dell Latitude 7440", "MacBook Pro 14"], "required": True}]),
            ("Password Reset", "Access", "fa-unlock", 1, False, []),
            ("Server Decommission", "Infrastructure", "fa-trash-can", 5, True, [{"key": "hostname", "label": "Hostname", "type": "text", "required": True}]),
            ("Exchange Connectivity Test", "Trading", "fa-plug", 1, False, [{"key": "exchange", "label": "Exchange", "type": "select", "options": ["NSE", "BSE", "MCX"], "required": True}]),
        ]
        for name, cat, icon, days, approval, fields in items:
            CatalogItem.objects.create(name=name, category=cat, icon=icon, fulfillment_days=days, approval_required=approval, form_fields=fields,
                                       description={"New Virtual Machine": "Provision a VM from a standard template on vCenter."}.get(name, f"Request: {name.lower()}."))

    def _ticket(self, ttype, created, path, note_by=PEOPLE, **fields):
        t = workflow.create(ticket_type=ttype, actor=fields.get("requester") or "Argus", **fields)
        Ticket.objects.filter(pk=t.pk).update(created_at=created, updated_at=created,
                                              sla_due=workflow.sla_due(ttype, t.priority, created, t.catalog_item))
        t.refresh_from_db()
        TicketActivity.objects.filter(ticket=t).update(ts=created)
        step = created
        for i, to in enumerate(path):
            step = step + timedelta(minutes=35 + i * 40)
            note = {"resolved": "Root cause fixed and service verified.", "fulfilled": "Done."}.get(to, "")
            workflow.transition(t, to, t.assignee or note_by[i % len(note_by)], note)
            Ticket.objects.filter(pk=t.pk).update(updated_at=step, **({"resolved_at": step} if to in workflow.DONE_STATES else {}))
            last = TicketActivity.objects.filter(ticket=t).order_by("-id").first()
            TicketActivity.objects.filter(pk=last.pk).update(ts=step)
        t.refresh_from_db()
        return t

    def tickets(self, cis):
        dom = {d.id: d for d in BusinessDomain.objects.all()}
        g = lambda n: cis.get(n)
        I = [
            ("OMS processing delay", "P1", ["in_progress"], "OMS", "trading", "Priya Nair", "Trading Apps", 87),
            ("Trade adapter connection errors to NSE", "P2", ["in_progress"], "Trade Adapter", "trading", "Arjun Mehta", "Trading Apps", 120),
            ("High order rejection rate on Order Gateway", "P2", [], "Order Gateway", "trading", "", "Trading Apps", 180),
            ("Market data feed latency above 50 ms", "P3", ["in_progress", "on_hold"], "Market Data", "trading", "Sneha Rao", "Market Data", 300),
            ("Risk engine timeout during margin calc", "P3", ["in_progress", "resolved"], "Risk Engine", "trading", "Vikram Iyer", "Trading Apps", 480),
            ("NCE-SW-01 Gi1/0/24 link down", "P2", ["in_progress"], "NCE-SW-01", None, "Arjun Mehta", "Network", 60),
            ("VM-MQ-01 queue nse.ticks depth > 700", "P2", ["in_progress"], "VM-MQ-01", "databases", "Imran Khan", "Middleware", 34),
            ("DR-DB-01 unreachable", "P2", [], "DR-DB-01", "databases", "", "DBA", 420),
            ("VM-APP-01 memory usage 82%", "P3", ["in_progress", "resolved", "closed"], "VM-APP-01", "applications", "Rohit Verma", "Infra", 1500),
            ("Jenkins builds slow", "P4", ["in_progress", "resolved"], "Jenkins", "applications", "Rohit Verma", "DevOps", 2900),
            ("NSE-SRV-02 corrected memory errors on DIMM B2", "P3", ["in_progress"], "NSE-SRV-02", None, "Rohit Verma", "Infra", 1440),
            ("Broker API (MCX) p95 above 500 ms", "P3", [], "Broker API (MCX)", "external-services", "", "Trading Apps", 65),
            ("SSL certificate expiring on status page", "P4", ["in_progress", "resolved", "closed"], None, None, "Kavya Shah", "Service Desk", 4300),
            ("Login page slow for retail clients", "P2", ["in_progress", "resolved", "closed"], "Keycloak", "security", "Priya Nair", "Identity", 7000),
        ]
        incidents = {}
        for title, prio, path, ci, d, assignee, group, mins in I:
            incidents[title] = self._ticket("incident", ago(minutes=mins), path, title=title, priority=prio, ci=g(ci) if ci else None,
                                            domain=dom.get(d) if d else None, assignee=assignee, assignment_group=group, category="Application" if group.startswith("Trading") else "Infrastructure",
                                            requester="Argus Alerting", description=f"{title}. Raised from monitoring; see linked alerts and CI.")
        P = [
            ("Recurring OMS backlog during market open", "P1", ["investigating"], "OMS", {"rootCause": "", "workaround": ""}, 2),
            ("Intermittent NSE session drops on trade adapter", "P2", ["investigating", "known_error"], "Trade Adapter",
             {"rootCause": "Keepalive interval longer than exchange idle timeout", "workaround": "Force reconnect every 10 min via cron"}, 9),
            ("RabbitMQ memory alarms under peak load", "P2", ["investigating"], "RabbitMQ", {"rootCause": "", "workaround": ""}, 5),
            ("Switch port CRC errors on access layer", "P3", ["investigating", "resolved"], "NCE-SW-01",
             {"rootCause": "Damaged patch cable on Gi1/0/3", "workaround": "Moved host to Gi1/0/9"}, 20),
            ("Memory pressure on app VMs", "P3", [], "VM-APP-01", {}, 1),
        ]
        problems = {}
        for title, prio, path, ci, extra, days in P:
            problems[title] = self._ticket("problem", ago(days=days), path, title=title, priority=prio, ci=g(ci), assignee=PEOPLE[days % 8],
                                           assignment_group="Problem Mgmt", category="Problem", requester="Problem Mgmt", extra=extra,
                                           description=f"{title}. Linked incidents tracked in activity.")
        C = [
            ("Upgrade OMS to 4.2.1 (fixes queue backlog)", "P2", ["assess", "approved", "scheduled"], "OMS", "High", 1),
            ("Increase RabbitMQ memory high-watermark to 0.6", "P3", ["assess", "approved"], "RabbitMQ", "Medium", 2),
            ("Replace patch cable NCE-SW-01 Gi1/0/3", "P4", ["assess", "approved", "scheduled", "implemented", "closed"], "NCE-SW-01", "Low", 12),
            ("Firmware update iDRAC 6.10.80 on NSE-SRV-01", "P3", ["assess"], "NSE-SRV-01", "Medium", 0),
            ("Add 16 GB memory to VM-APP-01", "P3", ["assess", "approved", "scheduled", "implemented"], "VM-APP-01", "Low", 4),
            ("Migrate DR-DB-01 to new storage array", "P2", [], "DR-DB-01", "High", 0),
        ]
        for title, prio, path, ci, risk, days in C:
            start = (timezone.now() + timedelta(days=2 - days)).replace(hour=22, minute=0, second=0, microsecond=0)
            self._ticket("change", ago(days=days, hours=3), path, title=title, priority=prio, ci=g(ci), assignee=PEOPLE[(days + 3) % 8],
                         assignment_group="Change Advisory Board", category="Change", requester=PEOPLE[days % 8],
                         extra={"risk": risk, "impact": "Medium" if risk != "Low" else "Low", "plannedStart": start.isoformat(),
                                "plannedEnd": (start + timedelta(hours=2)).isoformat(),
                                "backoutPlan": "Roll back to previous version/config snapshot taken before the window."},
                         description=f"{title}. Implementation, test and backout plans attached.")
        items = {c.name: c for c in CatalogItem.objects.all()}
        R = [("New Virtual Machine", ["approved", "fulfilling"], "Ananya Das", {"os": "Ubuntu 22.04", "vcpu": "4", "memory": "16", "purpose": "Risk analytics batch"}, 1),
             ("VPN Access", ["approved", "fulfilling", "fulfilled", "closed"], "Rohit Verma", {"justification": "On-call"}, 6),
             ("Database Access", ["approved"], "Imran Khan", {"database": "PostgreSQL (OMS)", "level": "Read-only"}, 0),
             ("Firewall Rule Change", [], "Arjun Mehta", {"source": "10.50.1.0/24", "destination": "10.10.1.30", "port": "5432/tcp"}, 0),
             ("New Laptop", ["approved", "fulfilling"], "Kavya Shah", {"model": "Dell Latitude 7440"}, 3),
             ("Password Reset", ["approved", "fulfilling", "fulfilled"], "Sneha Rao", {}, 2),
             ("Exchange Connectivity Test", ["approved", "fulfilling", "fulfilled", "closed"], "Priya Nair", {"exchange": "NSE"}, 8)]
        for name, path, who, answers, days in R:
            it = items[name]
            self._ticket("request", ago(days=days, hours=5), path, title=name, priority="P3", catalog_item=it, category=it.category,
                         requester=who, assignee="Kavya Shah" if path else "", assignment_group="Service Desk", extra={"answers": answers})
        oms = incidents["OMS processing delay"]
        for i, (k, body) in enumerate([("work_note", "Queue depth on oms-core at 1,842; scaling consumers from 6 to 10."),
                                       ("comment", "Trading desk informed: orders delayed ~2s during spike."),
                                       ("work_note", "Linked to PRB 'Recurring OMS backlog during market open'.")]):
            TicketActivity.objects.create(ticket=oms, ts=ago(minutes=80 - i * 20), author="Priya Nair", kind=k, body=body)

    def assets(self, cis, site):
        today = date.today()
        rows = [
            ("AST-10021", "NSE-SRV-01", "Server", "Dell", "PowerEdge R740", "7F3K9H2", "in_use", "Infra", "DC-Rack-02", -420, 310, 900, "NSE-SRV-01", 1240000),
            ("AST-10022", "NSE-SRV-02", "Server", "HPE", "ProLiant DL380 Gen10", "CZJ1230ABX", "in_use", "Infra", "DC-Rack-02", -300, 60, 700, "NSE-SRV-02", 1180000),
            ("AST-10023", "MCX-APP-01", "Server", "Dell", "PowerEdge R640", "4HJ8QK2", "in_use", "Infra", "DC-Rack-05", -1100, -20, 160, "MCX-APP-01", 860000),
            ("AST-10024", "NSE-DB-01", "Server", "Dell", "PowerEdge R650", "9GK2LM1", "in_use", "DBA", "DC-Rack-03", -127, 960, 1600, "NSE-DB-01", 1450000),
            ("AST-10025", "DR-DB-01", "Server", "Dell", "PowerEdge R650", "2PL0ZX9", "repair", "DBA", "DR Site", -131, 950, 1600, "DR-DB-01", 1450000),
            ("AST-10031", "NCE-SW-01", "Switch", "Cisco", "Catalyst 2960-X", "FOC1234A0BC", "in_use", "Network", "DC-Rack-01", -1460, -95, 45, "NCE-SW-01", 310000),
            ("AST-10032", "BSE-SW-01", "Switch", "Cisco", "Catalyst 2960-X", "FOC2219X0QA", "in_use", "Network", "DC-Rack-04", -128, 600, 45, "BSE-SW-01", 310000),
            ("AST-10033", "NSE-FW-01", "Firewall", "Fortinet", "FortiGate 200F", "FG200FTK21900123", "in_use", "Security", "DC-Rack-01", -129, 236, 1400, "NSE-FW-01", 980000),
            ("AST-10034", "NSE-RTR-01", "Router", "Cisco", "ISR 4451", "FDO2231A1BC", "in_use", "Network", "DC-Rack-01", -900, 120, 400, "NSE-RTR-01", 720000),
            ("AST-10035", "LB-01", "Load Balancer", "F5", "BIG-IP i5800", "f5-xqtz-1122", "in_use", "Network", "DC-Rack-01", -480, 250, 1300, "LB-01", 2100000),
            ("AST-10036", "WLC-01", "Wireless Controller", "Cisco", "Catalyst 9800-40", "TTM2405Q0RS", "in_use", "Network", "DC-Rack-03", -300, 430, 1800, "WLC-01", 650000),
            ("AST-10040", "ESXi host 01", "Server", "Dell", "PowerEdge R750", "HX0001", "in_use", "Infra", "DC-Rack-06", -600, 495, 1200, "esxi-host-01", 1500000),
            ("AST-10041", "ESXi host 02", "Server", "Dell", "PowerEdge R750", "HX0002", "in_use", "Infra", "DC-Rack-06", -600, 495, 1200, "esxi-host-02", 1500000),
            ("AST-10050", "Spare 2960-X", "Switch", "Cisco", "Catalyst 2960-X", "FOC9981S0AA", "in_stock", "", "Store room", -200, 900, 45, None, 310000),
            ("AST-10051", "Old Catalyst 3750", "Switch", "Cisco", "Catalyst 3750-X", "FDO1514R0ZZ", "retired", "", "Scrap", -3200, -1500, -800, None, 0),
            ("AST-20001", "Laptop — Priya Nair", "Laptop", "Dell", "Latitude 7440", "DL7440-01", "in_use", "Priya Nair", "Mumbai office", -200, 900, 1300, None, 145000),
            ("AST-20002", "Laptop — Arjun Mehta", "Laptop", "Apple", "MacBook Pro 14", "C02XK1", "in_use", "Arjun Mehta", "Mumbai office", -700, 30, 900, None, 210000),
            ("AST-20003", "Laptop — Sneha Rao", "Laptop", "Dell", "Latitude 7440", "DL7440-02", "repair", "Sneha Rao", "Service desk", -150, 950, 1300, None, 145000),
        ]
        for tag, name, typ, vendor, model, serial, st, who, loc, bought, warranty, eol, ci, cost in rows:
            Asset.objects.create(asset_tag=tag, name=name, asset_type=typ, vendor=vendor, model=model, serial=serial, status=st, assigned_to=who,
                                 location=loc, purchase_date=today + timedelta(days=bought), warranty_end=today + timedelta(days=warranty),
                                 eol_date=today + timedelta(days=eol), ci=cis.get(ci) if ci else None, cost=cost)

    def software(self):
        today = date.today()
        sw = [("Red Hat Enterprise Linux", "Red Hat", "8.8", "Operating System", 14, 900), ("Ubuntu Server", "Canonical", "22.04 LTS", "Operating System", 9, 1700),
              ("Windows Server", "Microsoft", "2022", "Operating System", 4, 2500), ("VMware vSphere", "Broadcom", "7.0 U3", "Virtualization", 5, 140),
              ("PostgreSQL", "PGDG", "15", "Database", 3, 1100), ("MySQL", "Oracle", "8.0", "Database", 2, 60), ("Redis", "Redis Ltd", "7.2", "Database", 3, 600),
              ("RabbitMQ", "Broadcom", "3.12", "Middleware", 2, 200), ("nginx", "F5", "1.20.1", "Web Server", 6, -30), ("Keycloak", "Red Hat", "24.0", "Identity", 2, 400),
              ("Jenkins", "CDF", "2.440", "DevOps", 1, 300), ("Veeam Backup & Replication", "Veeam", "12.1", "Backup", 1, 800),
              ("FortiOS", "Fortinet", "7.2.8", "Network OS", 2, 500), ("Cisco IOS", "Cisco", "15.2(4)E", "Network OS", 3, 75),
              ("Microsoft 365 E3", "Microsoft", "2024", "Productivity", 140, None)]
        prods = {}
        for name, vendor, ver, cat, installs, eol in sw:
            prods[name] = SoftwareProduct.objects.create(name=name, vendor=vendor, version=ver, category=cat, installs=installs,
                                                         eol_date=today + timedelta(days=eol) if eol is not None else None)
        lic = [("Red Hat Enterprise Linux", "Subscription", 20, 14, 210, 640000, "RH-CTR-2291"), ("VMware vSphere", "Per-core", 128, 112, 75, 2400000, "BC-VS-7731"),
               ("Windows Server", "Per-core", 32, 24, 400, 380000, "MS-EA-1182"), ("Microsoft 365 E3", "Subscription", 150, 140, 120, 2100000, "MS-EA-1182"),
               ("Veeam Backup & Replication", "Per-VM", 50, 47, 18, 420000, "VEE-8812"), ("FortiOS", "Subscription", 2, 2, -5, 360000, "FTN-55210"),
               ("Keycloak", "Subscription", 4, 2, 300, 150000, "RH-CTR-2291"), ("Jenkins", "Open source", 999, 1, None, 0, "")]
        for name, typ, total, used, exp, cost, ref in lic:
            License.objects.create(product=prods[name], license_type=typ, seats_total=total, seats_used=used,
                                   expiry=today + timedelta(days=exp) if exp is not None else None, annual_cost=cost, contract_ref=ref)

    def alerts(self):
        rows = [
            ("oms-latency-p99", "OMS order latency p99 > 800 ms", "critical", "firing", "prometheus", "OMS", "OmsLatencyHigh", 87),
            ("nse-sw-01-gi24", "Interface Gi1/0/24 link down", "critical", "acknowledged", "snmp", "NCE-SW-01", "IfOperDown", 62),
            ("mq-depth-nse-ticks", "Queue nse.ticks depth > 700", "critical", "firing", "prometheus", "VM-MQ-01", "RabbitQueueDepth", 34),
            ("dr-db-01-down", "DR-DB-01 unreachable (ICMP + SNMP)", "critical", "firing", "blackbox", "DR-DB-01", "HostDown", 420),
            ("trade-adapter-errors", "Trade adapter error rate 2.4%", "warning", "firing", "prometheus", "Trade Adapter", "ErrorRateHigh", 118),
            ("order-gw-reject", "Order rejection rate 1.0% (5m)", "warning", "firing", "prometheus", "Order Gateway", "RejectRate", 175),
            ("nce-sw-01-crc", "High CRC errors on Gi1/0/3", "warning", "silenced", "snmp", "NCE-SW-01", "IfErrors", 300),
            ("vm-app-01-mem", "VM-APP-01 memory 82%", "warning", "firing", "vsphere", "VM-APP-01", "VmMemoryHigh", 120),
            ("srv-01-inlet", "NSE-SRV-01 inlet temperature 42 °C", "warning", "resolved", "idrac", "NSE-SRV-01", "InletTempHigh", 200),
            ("srv-02-dimm", "Corrected memory errors on DIMM B2", "warning", "firing", "ilo", "NSE-SRV-02", "MemoryCE", 1440),
            ("k8s-worker-03-mem", "Node k8s-worker-03 MemoryPressure", "warning", "firing", "kubernetes", "k8s-worker-03", "NodeMemoryPressure", 360),
            ("mcx-api-p95", "Broker API (MCX) p95 above 500 ms", "warning", "firing", "blackbox", "Broker API (MCX)", "ProbeSlow", 65),
            ("cert-status", "TLS certificate expires in 7 days (status.finspot.in)", "info", "firing", "blackbox", "status.finspot.in", "CertExpiry", 2000),
            ("fw-sessions", "NSE-FW-01 session count 9,800", "info", "acknowledged", "fortigate", "NSE-FW-01", "SessionsHigh", 300),
            ("rtr-bgp-flap", "BGP flap with ISP-2 (3 in 1h)", "warning", "resolved", "snmp", "NSE-RTR-01", "BgpFlap", 130),
            ("jenkins-slow", "Jenkins queue wait > 10 min", "info", "resolved", "prometheus", "Jenkins", "CiQueueSlow", 3000),
        ]
        for fp, title, sev, st, src, target, rule, mins in rows:
            started = ago(minutes=mins)
            Alert.objects.create(fingerprint=fp, title=title, severity=sev, status=st, source=src, target=target, rule=rule, started_at=started,
                                 labels={"env": "production", "team": "noc"},
                                 acknowledged_by="Arjun Mehta" if st == "acknowledged" else "", acknowledged_at=started + timedelta(minutes=4) if st == "acknowledged" else None,
                                 resolved_at=started + timedelta(minutes=40) if st == "resolved" else None,
                                 silenced_until=timezone.now() + timedelta(hours=3) if st == "silenced" else None)
        for fp, num_title in [("oms-latency-p99", "OMS processing delay"), ("nse-sw-01-gi24", "NCE-SW-01 Gi1/0/24 link down"),
                              ("mq-depth-nse-ticks", "VM-MQ-01 queue nse.ticks depth > 700"), ("dr-db-01-down", "DR-DB-01 unreachable")]:
            Alert.objects.filter(fingerprint=fp).update(ticket=Ticket.objects.filter(title=num_title).first())

    def uptime(self):
        rows = [("Argus API", "http", "http://127.0.0.1:8000/api/sites/", 200, "internal,argus"), ("Argus UI", "http", "http://127.0.0.1:5173/", 200, "internal,argus"),
                ("Finspot website", "http", "https://finspot.in", 200, "public"), ("Fyers API", "http", "https://api.fyers.in", 200, "public,trading"),
                ("Status page", "http", "https://status.finspot.in", 200, "public"), ("OMS health", "http", "http://10.10.1.21:8080/health", 200, "internal,trading"),
                ("NSE gateway TCP", "tcp", "10.20.4.11:443", 200, "trading,exchange"), ("BSE gateway TCP", "tcp", "10.20.4.12:443", 200, "trading,exchange"),
                ("NCE-SW-01 SSH", "tcp", "10.10.1.50:22", 200, "network"), ("NSE-DB-01 PostgreSQL", "tcp", "10.10.1.30:5432", 200, "database"),
                ("RabbitMQ AMQP", "tcp", "10.30.1.40:5672", 200, "middleware"), ("vCenter HTTPS", "tcp", "10.20.1.5:443", 200, "virtualization")]
        for name, kind, target, code, tags in rows:
            UptimeCheck.objects.create(name=name, kind=kind, target=target, expected_status=code, tags=tags, interval_sec=60)

    def templates(self):
        T = [("Linux server — standard", "server", "CPU, memory, disk, load and service checks for Linux hosts",
              [("CPU usage", "node_cpu_utilisation", 75, 90, "%"), ("Memory usage", "node_memory_utilisation", 80, 92, "%"), ("Disk usage /", "node_filesystem_used_pct", 80, 90, "%"), ("Load (15m)", "node_load15", 8, 16, "")]),
             ("Windows server — standard", "server", "Windows exporter CPU/memory/disk/service checks", [("CPU usage", "windows_cpu_time", 75, 90, "%"), ("Free disk C:", "windows_logical_disk_free", 20, 10, "%")]),
             ("Cisco access switch", "switch", "SNMP interface status, errors, CPU, temperature", [("Port down (uplink)", "ifOperStatus", 1, 1, ""), ("CRC errors / min", "ifInErrors_rate", 5, 20, ""), ("CPU", "cpmCPUTotal5min", 60, 80, "%"), ("Temperature", "ciscoEnvMonTemperature", 50, 60, "°C")]),
             ("FortiGate firewall", "firewall", "Sessions, CPU, HA state", [("Sessions", "fgSysSesCount", 8000, 12000, ""), ("CPU", "fgSysCpuUsage", 70, 90, "%")]),
             ("Dell iDRAC hardware", "server", "Redfish health, PSU, fans, temperature", [("Inlet temp", "idrac_inlet_temp", 38, 42, "°C"), ("PSU redundancy", "idrac_psu_redundant", 1, 1, "")]),
             ("PostgreSQL", "database", "Connections, replication lag, cache hit", [("Connections used", "pg_connections_pct", 75, 90, "%"), ("Replication lag", "pg_replication_lag_s", 2, 5, "s")]),
             ("VMware VM", "vm", "vSphere CPU ready, memory, datastore", [("CPU ready", "vm_cpu_ready_pct", 5, 10, "%"), ("Memory", "vm_mem_usage_pct", 80, 92, "%")]),
             ("HTTP endpoint", "url", "Status code, latency, TLS expiry", [("Latency", "probe_duration_ms", 500, 1000, "ms"), ("TLS days left", "probe_ssl_days", 14, 7, "d")])]
        for name, applies, desc, checks in T:
            MonitoringTemplate.objects.create(name=name, applies_to=applies, description=desc, interval_sec=60,
                                              checks=[{"name": n, "metric": m, "warn": w, "crit": c, "unit": u} for n, m, w, c, u in checks])

    def bod_checks(self):
        C = [("Trading domain healthy", "BOTH", "Trading", "domain_health", {"domains": ["trading"], "accept": ["ok", "warn"]}, True),
             ("Exchange gateways reachable", "BOD", "Trading", "uptime", {"tag": "exchange"}, True),
             ("Core switches online", "BOD", "Network", "device_online", {"types": ["switch", "router", "firewall"]}, True),
             ("Trading servers online", "BOD", "Infrastructure", "device_online", {"devices": ["nse-srv-01", "nse-srv-02", "nse-db-01"]}, True),
             ("Application VMs running", "BOD", "Infrastructure", "vm_running", {"vms": ["vm-app-01", "vm-db-01", "vm-mq-01"]}, True),
             ("Market data SLOs within target", "BOTH", "Trading", "slo", {"slos": ["SLO-02", "SLO-03"]}, True),
             ("No critical alerts firing", "BOD", "Monitoring", "no_critical_alerts", {}, True),
             ("No open P1 incidents", "BOTH", "Service Desk", "open_p1", {}, False),
             ("Exporters reporting (≥ 80%)", "BOTH", "Monitoring", "exporters", {"minPct": 80}, False),
             ("Databases domain healthy", "EOD", "Data", "domain_health", {"domains": ["databases"], "accept": ["ok", "warn"]}, True),
             ("DR database online", "EOD", "Data", "device_online", {"devices": ["dr-db-01"]}, False),
             ("Backup proxy powered on for nightly window", "EOD", "Backup", "vm_running", {"vms": ["vm-bkp-01"]}, False),
             ("Public endpoints up", "EOD", "Monitoring", "uptime", {"tag": "public"}, False)]
        for i, (name, phase, cat, kind, params, crit) in enumerate(C):
            BodEodCheck.objects.create(name=name, phase=phase, category=cat, kind=kind, params=params, critical=crit, sort_order=i)

    def automation(self):
        now = timezone.now()
        R = [("Restart OMS consumers", "Trading", "Scale/restart OMS queue consumers when backlog builds",
              [{"name": "Check OMS health endpoint", "type": "http_check", "target": "http://10.10.1.21:8080/health"},
               {"name": "Restart oms-consumer service", "type": "restart_service", "target": "nse-srv-01:oms-consumer"},
               {"name": "Wait for consumers", "type": "wait", "params": {"seconds": 2}},
               {"name": "Verify Trading domain", "type": "verify_health", "target": "domain:trading"}]),
             ("Clear RabbitMQ backlog", "Middleware", "Purge stale messages and restart slow consumers",
              [{"name": "AMQP port reachable", "type": "tcp_check", "target": "10.30.1.40:5672"},
               {"name": "Purge nse.ticks.dlq", "type": "script", "target": "vm-mq-01", "params": {"cmd": "rabbitmqctl purge_queue nse.ticks.dlq"}},
               {"name": "Verify VM-MQ-01", "type": "verify_health", "target": "vm:vm-mq-01"}]),
             ("Bounce switch port", "Network", "Shut / no shut an access port after link flap",
              [{"name": "Switch SSH reachable", "type": "tcp_check", "target": "10.10.1.50:22"},
               {"name": "shutdown / no shutdown", "type": "script", "target": "nce-sw-01", "params": {"cmd": "interface Gi1/0/24; shutdown; no shutdown"}},
               {"name": "Verify switch online", "type": "verify_health", "target": "device:nce-sw-01"}]),
             ("Argus self-check", "Platform", "Confirms the Argus API and UI respond",
              [{"name": "API responds", "type": "http_check", "target": "http://127.0.0.1:8000/api/sites/"},
               {"name": "UI responds", "type": "http_check", "target": "http://127.0.0.1:5173/"},
               {"name": "Notify NOC channel", "type": "notify", "target": "#noc-alerts"}]),
             ("DR database recovery", "Data", "Bring DR-DB-01 back and verify replication",
              [{"name": "PostgreSQL port", "type": "tcp_check", "target": "10.60.1.45:5432"},
               {"name": "Power on via iDRAC", "type": "script", "target": "dr-db-01"},
               {"name": "Verify DR-DB-01", "type": "verify_health", "target": "device:dr-db-01"}]),
             ("Free disk on app VM", "Infrastructure", "Rotate logs and clear caches on VM-APP-01",
              [{"name": "Rotate logs", "type": "script", "target": "vm-app-01", "params": {"cmd": "logrotate -f /etc/logrotate.conf"}},
               {"name": "Verify VM-APP-01", "type": "verify_health", "target": "vm:vm-app-01"}])]
        rb = {}
        for name, cat, desc, steps in R:
            rb[name] = Runbook.objects.create(name=name, category=cat, description=desc, steps=steps, updated_at=now)
        for name, sev, src, text, runbook, enabled in [("OMS backlog → restart consumers", "critical", "prometheus", "OMS", "Restart OMS consumers", True),
                                                       ("Queue depth → clear backlog", "critical", "", "queue", "Clear RabbitMQ backlog", True),
                                                       ("Access port down → bounce", "critical", "snmp", "link down", "Bounce switch port", False),
                                                       ("DR DB down → recovery", "critical", "blackbox", "DR-DB-01", "DR database recovery", False),
                                                       ("App VM memory → free disk", "warning", "vsphere", "memory", "Free disk on app VM", True)]:
            AutomationRule.objects.create(name=name, match_severity=sev, match_source=src, match_text=text, runbook=rb[runbook], enabled=enabled)

    def rca(self):
        prb = Ticket.objects.filter(title="Switch port CRC errors on access layer").first()
        prb2 = Ticket.objects.filter(title="Intermittent NSE session drops on trade adapter").first()
        RcaReport.objects.create(number="RCA-0001", title="CRC errors and link loss on NCE-SW-01 access ports", problem=prb, status="published",
                                 incidents=[], author="Arjun Mehta", created_at=ago(days=18), published_at=ago(days=15),
                                 summary="Intermittent packet loss for trading desk hosts on NCE-SW-01.", impact="12 workstations saw 2–5% packet loss for ~40 minutes.",
                                 root_cause="Damaged Cat6 patch cable on Gi1/0/3 caused CRC errors; host failover moved load onto Gi1/0/24.",
                                 timeline=[{"ts": "09:12", "event": "CRC alarm on Gi1/0/3"}, {"ts": "09:30", "event": "Desk reports slowness"},
                                           {"ts": "09:52", "event": "Host moved to Gi1/0/9; errors stop"}],
                                 actions=[{"action": "Replace patch cable", "owner": "Arjun Mehta", "due": "done", "done": True},
                                          {"action": "Alert on CRC rate > 5/min", "owner": "NOC", "due": "next sprint", "done": True}])
        RcaReport.objects.create(number="RCA-0002", title="NSE session drops on trade adapter", problem=prb2, status="review",
                                 incidents=[], author="Priya Nair", created_at=ago(days=6),
                                 summary="Trade adapter sessions to NSE dropped 3–4 times per day.", impact="Order entry paused 20–40 s per drop.",
                                 root_cause="Adapter keepalive (120 s) exceeded the exchange idle timeout (90 s).",
                                 timeline=[{"ts": "Day 1 10:05", "event": "First drop observed"}, {"ts": "Day 3", "event": "Pattern correlated with idle periods"}],
                                 actions=[{"action": "Set keepalive to 30 s", "owner": "Trading Apps", "due": "next release", "done": False}])
        RcaReport.objects.create(number="RCA-0003", title="OMS backlog at market open", problem=Ticket.objects.filter(title="Recurring OMS backlog during market open").first(),
                                 status="draft", author="Priya Nair", created_at=ago(hours=20), summary="Investigation in progress.")

    def admin(self):
        I = [("Prometheus", "metrics", "Metrics scraping and alert rules", "http://10.10.1.200:9090"), ("Grafana", "dashboards", "Dashboards", ""),
             ("Nagios", "monitoring", "Legacy host/service checks", ""), ("VMware vCenter", "virtualization", "VM inventory and actions", "https://vcsa.finspot.in"),
             ("StackStorm", "automation", "Event-driven runbook execution", ""), ("Redmine", "itsm", "Ticket sync", ""),
             ("Slack", "chat", "Notifications to #noc-alerts", ""), ("Jira", "itsm", "Engineering ticket sync", ""),
             ("Keycloak", "identity", "SSO for Argus users", ""), ("Dell OpenManage / Redfish", "hardware", "iDRAC sensors", "")]
        for name, kind, desc, url in I:
            Integration.objects.create(name=name, kind=kind, description=desc, base_url=url)
        ch = {}
        for name, kind, target in [("NOC email", "email", "noc@finspot.in"), ("#noc-alerts", "slack", "#noc-alerts"),
                                   ("Trading Ops Teams", "teams", "Trading Ops"), ("On-call SMS", "sms", "+91 98200 01000"),
                                   ("Webhook (local test)", "webhook", "http://127.0.0.1:8000/api/sites/")]:
            ch[name] = NotificationChannel.objects.create(name=name, kind=kind, target=target)
        for name, sev, src, channel, bh in [("Critical → on-call SMS", "critical", "", "On-call SMS", False),
                                            ("Critical → #noc-alerts", "critical", "", "#noc-alerts", False),
                                            ("Warnings → NOC email", "warning", "", "NOC email", True),
                                            ("Trading alerts → Teams", "warning", "prometheus", "Trading Ops Teams", False)]:
            NotificationRule.objects.create(name=name, min_severity=sev, match_source=src, channel=ch[channel], business_hours_only=bh)
        S = [("org.name", "Finspot Technology Solutions", "text", [], "General", "Organisation name shown in reports"),
             ("org.timezone", "Asia/Kolkata", "choice", ["Asia/Kolkata", "UTC", "Asia/Singapore", "Europe/London"], "General", "Default display time zone"),
             ("ui.refresh_seconds", "30", "number", [], "General", "Dashboard auto-refresh interval"),
             ("tickets.auto_assign", "true", "bool", [], "Service Desk", "Round-robin assign new incidents within the group"),
             ("tickets.reopen_days", "7", "number", [], "Service Desk", "Days a resolved incident can be reopened"),
             ("alerts.dedupe_minutes", "10", "number", [], "Monitoring", "Window for merging repeated alerts"),
             ("alerts.auto_incident_severity", "critical", "choice", ["critical", "warning", "off"], "Monitoring", "Auto-create incidents at this severity"),
             ("uptime.default_interval", "60", "number", [], "Monitoring", "Default URL/TCP check interval (s)"),
             ("logs.retention_lines", "5000", "number", [], "Monitoring", "Log lines kept in the live tail"),
             ("bod.schedule", "08:30", "text", [], "BOD / EOD", "Beginning-of-day run time (IST)"),
             ("eod.schedule", "16:15", "text", [], "BOD / EOD", "End-of-day run time (IST)"),
             ("automation.mode", "dry_run", "choice", ["dry_run"], "Automation", "Runbook mode (live execution needs an agent)"),
             ("security.session_hours", "12", "number", [], "Security", "Session lifetime"),
             ("security.mfa_required", "true", "bool", [], "Security", "Require MFA for admins (via Keycloak)")]
        for key, val, typ, choices, group, desc in S:
            SystemSetting.objects.create(key=key, value=val, value_type=typ, choices=choices, group=group, description=desc)

    def vm_templates(self):
        now = timezone.now()
        for name, plat, os_, cpu, mem, disk, desc in [("ubuntu-22.04-std", "VMware", "Ubuntu 22.04 LTS", 4, 16, 120, "Standard app server"),
                                                       ("rhel-9-db", "VMware", "RHEL 9.4", 8, 64, 500, "Database server, separate data disk"),
                                                       ("win-2022-std", "VMware", "Windows Server 2022", 4, 16, 150, "Windows app server"),
                                                       ("ubuntu-22.04-small", "Proxmox", "Ubuntu 22.04 LTS", 2, 4, 40, "Utility / jump host"),
                                                       ("rhel-9-mq", "VMware", "RHEL 9.4", 8, 32, 400, "RabbitMQ broker"),
                                                       ("win-2019-hv", "Hyper-V", "Windows Server 2019", 4, 8, 100, "Legacy Hyper-V workloads")]:
            VmTemplate.objects.create(name=name, platform=plat, os=os_, vcpu=cpu, memory_gb=mem, disk_gb=disk, description=desc, updated_at=now)

    def kubernetes(self, sites):
        def nodes(prefix, n, pressure=None):
            return [{"name": f"{prefix}-{'master' if i == 0 else 'worker'}-{i:02d}", "role": "control-plane" if i == 0 else "worker",
                     "status": "MemoryPressure" if pressure == i else "Ready", "cpuPct": [22, 61, 48, 74, 39][i % 5], "memPct": [41, 66, 52, 91 if pressure == i else 58, 47][i % 5],
                     "pods": [18, 42, 37, 46, 29][i % 5], "kubelet": "v1.29.4"} for i in range(n)]
        wl = [("trading", "oms-api", "Deployment", 6, 6, 0, "oms-api:4.1.9"), ("trading", "order-gateway", "Deployment", 4, 4, 1, "order-gw:2.7.0"),
              ("trading", "risk-engine", "Deployment", 3, 3, 0, "risk:3.3.2"), ("trading", "market-data", "StatefulSet", 3, 2, 7, "md-feed:1.12.0"),
              ("platform", "argus-web", "Deployment", 2, 2, 0, "argus:1.0.0"), ("platform", "keycloak", "StatefulSet", 2, 2, 0, "keycloak:24.0"),
              ("platform", "ingress-nginx", "DaemonSet", 4, 4, 0, "ingress-nginx:1.10.1"), ("monitoring", "prometheus", "StatefulSet", 2, 2, 0, "prometheus:2.51"),
              ("monitoring", "node-exporter", "DaemonSet", 5, 5, 0, "node-exporter:1.8"), ("batch", "eod-reports", "CronJob", 1, 0, 3, "eod:0.9.4"),
              ("platform", "api-7d9c8", "Deployment", 3, 2, 12, "api:5.2.0")]
        KubeCluster.objects.create(name="k8s-cluster-01", version="v1.29.4", distribution="RKE2", site=sites.get("br-mum"), nodes=nodes("k8s", 5, pressure=3),
                                   workloads=[{"namespace": a, "name": b, "kind": c, "desired": d, "ready": e, "restarts": f, "image": g} for a, b, c, d, e, f, g in wl],
                                   events=[{"ts": (timezone.now() - timedelta(minutes=m)).isoformat(), "type": t, "object": o, "reason": r, "message": msg} for m, t, o, r, msg in [
                                       (3, "Warning", "pod/api-7d9c8-x2k", "BackOff", "Back-off restarting failed container"),
                                       (9, "Warning", "node/k8s-worker-03", "MemoryPressure", "Node has memory pressure"),
                                       (14, "Normal", "deployment/oms-api", "ScalingReplicaSet", "Scaled up replica set oms-api to 6"),
                                       (40, "Warning", "pod/market-data-2", "Unhealthy", "Readiness probe failed: HTTP 503"),
                                       (75, "Normal", "cronjob/eod-reports", "SawCompletedJob", "Saw completed job eod-reports-28812")]])
        KubeCluster.objects.create(name="k8s-cluster-dr", version="v1.28.9", distribution="RKE2", site=sites.get("dc-blr-1"), nodes=nodes("dr", 3),
                                   workloads=[{"namespace": "trading", "name": "oms-api", "kind": "Deployment", "desired": 2, "ready": 2, "restarts": 0, "image": "oms-api:4.1.9"},
                                              {"namespace": "monitoring", "name": "prometheus", "kind": "StatefulSet", "desired": 1, "ready": 1, "restarts": 0, "image": "prometheus:2.51"}],
                                   events=[])
