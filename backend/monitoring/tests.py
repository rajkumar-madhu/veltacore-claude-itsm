from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Snapshot, VirtualMachine, VmEvent


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
