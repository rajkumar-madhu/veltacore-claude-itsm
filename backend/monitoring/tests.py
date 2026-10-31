from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import NetworkDevice, Snapshot, VirtualMachine, VmEvent


@override_settings(DEBUG=True)
class VmApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def setUp(self):
        self.client = APIClient()

    def act(self, vm_id, action, **payload):
        return self.client.post(f"/api/vms/{vm_id}/action/", {"action": action, **payload}, format="json")

    def test_list_returns_summary_rows(self):
        res = self.client.get("/api/vms/")
        self.assertEqual(res.status_code, 200)
        names = [v["name"] for v in res.json()]
        self.assertIn("VM-APP-01", names)
        self.assertNotIn("details", res.json()[0])

    def test_detail_includes_datastore_snapshots_events_and_uptime(self):
        vm = self.client.get("/api/vms/vm-app-01/").json()
        self.assertEqual(vm["datastore"]["name"], "DS01")
        self.assertEqual(len(vm["snapshots"]), 3)
        self.assertTrue(vm["events"])
        self.assertEqual(vm["hostIp"], "10.20.1.10")
        self.assertGreater(vm["uptimeSeconds"], 27 * 86400)

    def test_stopped_vm_has_no_uptime(self):
        self.assertIsNone(self.client.get("/api/vms/vm-bkp-01/").json()["uptimeSeconds"])

    def test_unknown_vm_404s(self):
        self.assertEqual(self.client.get("/api/vms/nope/").status_code, 404)
        self.assertEqual(self.act("nope", "power_on").status_code, 404)

    def test_power_cycle_and_events(self):
        self.assertEqual(self.act("vm-app-01", "power_off").status_code, 200)
        vm = VirtualMachine.objects.get(pk="vm-app-01")
        self.assertEqual(vm.state, "stopped")
        self.assertIsNone(vm.powered_on_at)
        self.assertEqual(self.act("vm-app-01", "power_on").status_code, 200)
        self.assertEqual(VirtualMachine.objects.get(pk="vm-app-01").state, "running")
        self.assertTrue(VmEvent.objects.filter(vm_id="vm-app-01", message__contains="Powered Off").exists())

    def test_invalid_transition_is_rejected(self):
        res = self.act("vm-bkp-01", "suspend")
        self.assertEqual(res.status_code, 400)
        self.assertIn("powered off", res.json()["detail"])

    def test_restart_needs_tools(self):
        VirtualMachine.objects.filter(pk="vm-app-01").update(tools_status="Not running")
        self.assertEqual(self.act("vm-app-01", "restart").status_code, 400)

    def test_take_snapshot(self):
        self.assertEqual(self.act("vm-app-01", "take_snapshot", name="before-patch").status_code, 200)
        self.assertTrue(Snapshot.objects.filter(vm_id="vm-app-01", name="before-patch").exists())

    def test_edit_settings_validates(self):
        self.assertEqual(self.act("vm-app-01", "edit_settings", vcpu=0, memoryGb=16, description="").status_code, 400)
        self.assertEqual(self.act("vm-app-01", "edit_settings", vcpu=8, memoryGb=32, description="x").status_code, 200)
        vm = VirtualMachine.objects.get(pk="vm-app-01")
        self.assertEqual((vm.vcpu, vm.memory_gb), (8, 32))

    def test_migrate_only_within_cluster(self):
        self.assertEqual(self.act("vm-app-01", "migrate", targetHost="esxi-host-04").status_code, 400)
        self.assertEqual(self.act("vm-app-01", "migrate", targetHost="esxi-host-01").status_code, 400)
        self.assertEqual(self.act("vm-app-01", "migrate", targetHost="esxi-host-02").status_code, 200)
        self.assertEqual(VirtualMachine.objects.get(pk="vm-app-01").host, "esxi-host-02")

    def test_clone_creates_powered_off_copy(self):
        self.assertEqual(self.act("vm-app-01", "clone", name="VM-APP-01-CLONE").status_code, 200)
        clone = VirtualMachine.objects.get(pk="vm-app-01-clone")
        self.assertEqual(clone.state, "stopped")
        self.assertEqual(clone.snapshots.count(), 0)
        self.assertEqual(self.act("vm-app-01", "clone", name="VM-APP-01-CLONE").status_code, 400)
        self.assertEqual(self.act("vm-app-01", "clone", name="bad name!").status_code, 400)

    def test_run_command_needs_running_vm(self):
        self.assertEqual(self.act("vm-bkp-01", "run_command", command="uptime").status_code, 400)
        self.assertEqual(self.act("vm-app-01", "run_command", command="uptime").status_code, 200)

    def test_unknown_action(self):
        self.assertEqual(self.act("vm-app-01", "explode").status_code, 400)

    @override_settings(DEBUG=False)
    def test_actions_need_auth_outside_debug(self):
        self.assertIn(self.act("vm-app-01", "power_off").status_code, (401, 403))
        self.assertEqual(VirtualMachine.objects.get(pk="vm-app-01").state, "running")
        self.assertEqual(self.client.get("/api/vms/vm-app-01/").status_code, 200)


