"""Lifecycle actions on a VirtualMachine.

These change state in this app's own database only — there is no live
hypervisor/vCenter connection behind them, so they model what the platform
would record, not a real power operation.
"""
import re

from django.db import transaction
from django.utils import timezone

from .models import Snapshot, VirtualMachine, VmEvent
from .serializers import VmSettingsSerializer


class ActionError(Exception):
    pass


# action -> (states it is allowed from, resulting state, event message)
POWER_TRANSITIONS = {
    "power_on": ({"stopped", "suspended"}, "running", "VM power state changed to Powered On"),
    "power_off": ({"running", "suspended"}, "stopped", "VM power state changed to Powered Off"),
    "suspend": ({"running"}, "suspended", "VM suspended"),
    "reset": ({"running"}, "running", "VM hard reset"),
    "restart": ({"running"}, "running", "Guest OS restart initiated"),
}


def _event(vm, message, level="info"):
    VmEvent.objects.create(vm=vm, ts=timezone.now(), level=level, message=message)


def _power(vm, action):
    allowed_from, to_state, message = POWER_TRANSITIONS[action]
    if vm.state not in allowed_from:
        raise ActionError(f"Cannot {action.replace('_', ' ')} a VM that is {vm.get_state_display().lower()}.")
    if action == "restart" and not vm.tools_status.startswith("Running"):
        raise ActionError("Guest restart needs VMware Tools running — use Reset instead.")
    vm.state = to_state
    if to_state == "running" and (action in ("reset", "restart") or vm.powered_on_at is None):
        vm.powered_on_at = timezone.now()
    elif to_state == "stopped":
        vm.powered_on_at = None
    vm.save(update_fields=["state", "powered_on_at"])
    _event(vm, message)
    return message


def _take_snapshot(vm, payload):
    now = timezone.now()
    name = (payload.get("name") or "").strip() or f"snap-{now:%Y%m%d-%H%M}"
    if len(name) > 80:
        raise ActionError("Snapshot name must be 80 characters or fewer.")
    description = (payload.get("description") or "").strip()[:200]
    Snapshot.objects.create(
        vm=vm, name=name, created_at=now, size_gb=max(1, round(vm.disk_used_gb * 0.05)), description=description,
    )
    _event(vm, f"Snapshot created: {name}")
    return f"Snapshot '{name}' created"


def _edit_settings(vm, payload):
    s = VmSettingsSerializer(data=payload)
    if not s.is_valid():
        field, errors = next(iter(s.errors.items()))
        raise ActionError(f"{field}: {errors[0]}")
    d = s.validated_data
    changes = []
    if d["vcpu"] != vm.vcpu:
        changes.append(f"vCPU {vm.vcpu} → {d['vcpu']}")
    if d["memoryGb"] != vm.memory_gb:
        changes.append(f"memory {vm.memory_gb} GB → {d['memoryGb']} GB")
    if d["description"] != vm.description:
        changes.append("description updated")
    if not changes:
        return "No changes"
    vm.vcpu, vm.memory_gb, vm.description = d["vcpu"], d["memoryGb"], d["description"]
    vm.save(update_fields=["vcpu", "memory_gb", "description"])
    _event(vm, "Settings changed: " + ", ".join(changes))
    return "Settings saved"


def _migrate(vm, payload):
    target = (payload.get("targetHost") or "").strip()
    hosts = [h["name"] for h in vm.details.get("clusterHosts", [])]
    if target not in hosts:
        raise ActionError(f"Target host must be one of: {', '.join(hosts)}.")
    if target == vm.host:
        raise ActionError(f"{vm.name} is already on {target}.")
    vm.host = target
    vm.save(update_fields=["host"])
    _event(vm, f"VM migrated to {target}")
    return f"Migrated to {target}"


def _clone(vm, payload):
    name = (payload.get("name") or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{1,62}", name):
        raise ActionError("Clone name must be 2–63 characters: letters, digits and hyphens.")
    new_id = name.lower()
    if VirtualMachine.objects.filter(pk=new_id).exists():
        raise ActionError(f"A VM named {name} already exists.")
    now = timezone.now()
    clone = VirtualMachine.objects.get(pk=vm.pk)
    clone.pk, clone.name = new_id, name
    clone.state, clone.powered_on_at, clone.created_at = "stopped", None, now
    clone.description = f"Clone of {vm.name}"
    clone.save(force_insert=True)
    _event(clone, f"Cloned from {vm.name}")
    _event(vm, f"Clone created: {name}")
    return f"Clone {name} created (powered off)"


def _run_command(vm, payload):
    command = (payload.get("command") or "").strip()
    if not command or len(command) > 200:
        raise ActionError("Command is required (max 200 characters).")
    if vm.state != "running":
        raise ActionError("The VM must be running to run a guest command.")
    _event(vm, f"Guest command queued: {command}")
    return "Command queued"


HANDLERS = {
    "take_snapshot": _take_snapshot,
    "edit_settings": _edit_settings,
    "migrate": _migrate,
    "clone": _clone,
    "run_command": _run_command,
}


@transaction.atomic
def perform(vm_id, action, payload):
    vm = VirtualMachine.objects.select_for_update().get(pk=vm_id)
    if action in POWER_TRANSITIONS:
        return _power(vm, action)
    if action in HANDLERS:
        return HANDLERS[action](vm, payload)
    raise ActionError(f"Unknown action '{action}'.")
