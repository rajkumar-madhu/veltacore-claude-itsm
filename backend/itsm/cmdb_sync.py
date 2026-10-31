"""Keep the CMDB in step with discovered inventory (devices, VMs, services)."""
from django.db import transaction
from django.utils import timezone

from monitoring.models import DomainService, NetworkDevice, VirtualMachine

from .models import CiRelationship, ConfigurationItem

DEVICE_CLASS = {"switch": "Network Switch", "router": "Network Router", "firewall": "Firewall", "load_balancer": "Load Balancer",
                "server": "Physical Server", "database": "Database Server", "storage": "Storage Array", "wireless": "Wireless Controller"}


def _next_id():
    last = ConfigurationItem.objects.order_by("-ci_id").values_list("ci_id", flat=True).first()
    return int(last[2:]) + 1 if last else 100001


@transaction.atomic
def sync():
    now = timezone.now()
    created = updated = 0
    seq = _next_id()

    def upsert(source, source_id, **fields):
        nonlocal created, updated, seq
        ci = ConfigurationItem.objects.filter(source=source, source_id=source_id).first()
        if ci is None:
            ci = ConfigurationItem.objects.create(ci_id=f"CI{seq}", source=source, source_id=source_id, updated_at=now, **fields)
            seq += 1
            created += 1
        else:
            for k, v in fields.items():
                setattr(ci, k, v)
            ci.updated_at = now
            ci.save()
            updated += 1
        return ci

    by_key = {}
    for d in NetworkDevice.objects.select_related("site"):
        status = "operational" if d.status == "online" else "degraded"
        by_key[d.id] = upsert("device", d.id, name=d.hostname, ci_class=DEVICE_CLASS.get(d.device_type, d.device_type), status=status,
                              environment=d.environment, site=d.site, ip=d.ip, owner=d.contact,
                              attributes={"vendor": d.vendor, "model": d.model, "serial": d.serial, "os": f"{d.os_type} {d.os_version}".strip()})
    hosts = {}
    for vm in VirtualMachine.objects.select_related("site", "datastore"):
        ci = upsert("vm", vm.id, name=vm.name, ci_class="Virtual Machine",
                    status="operational" if vm.state == "running" else "maintenance", environment=vm.environment, site=vm.site, ip=vm.ip,
                    attributes={"os": vm.os, "vcpu": vm.vcpu, "memoryGb": vm.memory_gb, "cluster": vm.cluster})
        by_key[vm.id] = ci
        host = hosts.get(vm.host) or upsert("device", f"esxi:{vm.host}", name=vm.host, ci_class="Hypervisor Host", status="operational",
                                             environment=vm.environment, site=vm.site, attributes={"hypervisor": vm.hypervisor, "cluster": vm.cluster})
        hosts[vm.host] = host
        ds = upsert("device", f"ds:{vm.datastore_id}", name=vm.datastore.name, ci_class="Datastore", status="operational",
                    environment=vm.environment, site=vm.site, attributes={"type": vm.datastore.type, "capacityGb": vm.datastore.capacity_gb})
        CiRelationship.objects.get_or_create(source=ci, target=host, rel_type="runs_on")
        CiRelationship.objects.get_or_create(source=ci, target=ds, rel_type="uses")

    for svc in DomainService.objects.select_related("domain"):
        ci = upsert("service", str(svc.id), name=svc.name, ci_class="Application Service", status="operational", environment="Production",
                    site=None, attributes={"domain": svc.domain.name, "host": svc.host})
        if svc.host in by_key:
            CiRelationship.objects.get_or_create(source=ci, target=by_key[svc.host], rel_type="runs_on")

    for d in NetworkDevice.objects.exclude(details={}):
        for n in d.details.get("neighbors", []):
            peer = ConfigurationItem.objects.filter(name__iexact=n["device"]).first()
            if peer and d.id in by_key and peer != by_key[d.id]:
                CiRelationship.objects.get_or_create(source=by_key[d.id], target=peer, rel_type="connects_to")
    return {"created": created, "updated": updated, "total": ConfigurationItem.objects.count()}