@override_settings(DEBUG=True)
class DeviceApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def setUp(self):
        self.client = APIClient()

    def act(self, device_id, action, **payload):
        return self.client.post(f"/api/devices/{device_id}/action/", {"action": action, **payload}, format="json")

    def onboard(self, **overrides):
        body = {"deviceType": "server", "hostname": "NSE-APP-09", "ip": "10.10.1.99", "site": "br-mum",
                "environment": "Production", "vendor": "Dell", "model": "PowerEdge R740", **overrides}
        return self.client.post("/api/devices/", body, format="json")

    def test_type_filter_and_recent_sort(self):
        rows = self.client.get("/api/devices/?type=switch").json()
        self.assertTrue(rows and all(r["deviceType"] == "switch" for r in rows))
        recent = self.client.get("/api/devices/?sort=recent").json()
        self.assertEqual(recent, sorted(recent, key=lambda r: r["onboardedAt"], reverse=True))

    def test_switch_detail_has_48_ports(self):
        d = self.client.get("/api/devices/nce-sw-01/").json()
        self.assertEqual(len(d["details"]["ports"]), 48)
        self.assertEqual(d["osVersion"], "15.2(4)E")

    def test_onboard_creates_device_and_normalises_hostname(self):
        res = self.onboard(hostname="nse-app-09")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["hostname"], "NSE-APP-09")
        self.assertEqual(res.json()["status"], "unknown")

    def test_onboard_stores_cmdb_and_monitoring(self):
        res = self.onboard(
            cmdb={"ciClass": "Server", "businessService": "NSE Trading", "criticality": "P1 - Critical", "supportGroup": "Infra"},
            monitoring={"checks": ["ICMP ping", "SSH/22"], "intervalSec": 60, "alertProfile": "Trading critical"},
        )
        self.assertEqual(res.status_code, 201, res.content)
        details = NetworkDevice.objects.get(pk="nse-app-09").details
        self.assertEqual(details["cmdb"]["criticality"], "P1 - Critical")
        self.assertEqual(details["monitoring"]["checks"], ["ICMP ping", "SSH/22"])
        bad = self.onboard(hostname="NSE-APP-10", ip="10.10.1.100", monitoring={"checks": [], "intervalSec": 7, "alertProfile": "Default"})
        self.assertIn("monitoring", bad.json())

    def test_onboard_rejects_duplicates_and_bad_input(self):
        self.assertIn("hostname", self.onboard(hostname="NCE-SW-01").json())
        self.assertIn("ip", self.onboard(ip="10.10.1.50").json())
        self.assertIn("site", self.onboard(site="nowhere").json())
        self.assertIn("hostname", self.onboard(hostname="bad host!").json())
        self.assertIn("deviceType", self.onboard(deviceType="toaster").json())

    def test_bulk_import_reports_row_errors(self):
        rows = [
            {"deviceType": "switch", "hostname": "BLK-SW-01", "ip": "10.70.0.1", "site": "br-mum", "environment": "UAT"},
            {"deviceType": "switch", "hostname": "BLK-SW-02", "ip": "10.70.0.1", "site": "br-mum", "environment": "UAT"},
            {"deviceType": "switch", "hostname": "", "ip": "nope", "site": "br-mum", "environment": "UAT"},
        ]
        out = self.client.post("/api/devices/bulk/", {"rows": rows}, format="json").json()
        self.assertEqual(out["created"], ["BLK-SW-01"])
        self.assertEqual([e["row"] for e in out["errors"]], [2, 3])
        self.assertIn("ip", out["errors"][0]["errors"])

    def test_bulk_requires_rows(self):
        self.assertEqual(self.client.post("/api/devices/bulk/", {"rows": []}, format="json").status_code, 400)

    def test_discover_refuses_public_addresses(self):
        res = self.client.post("/api/devices/discover/", {"ip": "8.8.8.8"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.post("/api/devices/discover/", {"ip": "nope"}, format="json").status_code, 400)

    def test_discover_finds_a_real_listening_port(self):
        import socket
        from . import device_actions
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen()
        port = srv.getsockname()[1]
        original = device_actions.PORTS
        device_actions.PORTS = [(port, "Test", "Test listener"), (1, "Closed", "nothing here")]
        try:
            out = self.client.post("/api/devices/discover/", {"ip": "127.0.0.1"}, format="json").json()
        finally:
            device_actions.PORTS = original
            srv.close()
        self.assertTrue(out["reachable"])
        self.assertEqual([s["port"] for s in out["services"]], [port])

    def test_set_port_toggles_admin_state(self):
        self.assertEqual(self.act("nce-sw-01", "set_port", port="Gi1/0/5", enabled=False).status_code, 200)
        ports = NetworkDevice.objects.get(pk="nce-sw-01").details["ports"]
        self.assertEqual(next(p for p in ports if p["name"] == "Gi1/0/5")["status"], "disabled")
        self.assertEqual(self.act("nce-sw-01", "set_port", port="Gi1/0/5", enabled=True).status_code, 200)
        self.assertEqual(self.act("nce-sw-01", "set_port", port="Gi9/9/9", enabled=True).status_code, 400)
        self.assertEqual(self.act("nse-srv-01", "set_port", port="Gi1/0/5", enabled=True).status_code, 400)

    def test_bmc_power_cycle(self):
        self.assertEqual(self.act("nse-srv-01", "power_on").status_code, 400)
        self.assertEqual(self.act("nse-srv-01", "graceful_shutdown").status_code, 200)
        self.assertEqual(NetworkDevice.objects.get(pk="nse-srv-01").status, "offline")
        self.assertEqual(self.act("nse-srv-01", "power_on").status_code, 200)
        self.assertEqual(self.act("mcx-app-01", "force_off").status_code, 400)  # no BMC

    def test_edit_validates_email(self):
        bad = self.act("nce-sw-01", "edit", role="Core", location="R1", contact="not-an-email", description="")
        self.assertEqual(bad.status_code, 400)
        ok = self.act("nce-sw-01", "edit", role="Core", location="R1", contact="a@b.in", description="x")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(NetworkDevice.objects.get(pk="nce-sw-01").role, "Core")

    @override_settings(DEBUG=False)
    def test_writes_need_auth_outside_debug(self):
        self.assertIn(self.onboard().status_code, (401, 403))
        self.assertIn(self.act("nse-srv-01", "force_off").status_code, (401, 403))
        self.assertEqual(self.client.get("/api/devices/").status_code, 200)


class DomainHealthRuleTests(TestCase):
    def test_thresholds(self):
        from .domain_health import metric_status
        self.assertEqual(metric_status("availability", 99.95), "ok")
        self.assertEqual(metric_status("availability", 99.7), "warn")
        self.assertEqual(metric_status("availability", 99.0), "crit")
        self.assertEqual(metric_status("errorRate", 0.5), "ok")
        self.assertEqual(metric_status("errorRate", 2.0), "crit")
        self.assertEqual(metric_status("cpuPct", None), "unknown")

    def test_saturation_alone_caps_at_warn(self):
        from .domain_health import service_health
        statuses = {"availability": "ok", "responseMs": "ok", "errorRate": "ok", "latencyP95Ms": "ok",
                    "cpuPct": "crit", "memPct": "ok", "diskPct": "ok", "netPct": "ok"}
        self.assertEqual(service_health(statuses), "warn")
        self.assertEqual(service_health({**statuses, "errorRate": "crit"}), "crit")
        self.assertEqual(service_health({k: "unknown" for k in statuses}), "unknown")


@override_settings(DEBUG=True)
class DomainApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def setUp(self):
        self.client = APIClient()

    def test_list_summarises_health(self):
        rows = {d["id"]: d for d in self.client.get("/api/domains/").json()}
        self.assertEqual(rows["trading"]["health"], "crit")
        self.assertEqual(rows["security"]["health"], "ok")
        self.assertEqual(rows["trading"]["availability"], 99.02)  # weakest service
        self.assertIn("statuses", rows["trading"]["services"][0])

    def test_detail_has_flow_health_and_incidents(self):
        d = self.client.get("/api/domains/trading/").json()
        flow = {n["label"]: n["health"] for n in d["flow"]}
        self.assertEqual(flow["OMS"], "crit")
        self.assertEqual(flow["Exchange"], "unknown")
        self.assertEqual(d["incidents"][0]["id"], "INC000123")
        self.assertEqual(self.client.get("/api/domains/nope/").status_code, 404)

    def test_create_and_delete_empty_domain(self):
        res = self.client.post("/api/domains/", {"name": "Payments", "description": "Cards & UPI"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["health"], "unknown")
        self.assertEqual(self.client.post("/api/domains/", {"name": "payments"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/domains/", {"name": "!!!"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete("/api/domains/payments/").status_code, 204)

    def test_cannot_delete_domain_with_services(self):
        self.assertEqual(self.client.delete("/api/domains/trading/").status_code, 400)

    @override_settings(DEBUG=False)
    def test_writes_need_auth_outside_debug(self):
        self.assertIn(self.client.post("/api/domains/", {"name": "X"}, format="json").status_code, (401, 403))
        self.assertEqual(self.client.get("/api/domains/").status_code, 200)


@override_settings(DEBUG=True)
class ExporterLogApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def setUp(self):
        self.client = APIClient()

    def test_stats_counts(self):
        s = self.client.get("/api/exporters/stats/").json()
        self.assertEqual(s["total"], 87)
        self.assertEqual(s["byStatus"], {"active": 72, "inactive": 6, "error": 4, "not_configured": 5})
        self.assertEqual(sum(s["byCategory"].values()), 87)
        self.assertEqual(len(s["trend"]), 24)
        self.assertGreater(s["logs24h"], 0)

    def test_list_filters_and_logs24h(self):
        rows = self.client.get("/api/exporters/?category=databases").json()
        self.assertTrue(rows and all(r["category"] == "databases" for r in rows))
        self.assertTrue(any(r["logs24h"] > 0 for r in rows))
        self.assertEqual([r["name"] for r in self.client.get("/api/exporters/?q=kafka").json()], ["kafka-exporter"])

    def test_create_update_delete(self):
        body = {"name": "test-exporter", "exporterType": "Node Exporter", "category": "servers", "target": "srv-9", "endpoint": "10.1.2.3:9100"}
        res = self.client.post("/api/exporters/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["status"], "not_configured")
        self.assertIn("name", self.client.post("/api/exporters/", body, format="json").json())
        self.assertIn("endpoint", self.client.post("/api/exporters/", {**body, "name": "x2", "endpoint": "nope"}, format="json").json())
        upd = self.client.patch("/api/exporters/test-exporter/", {"intervalSec": 300, "endpoint": ""}, format="json")
        self.assertEqual(upd.json()["intervalSec"], 300)
        self.assertEqual(upd.json()["status"], "not_configured")
        self.assertEqual(self.client.delete("/api/exporters/test-exporter/").status_code, 204)

    def test_bulk_action_counts_only_exporters(self):
        res = self.client.post("/api/exporters/bulk-action/", {"ids": ["mysql-exporter", "redis-exporter"], "action": "delete"}, format="json")
        self.assertEqual(res.json()["count"], 2)
        res = self.client.post("/api/exporters/bulk-action/", {"ids": ["kafka-exporter"], "action": "disable"}, format="json")
        from .models import Exporter
        self.assertEqual(Exporter.objects.get(pk="kafka-exporter").status, "inactive")

    def test_endpoint_test_against_real_socket(self):
        import socket
        from .models import Exporter
        srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen()
        Exporter.objects.filter(pk="kafka-exporter").update(endpoint=f"127.0.0.1:{srv.getsockname()[1]}", status="error")
        try:
            res = self.client.post("/api/exporters/kafka-exporter/test/").json()
        finally:
            srv.close()
        self.assertTrue(res["ok"])
        self.assertEqual(Exporter.objects.get(pk="kafka-exporter").status, "active")
        Exporter.objects.filter(pk="kafka-exporter").update(status="inactive")
        srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen()
        Exporter.objects.filter(pk="kafka-exporter").update(endpoint=f"127.0.0.1:{srv.getsockname()[1]}")
        try:
            res = self.client.post("/api/exporters/kafka-exporter/test/").json()
        finally:
            srv.close()
        self.assertEqual(res["status"], "inactive")  # a disabled exporter stays disabled
        Exporter.objects.filter(pk="kafka-exporter").update(endpoint="8.8.8.8:53")
        self.assertEqual(self.client.post("/api/exporters/kafka-exporter/test/").status_code, 400)

    def test_ingest_counts_and_rejects(self):
        from .models import LogEntry
        before = self.client.get("/api/exporters/stats/").json()["logs24h"]
        res = self.client.post("/api/logs/ingest/", {"entries": [
            {"exporter": "kafka-exporter", "level": "warning", "message": "lag 900"},
            {"exporter": "nope", "level": "INFO", "message": "x"},
            {"exporter": "kafka-exporter", "level": "DEBUG", "message": "x"},
        ]}, format="json").json()
        self.assertEqual(res, {"accepted": 1, "rejected": [1, 2]})
        self.assertEqual(LogEntry.objects.first().level, "WARN")
        self.assertEqual(self.client.get("/api/exporters/stats/").json()["logs24h"], before + 1)
        self.assertEqual(self.client.get("/api/logs/?exporter=kafka-exporter&limit=1").json()[0]["message"], "lag 900")
        self.assertEqual(self.client.post("/api/logs/ingest/", {"entries": []}, format="json").status_code, 400)

    def test_events_merge_vm_and_device_events(self):
        ev = self.client.get("/api/events/?limit=20").json()
        sources = {e["source"] for e in ev}
        self.assertTrue(any(s.startswith("VM-") for s in sources) and any(s.startswith("N") for s in sources))
        self.assertEqual(ev, sorted(ev, key=lambda e: e["ts"], reverse=True))

    @override_settings(DEBUG=False)
    def test_writes_need_auth_outside_debug(self):
        self.assertIn(self.client.post("/api/logs/ingest/", {"entries": [{"exporter": "kafka-exporter", "level": "INFO", "message": "x"}]}, format="json").status_code, (401, 403))
        self.assertIn(self.client.delete("/api/exporters/kafka-exporter/").status_code, (401, 403))
        self.assertEqual(self.client.get("/api/exporters/").status_code, 200)
