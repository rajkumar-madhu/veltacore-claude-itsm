from datetime import timedelta

from django.utils import timezone

from monitoring.models import Datastore, Snapshot, VirtualMachine, VmEvent

CLUSTER_HOSTS = {
    "Compute-01": [
        {"name": "esxi-host-01", "ip": "10.20.1.10"},
        {"name": "esxi-host-02", "ip": "10.20.1.11"},
        {"name": "esxi-host-03", "ip": "10.20.1.12"},
    ],
    "Compute-02": [
        {"name": "esxi-host-04", "ip": "10.30.1.10"},
        {"name": "esxi-host-05", "ip": "10.30.1.11"},
    ],
}

LINUX_SERVICES = [
    {"name": "sshd", "status": "running", "startup": "enabled", "description": "OpenSSH server"},
    {"name": "vmtoolsd", "status": "running", "startup": "enabled", "description": "VMware Tools daemon"},
    {"name": "node_exporter", "status": "running", "startup": "enabled", "description": "Prometheus node exporter"},
    {"name": "chronyd", "status": "running", "startup": "enabled", "description": "NTP client"},
    {"name": "rsyslog", "status": "running", "startup": "enabled", "description": "System logging"},
    {"name": "cron", "status": "running", "startup": "enabled", "description": "Scheduled jobs"},
]


def _details(*, role_services, processes, disks, nic_ip, cluster, alerts, logs, os_detail, base_services=LINUX_SERVICES):
    return {
        "disks": disks,
        "nics": [
            {"name": "Network adapter 1", "mac": "00:50:56:a1:3c:1e", "portgroup": "VM-Prod-VLAN20",
             "ip": nic_ip, "type": "VMXNET3", "connected": True, "speedGbps": 10},
            {"name": "Network adapter 2", "mac": "00:50:56:a1:3c:2f", "portgroup": "VM-Backup-VLAN60",
             "ip": "", "type": "VMXNET3", "connected": True, "speedGbps": 10},
        ],
        "processes": processes,
        "services": role_services + base_services,
        "alerts": alerts,
        "logs": logs,
        "guest": os_detail,
        "clusterHosts": CLUSTER_HOSTS[cluster],
        "config": {
            "VM hardware version": "vmx-19",
            "Firmware": "EFI (Secure Boot enabled)",
            "CPU hot add": "Enabled",
            "Memory hot add": "Enabled",
            "Memory reservation": "0 MB",
            "CPU shares": "Normal (4000)",
            "Latency sensitivity": "Normal",
            "SCSI controller": "VMware Paravirtual",
            "Boot delay": "0 ms",
            "DRS automation": "Fully automated",
            "HA restart priority": "High",
            "Backup policy": "Veeam — daily 02:00, 14-day retention",
        },
    }


def _linux_guest(os_name, kernel):
    return {"os": os_name, "kernel": kernel, "arch": "x86_64", "hostname": None,
            "timezone": "Asia/Kolkata (IST)", "lastBoot": None, "loadAvg": "0.82, 0.74, 0.69",
            "users": 2, "packages": 1184, "pendingUpdates": 7, "selinux": "Disabled",
            "firewall": "ufw active (6 rules)"}


def seed_vms(sites):
    now = timezone.now()
    Snapshot.objects.all().delete()
    VmEvent.objects.all().delete()
    VirtualMachine.objects.all().delete()
    Datastore.objects.all().delete()

    ds = {
        "ds01": Datastore.objects.create(id="ds01", name="DS01", type="VMFS6 (SSD)", capacity_gb=1200, used_gb=742),
        "ds02": Datastore.objects.create(id="ds02", name="DS02", type="VMFS6 (NVMe)", capacity_gb=2400, used_gb=1310),
        "ds03": Datastore.objects.create(id="ds03", name="DS03-Backup", type="NFS 4.1", capacity_gb=8000,
                                         used_gb=6720, provisioning="Thick Provisioned", status="warn"),
    }

    vms = [
        dict(
            id="vm-app-01", name="VM-APP-01", ip="10.20.1.15", cluster="Compute-01", host="esxi-host-01",
            datastore=ds["ds01"], site=sites["br-mum"], os="Ubuntu 22.04 LTS", role="Web Server",
            vcpu=4, memory_gb=16, cpu_pct=24.6, mem_pct=58.3, disk_pct=62.1, disk_used_gb=198,
            disk_provisioned_gb=320, net_in_mbps=12.4, net_out_mbps=8.2, uptime=timedelta(days=27, hours=8),
            created=now - timedelta(days=290), description="LinkedEye application server",
            details=_details(
                role_services=[
                    {"name": "nginx", "status": "running", "startup": "enabled", "description": "Reverse proxy / web server"},
                    {"name": "gunicorn", "status": "running", "startup": "enabled", "description": "Django app server"},
                    {"name": "redis-server", "status": "running", "startup": "enabled", "description": "Cache"},
                ],
                processes=[
                    {"pid": 1842, "name": "gunicorn", "user": "app", "cpu": 9.8, "memMb": 1240, "threads": 12},
                    {"pid": 1033, "name": "nginx", "user": "www-data", "cpu": 3.1, "memMb": 86, "threads": 4},
                    {"pid": 2210, "name": "redis-server", "user": "redis", "cpu": 2.4, "memMb": 512, "threads": 5},
                    {"pid": 912, "name": "node_exporter", "user": "prometheus", "cpu": 0.6, "memMb": 24, "threads": 8},
                    {"pid": 788, "name": "vmtoolsd", "user": "root", "cpu": 0.3, "memMb": 18, "threads": 3},
                    {"pid": 1, "name": "systemd", "user": "root", "cpu": 0.1, "memMb": 12, "threads": 1},
                ],
                disks=[
                    {"name": "Hard disk 1", "mount": "/", "fs": "ext4", "sizeGb": 80, "usedGb": 41, "datastore": "DS01", "provisioning": "Thin", "controller": "SCSI 0:0"},
                    {"name": "Hard disk 2", "mount": "/var/lib/app", "fs": "xfs", "sizeGb": 200, "usedGb": 139, "datastore": "DS01", "provisioning": "Thin", "controller": "SCSI 0:1"},
                    {"name": "Hard disk 3", "mount": "/var/log", "fs": "ext4", "sizeGb": 40, "usedGb": 18, "datastore": "DS01", "provisioning": "Thin", "controller": "SCSI 0:2"},
                ],
                nic_ip="10.20.1.15", cluster="Compute-01",
                alerts=[
                    {"severity": "warning", "title": "High memory usage (82%)", "since": "2h ago", "source": "node_exporter"},
                    {"severity": "info", "title": "7 pending OS security updates", "since": "1d ago", "source": "patch-audit"},
                ],
                logs=[
                    {"ts": "14:31:02", "level": "INFO", "source": "nginx", "message": "GET /api/health 200 3ms"},
                    {"ts": "14:30:41", "level": "WARN", "source": "kernel", "message": "Memory cgroup usage above 80% for app.slice"},
                    {"ts": "14:29:15", "level": "INFO", "source": "gunicorn", "message": "Worker 1842 booted"},
                    {"ts": "14:28:03", "level": "INFO", "source": "vmtoolsd", "message": "Heartbeat OK"},
                    {"ts": "14:25:54", "level": "ERROR", "source": "gunicorn", "message": "Upstream timeout calling /oms/orders (5001ms)"},
                    {"ts": "14:22:10", "level": "INFO", "source": "cron", "message": "logrotate completed"},
                ],
                os_detail=_linux_guest("Ubuntu 22.04.4 LTS", "5.15.0-105-generic"),
            ),
            snapshots=[
                ("pre-upgrade", timedelta(days=4, hours=4), 12, "Before system upgrade"),
                ("weekly-backup", timedelta(days=5, hours=12), 10, "Weekly backup"),
                ("post-config", timedelta(days=9, hours=19), 11, "After configuration"),
            ],
            events=[
                (timedelta(minutes=2), "info", "VM power state changed to Powered On"),
                (timedelta(minutes=5), "info", "VMware Tools heartbeat OK"),
                (timedelta(minutes=38), "warning", "High memory usage (82%)"),
                (timedelta(hours=2, minutes=16), "info", "Snapshot created: weekly-backup"),
                (timedelta(hours=3, minutes=58), "info", "VM migrated to esxi-host-01"),
            ],
        ),
        dict(
            id="vm-db-01", name="VM-DB-01", ip="10.20.1.21", cluster="Compute-01", host="esxi-host-02",
            datastore=ds["ds02"], site=sites["br-mum"], os="RHEL 8.8", role="Database",
            vcpu=8, memory_gb=64, cpu_pct=41.2, mem_pct=71.5, disk_pct=68.0, disk_used_gb=680,
            disk_provisioned_gb=1000, net_in_mbps=38.6, net_out_mbps=44.1, uptime=timedelta(days=61, hours=3),
            created=now - timedelta(days=410), description="Primary PostgreSQL for OMS",
            details=_details(
                role_services=[
                    {"name": "postgresql-15", "status": "running", "startup": "enabled", "description": "PostgreSQL 15"},
                    {"name": "pgbouncer", "status": "running", "startup": "enabled", "description": "Connection pooler"},
                    {"name": "postgres_exporter", "status": "running", "startup": "enabled", "description": "Prometheus Postgres exporter"},
                ],
                processes=[
                    {"pid": 2201, "name": "postgres", "user": "postgres", "cpu": 28.4, "memMb": 38912, "threads": 64},
                    {"pid": 2290, "name": "pgbouncer", "user": "postgres", "cpu": 3.2, "memMb": 64, "threads": 2},
                    {"pid": 912, "name": "node_exporter", "user": "prometheus", "cpu": 0.5, "memMb": 22, "threads": 8},
                    {"pid": 788, "name": "vmtoolsd", "user": "root", "cpu": 0.2, "memMb": 18, "threads": 3},
                ],
                disks=[
                    {"name": "Hard disk 1", "mount": "/", "fs": "xfs", "sizeGb": 100, "usedGb": 38, "datastore": "DS02", "provisioning": "Thin", "controller": "SCSI 0:0"},
                    {"name": "Hard disk 2", "mount": "/var/lib/pgsql", "fs": "xfs", "sizeGb": 800, "usedGb": 612, "datastore": "DS02", "provisioning": "Thick", "controller": "SCSI 1:0"},
                    {"name": "Hard disk 3", "mount": "/pg_wal", "fs": "xfs", "sizeGb": 100, "usedGb": 30, "datastore": "DS02", "provisioning": "Thick", "controller": "SCSI 1:1"},
                ],
                nic_ip="10.20.1.21", cluster="Compute-01",
                alerts=[{"severity": "warning", "title": "Replication lag 4.2s on standby", "since": "25m ago", "source": "postgres_exporter"}],
                logs=[
                    {"ts": "14:31:10", "level": "INFO", "source": "postgres", "message": "checkpoint complete: wrote 4821 buffers (2.9%)"},
                    {"ts": "14:27:44", "level": "WARN", "source": "postgres", "message": "replication lag to standby exceeds 4s"},
                    {"ts": "14:20:02", "level": "INFO", "source": "pgbouncer", "message": "stats: 812 xacts/s, 0 waiting clients"},
                ],
                os_detail=_linux_guest("Red Hat Enterprise Linux 8.8", "4.18.0-477.el8.x86_64"),
            ),
            snapshots=[("pre-pg15-upgrade", timedelta(days=30), 64, "Before PostgreSQL 15 upgrade")],
            events=[
                (timedelta(minutes=25), "warning", "Replication lag 4.2s on standby"),
                (timedelta(days=1, hours=2), "info", "Snapshot removed: pre-pg14-tuning"),
            ],
        ),
        dict(
            id="vm-web-02", name="VM-WEB-02", ip="10.20.1.16", cluster="Compute-01", host="esxi-host-03",
            datastore=ds["ds01"], site=sites["br-mum"], os="Ubuntu 22.04 LTS", role="Web Server",
            vcpu=4, memory_gb=8, cpu_pct=18.9, mem_pct=46.0, disk_pct=39.4, disk_used_gb=63,
            disk_provisioned_gb=160, net_in_mbps=9.1, net_out_mbps=6.4, uptime=timedelta(days=12, hours=19),
            created=now - timedelta(days=120), description="Secondary web node (LB pool)",
            details=_details(
                role_services=[{"name": "nginx", "status": "running", "startup": "enabled", "description": "Web server"}],
                processes=[
                    {"pid": 1033, "name": "nginx", "user": "www-data", "cpu": 4.0, "memMb": 92, "threads": 4},
                    {"pid": 912, "name": "node_exporter", "user": "prometheus", "cpu": 0.4, "memMb": 22, "threads": 8},
                ],
                disks=[{"name": "Hard disk 1", "mount": "/", "fs": "ext4", "sizeGb": 160, "usedGb": 63, "datastore": "DS01", "provisioning": "Thin", "controller": "SCSI 0:0"}],
                nic_ip="10.20.1.16", cluster="Compute-01", alerts=[],
                logs=[{"ts": "14:30:58", "level": "INFO", "source": "nginx", "message": "GET / 200 2ms"}],
                os_detail=_linux_guest("Ubuntu 22.04.4 LTS", "5.15.0-105-generic"),
            ),
            snapshots=[], events=[(timedelta(days=2), "info", "VM power state changed to Powered On")],
        ),
        dict(
            id="vm-mq-01", name="VM-MQ-01", ip="10.30.1.40", cluster="Compute-02", host="esxi-host-04",
            datastore=ds["ds02"], site=sites["dc-blr-1"], os="RHEL 9.2", role="Message Queue",
            vcpu=8, memory_gb=32, cpu_pct=63.8, mem_pct=77.2, disk_pct=44.0, disk_used_gb=176,
            disk_provisioned_gb=400, net_in_mbps=96.3, net_out_mbps=102.7, uptime=timedelta(days=4, hours=2),
            created=now - timedelta(days=200), description="RabbitMQ broker for market-data fan-out",
            details=_details(
                role_services=[{"name": "rabbitmq-server", "status": "running", "startup": "enabled", "description": "RabbitMQ broker"}],
                processes=[
                    {"pid": 3101, "name": "beam.smp", "user": "rabbitmq", "cpu": 54.2, "memMb": 20480, "threads": 96},
                    {"pid": 912, "name": "node_exporter", "user": "prometheus", "cpu": 0.6, "memMb": 24, "threads": 8},
                ],
                disks=[
                    {"name": "Hard disk 1", "mount": "/", "fs": "xfs", "sizeGb": 80, "usedGb": 30, "datastore": "DS02", "provisioning": "Thin", "controller": "SCSI 0:0"},
                    {"name": "Hard disk 2", "mount": "/var/lib/rabbitmq", "fs": "xfs", "sizeGb": 320, "usedGb": 146, "datastore": "DS02", "provisioning": "Thick", "controller": "SCSI 0:1"},
                ],
                nic_ip="10.30.1.40", cluster="Compute-02",
                alerts=[{"severity": "critical", "title": "Queue nse.ticks depth > 700", "since": "4m ago", "source": "rabbitmq_exporter"}],
                logs=[{"ts": "14:31:00", "level": "WARN", "source": "rabbitmq", "message": "queue nse.ticks: 742 messages ready"}],
                os_detail=_linux_guest("Red Hat Enterprise Linux 9.2", "5.14.0-284.el9.x86_64"),
            ),
            snapshots=[], events=[(timedelta(minutes=4), "error", "Queue nse.ticks depth > 700")],
        ),
        dict(
            id="vm-bkp-01", name="VM-BKP-01", ip="10.30.1.60", cluster="Compute-02", host="esxi-host-05",
            datastore=ds["ds03"], site=sites["dc-blr-1"], os="Windows Server 2022", role="Backup Proxy",
            vcpu=4, memory_gb=16, cpu_pct=0, mem_pct=0, disk_pct=81.0, disk_used_gb=1620,
            disk_provisioned_gb=2000, net_in_mbps=0, net_out_mbps=0, uptime=None,
            created=now - timedelta(days=500), description="Veeam backup proxy (powered off outside window)",
            details=_details(
                role_services=[{"name": "VeeamDeploySvc", "status": "stopped", "startup": "auto", "description": "Veeam proxy service"}],
                processes=[], nic_ip="10.30.1.60", cluster="Compute-02", base_services=[],
                disks=[{"name": "Hard disk 1", "mount": "C:", "fs": "NTFS", "sizeGb": 120, "usedGb": 61, "datastore": "DS03-Backup", "provisioning": "Thick", "controller": "SCSI 0:0"},
                       {"name": "Hard disk 2", "mount": "D:", "fs": "ReFS", "sizeGb": 1880, "usedGb": 1559, "datastore": "DS03-Backup", "provisioning": "Thick", "controller": "SCSI 0:1"}],
                alerts=[], logs=[],
                os_detail={"os": "Windows Server 2022 Standard", "kernel": "10.0.20348", "arch": "x64",
                           "hostname": None, "timezone": "India Standard Time", "lastBoot": None,
                           "loadAvg": "—", "users": 0, "packages": 214, "pendingUpdates": 3,
                           "selinux": "—", "firewall": "Windows Defender Firewall (domain profile)"},
            ),
            snapshots=[], events=[(timedelta(hours=6), "info", "VM power state changed to Powered Off")],
        ),
    ]

    for spec in vms:
        snaps, events, uptime, created = spec.pop("snapshots"), spec.pop("events"), spec.pop("uptime"), spec.pop("created")
        spec["details"]["guest"]["hostname"] = spec["name"].lower()
        if uptime:
            spec["details"]["guest"]["lastBoot"] = (now - uptime).strftime("%Y-%m-%d %H:%M")
        vm = VirtualMachine.objects.create(
            hypervisor="VMware ESXi 7.0", vcenter="vcsa.finspot.in",
            os_family="Windows" if spec["os"].startswith("Windows") else "Linux",
            state="running" if uptime else "stopped",
            powered_on_at=(now - uptime) if uptime else None,
            created_at=created, ha_protected=uptime is not None,
            tools_status="Running (12.4.5)" if uptime else "Not running",
            **spec,
        )
        Snapshot.objects.bulk_create([
            Snapshot(vm=vm, name=n, created_at=now - ago, size_gb=size, description=d) for n, ago, size, d in snaps
        ])
        VmEvent.objects.bulk_create([VmEvent(vm=vm, ts=now - ago, level=lvl, message=m) for ago, lvl, m in events])

    return VirtualMachine.objects.count()
