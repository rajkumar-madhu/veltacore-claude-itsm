import random
from datetime import timedelta

from django.utils import timezone

from monitoring.models import DeviceEvent, NetworkDevice


def _ports(seed, *, down=(), disabled=(), unused=(), hot=None, errors=None):
    """48 x 1G access ports. `hot` = {port#: (in, out)} for busy uplinks."""
    rnd = random.Random(seed)
    hot, errors = hot or {}, errors or {}
    vlan_for = lambda n: 10 if n <= 8 else 20 if n <= 16 else 30 if n <= 32 else 40 if n <= 40 else 50
    ports = []
    for n in range(1, 49):
        status = "down" if n in down else "disabled" if n in disabled else "unused" if n in unused else "up"
        inb, outb = hot.get(n, (round(rnd.uniform(2, 180)), round(rnd.uniform(2, 140)))) if status == "up" else (0, 0)
        e_in, e_out, disc = errors.get(n, (0, 0, 0))
        ports.append({
            "name": f"Gi1/0/{n}", "number": n, "status": status, "speedMbps": 1000 if status == "up" else 0,
            "duplex": "full" if status == "up" else "—", "vlan": vlan_for(n), "mode": "trunk" if n in hot else "access",
            "inMbps": inb, "outMbps": outb, "inErrors": e_in, "outErrors": e_out, "discards": disc,
            "description": "Uplink" if n in hot else "" if status == "unused" else f"Access port {n}",
            "mac": f"00:1B:54:AA:{n:02X}:{rnd.randint(16, 255):02X}",
        })
    return ports


VLANS = [
    {"id": 1, "name": "default", "status": "active", "ports": "1-4, 10", "description": "Default VLAN"},
    {"id": 10, "name": "Management", "status": "active", "ports": "5-8", "description": "Management Network"},
    {"id": 20, "name": "Servers", "status": "active", "ports": "9-16", "description": "Server Network"},
    {"id": 30, "name": "Trading", "status": "active", "ports": "17-32", "description": "Trading Systems"},
    {"id": 40, "name": "Voice", "status": "active", "ports": "33-40", "description": "VoIP Phones"},
    {"id": 50, "name": "Guest", "status": "active", "ports": "41-48", "description": "Guest Network"},
]

RUNNING_CONFIG = """! Last configuration change at 09:12:44 IST Fri Oct 30 2026
version 15.2
service timestamps log datetime msec localtime
service password-encryption
hostname {host}
!
logging buffered 64000
aaa new-model
aaa authentication login default group tacacs+ local
!
spanning-tree mode rapid-pvst
spanning-tree extend system-id
!
vlan 10
 name Management
vlan 20
 name Servers
vlan 30
 name Trading
vlan 40
 name Voice
vlan 50
 name Guest
!
interface GigabitEthernet1/0/1
 description Uplink to NSE-RTR-01
 switchport mode trunk
!
interface GigabitEthernet1/0/20
 shutdown
!
interface Vlan10
 ip address {ip} 255.255.255.0
!
snmp-server community ******** RO
snmp-server host 10.10.1.200 version 2c ********
ntp server 10.10.1.5
end"""


def _switch_details(host, ip, ports, alerts):
    return {
        "ports": ports,
        "vlans": VLANS,
        "neighbors": [
            {"device": "NSE-RTR-01", "localPort": "Gi1/0/1", "remotePort": "Gi0/0", "platform": "Cisco 2911", "ip": "10.10.1.1", "protocol": "CDP"},
            {"device": "NSE-SW-02", "localPort": "Gi1/0/48", "remotePort": "Gi1/0/48", "platform": "Cisco 2960-X", "ip": "10.10.1.51", "protocol": "CDP"},
            {"device": "FW-01", "localPort": "Gi1/0/47", "remotePort": "port3", "platform": "FortiGate", "ip": "10.10.1.254", "protocol": "LLDP"},
            {"device": "AP-01", "localPort": "Gi1/0/10", "remotePort": "Gi0", "platform": "Cisco AP3802", "ip": "10.10.2.10", "protocol": "CDP"},
            {"device": "IP-Phone-01", "localPort": "Gi1/0/20", "remotePort": "Port 1", "platform": "Cisco 8841", "ip": "10.10.3.20", "protocol": "CDP"},
            {"device": "ESXi-01", "localPort": "Gi1/0/25", "remotePort": "vmnic0", "platform": "VMware ESXi", "ip": "10.20.1.10", "protocol": "LLDP"},
        ],
        "alerts": alerts,
        "stp": {
            "mode": "Rapid PVST+",
            "instances": [
                {"vlan": v["id"], "rootBridge": "NSE-RTR-01" if v["id"] in (1, 10) else host, "rootPriority": 4096 if v["id"] in (1, 10) else 24576,
                 "isRoot": v["id"] not in (1, 10), "rootPort": "Gi1/0/1" if v["id"] in (1, 10) else "—", "topologyChanges": 2 if v["id"] == 30 else 0}
                for v in VLANS
            ],
        },
        "hardware": {
            "chassis": "WS-C2960X-48TS-L", "memoryMb": 512, "flashMb": 128, "cpu": "APM86xxx 600 MHz",
            "psus": [{"name": "PSU 1", "model": "PWR-C2-250WAC", "status": "ok", "watts": 74}],
            "fans": [{"name": "Fan 1", "status": "ok", "rpm": 6120}, {"name": "Fan 2", "status": "ok", "rpm": 6080}],
            "sensors": [{"name": "Inlet", "valueC": 31, "warnC": 56}, {"name": "Hotspot", "valueC": 36, "warnC": 70}],
        },
        "inventory": [
            {"name": "Switch 1", "description": "WS-C2960X-48TS-L", "pid": "WS-C2960X-48TS-L", "serial": "FOC1234A0BC"},
            {"name": "GigabitEthernet1/0/49 SFP", "description": "1000BaseSX SFP", "pid": "GLC-SX-MMD", "serial": "AGM2101Z1KT"},
            {"name": "GigabitEthernet1/0/50 SFP", "description": "1000BaseSX SFP", "pid": "GLC-SX-MMD", "serial": "AGM2101Z1L0"},
            {"name": "Power Supply 1", "description": "250W AC", "pid": "PWR-C2-250WAC", "serial": "DCB2045R0AB"},
        ],
        "runningConfig": RUNNING_CONFIG.format(host=host, ip=ip),
        "logs": [
            {"ts": "14:32:10", "level": "ERROR", "source": "LINK", "message": "%LINK-3-UPDOWN: Interface GigabitEthernet1/0/24, changed state to down"},
            {"ts": "12:18:41", "level": "WARN", "source": "IF", "message": "GigabitEthernet1/0/3: CRC errors exceeding threshold (8/min)"},
            {"ts": "09:45:02", "level": "WARN", "source": "PM", "message": "%PM-4-ERR_DISABLE: bpduguard error detected on Gi1/0/20, putting Gi1/0/20 in err-disable state"},
            {"ts": "08:20:15", "level": "INFO", "source": "SYS", "message": "%SYS-5-RESTART: System restarted"},
            {"ts": "08:19:58", "level": "INFO", "source": "SNMP", "message": "%SNMP-5-COLDSTART: SNMP agent on host is undergoing a cold start"},
        ],
    }


def _bmc_server_details(kind, *, healthy=True):
    is_dell = kind == "iDRAC"
    return {
        "bmc": {
            "kind": kind, "version": "iDRAC9" if is_dell else "iLO 5",
            "ip": "10.10.1.22" if is_dell else "10.10.1.24", "firmware": "6.10.30.00" if is_dell else "2.78",
            "license": "Enterprise" if is_dell else "Advanced", "lifecycleController": "6.10.30.00" if is_dell else "—",
            "connected": True, "lastUpdated": "26 Jun 2025 11:42:15",
        },
        "health": {
            "overall": "ok" if healthy else "warning",
            "components": [
                {"name": "Power Supply", "status": "ok", "value": "2 / 2"}, {"name": "Fans", "status": "ok", "value": "6 / 6"},
                {"name": "Temperature", "status": "ok", "value": "Normal"}, {"name": "Storage", "status": "ok", "value": "OK"},
                {"name": "Memory", "status": "ok" if healthy else "warning", "value": "OK" if healthy else "1 DIMM corrected errors"},
                {"name": "Voltage", "status": "ok", "value": "OK"}, {"name": "Intrusion", "status": "ok", "value": "Normal"},
            ],
        },
        "temps": [
            {"sensor": "Inlet Temperature", "current": 24, "warn": 42}, {"sensor": "CPU1 Temperature", "current": 32, "warn": 85},
            {"sensor": "CPU2 Temperature", "current": 34, "warn": 85}, {"sensor": "System Board", "current": 28, "warn": 70},
            {"sensor": "PCH Temperature", "current": 45, "warn": 70}, {"sensor": "VRM Temperature", "current": 52, "warn": 90},
        ],
        "fans": [{"name": f"Fan {i}", "rpm": rpm, "status": "ok"} for i, rpm in enumerate([8400, 8200, 8600, 8400, 8200, 8400], 1)],
        "psus": [
            {"name": "PSU 1", "model": "Dell 750W" if is_dell else "HPE 800W FS Plat", "status": "ok", "inputV": 230, "outputW": 212, "capacityW": 750},
            {"name": "PSU 2", "model": "Dell 750W" if is_dell else "HPE 800W FS Plat", "status": "ok", "inputV": 229, "outputW": 208, "capacityW": 750},
        ],
        "voltages": [
            {"sensor": "12V", "current": 12.1, "min": 11.4, "max": 12.6}, {"sensor": "5V", "current": 5.0, "min": 4.8, "max": 5.2},
            {"sensor": "3.3V", "current": 3.3, "min": 3.1, "max": 3.5},
        ],
        "hwEvents": [
            {"ts": "2025-06-26 11:42:15", "severity": "info", "sensor": "System", "message": "System health restored"},
            {"ts": "2025-06-26 10:58:21", "severity": "warning", "sensor": "Inlet Temp", "message": "Inlet temperature high (42 °C)"},
            {"ts": "2025-06-26 09:18:44", "severity": "info", "sensor": "PSU 1", "message": "Power supply redundancy OK"},
            {"ts": "2025-06-26 08:44:12", "severity": "warning", "sensor": "Fan 2", "message": "Fan speed abnormal"},
            {"ts": "2025-06-26 07:15:33", "severity": "info", "sensor": kind, "message": f"{kind} login successful"},
        ],
        "cpu": {"model": "Intel Xeon Gold 6248R", "sockets": 2, "coresPerSocket": 24, "threads": 96, "baseGhz": 3.0},
        "dimms": [{"slot": f"A{i}", "sizeGb": 32, "type": "DDR4-2933 RDIMM", "status": "ok"} for i in range(1, 5)]
                 + [{"slot": f"B{i}", "sizeGb": 32, "type": "DDR4-2933 RDIMM", "status": "ok" if healthy or i != 2 else "warning"} for i in range(1, 5)],
        "storage": {
            "controller": "PERC H740P Mini" if is_dell else "Smart Array P408i-a",
            "virtualDisks": [{"name": "VD0", "raid": "RAID 10", "sizeTb": 2.4, "status": "ok"}],
            "physicalDisks": [{"slot": f"Disk {i}", "model": "1.2TB SAS SSD", "status": "ok", "wearPct": 4 + i} for i in range(4)],
            "filesystems": [
                {"mount": "/", "fs": "xfs", "sizeGb": 200, "usedGb": 74}, {"mount": "/data", "fs": "xfs", "sizeGb": 2000, "usedGb": 1180},
                {"mount": "/var/log", "fs": "xfs", "sizeGb": 100, "usedGb": 41},
            ],
        },
        "nics": [
            {"name": "eno1", "mac": "00:1B:44:11:3A:B7", "ip": "10.10.1.21", "speedGbps": 10, "status": "up", "inMbps": 410, "outMbps": 220},
            {"name": "eno2", "mac": "00:1B:44:11:3A:B8", "ip": "", "speedGbps": 10, "status": "up", "inMbps": 12, "outMbps": 9},
            {"name": "idrac" if is_dell else "ilo", "mac": "00:1B:44:11:3A:C0", "ip": "10.10.1.22" if is_dell else "10.10.1.24", "speedGbps": 1, "status": "up", "inMbps": 0.2, "outMbps": 0.1},
        ],
        "processes": [
            {"pid": 4412, "name": "java (nse-oms)", "user": "app", "cpu": 21.4, "memMb": 24576, "threads": 312},
            {"pid": 3120, "name": "nginx", "user": "nginx", "cpu": 2.2, "memMb": 140, "threads": 9},
            {"pid": 2710, "name": "mysqld", "user": "mysql", "cpu": 6.8, "memMb": 16384, "threads": 64},
            {"pid": 1020, "name": "node_exporter", "user": "prometheus", "cpu": 0.4, "memMb": 26, "threads": 8},
        ],
        "services": [
            {"name": "sshd", "port": 22, "status": "running", "description": "OpenSSH 8.0"},
            {"name": "nginx", "port": 443, "status": "running", "description": "nginx 1.20.1"},
            {"name": "mysqld", "port": 3306, "status": "running", "description": "MySQL 8.0"},
            {"name": "nse-oms", "port": 8443, "status": "running", "description": "NSE order management"},
            {"name": "node_exporter", "port": 9100, "status": "running", "description": "Prometheus metrics"},
        ],
        "alerts": [
            {"severity": "warning", "title": "Inlet temperature reached 42 °C", "since": "3h ago", "source": "Inlet Temp"},
            {"severity": "warning", "title": "Fan 2 speed abnormal", "since": "6h ago", "source": "Fan 2"},
            {"severity": "info", "title": "Firmware update available (6.10.80.00)", "since": "2d ago", "source": kind},
            {"severity": "critical" if not healthy else "info", "title": "Corrected memory errors on DIMM B2" if not healthy else "Lifecycle log rotated", "since": "1d ago", "source": "Memory"},
        ],
        "logs": [
            {"ts": "11:42:15", "level": "INFO", "source": "kernel", "message": "EDAC MC0: 0 CE memory read error on CPU_SrcID#0"},
            {"ts": "10:58:21", "level": "WARN", "source": "ipmi", "message": "Inlet Temp: upper non-critical going high (42 C)"},
            {"ts": "10:12:09", "level": "INFO", "source": "nse-oms", "message": "Order gateway session established (NSE)"},
        ],
        "config": {
            "BIOS version": "2.19.1", "Boot mode": "UEFI", "Secure boot": "Enabled", "Power profile": "Performance Per Watt (OS)",
            "Hyper-threading": "Enabled", "Virtualization (VT-x)": "Enabled", "NIC teaming": "bond0 (802.3ad)", "NTP": "10.10.1.5",
        },
    }


def seed_devices(sites):
    now = timezone.now()
    DeviceEvent.objects.all().delete()
    NetworkDevice.objects.all().delete()
    mum = sites["br-mum"]

    sw_alerts = [
        {"ts": "2025-09-26 14:32", "severity": "critical", "source": "Gi1/0/24", "message": "Link down"},
        {"ts": "2025-09-26 12:18", "severity": "warning", "source": "Gi1/0/3", "message": "High error rate (CRC)"},
        {"ts": "2025-09-26 09:45", "severity": "warning", "source": "Gi1/0/20", "message": "Port disabled (err-disable)"},
        {"ts": "2025-09-26 08:20", "severity": "info", "source": "System", "message": "Device rebooted"},
        {"ts": "2025-09-25 22:14", "severity": "warning", "source": "Gi1/0/1", "message": "High bandwidth usage (72%)"},
    ]
    specs = [
        dict(id="nce-sw-01", hostname="NCE-SW-01", device_type="switch", vendor="Cisco", model="Catalyst 2960-X", serial="FOC1234A0BC",
             ip="10.10.1.50", mgmt_ip="10.10.1.50", mac="00:1B:54:AA:BB:CC", os_type="IOS", os_version="15.2(4)E", site=mum,
             location="DC-Rack-01", role="Access Switch", contact="network@finspot.in", description="Core access switch for trading network",
             status="online", booted=timedelta(days=127, hours=6), cpu=12.4, mem=38.7, temp=36, onboarded=timedelta(days=400),
             details=_switch_details("NCE-SW-01", "10.10.1.50", _ports(
                 "nce", down=(3, 24, 28), disabled=(20,), unused=(46, 47, 48),
                 hot={1: (720, 540), 2: (680, 420), 10: (450, 320), 25: (380, 290)},
                 errors={1: (12, 5, 0), 2: (8, 3, 0), 3: (41, 2, 6), 10: (2, 1, 0), 25: (1, 0, 0)},
              ), sw_alerts),
             events=[(timedelta(hours=1), "critical", "Gi1/0/24", "Link down"), (timedelta(hours=3), "warning", "Gi1/0/3", "High error rate (CRC)")]),
        dict(id="bse-sw-01", hostname="BSE-SW-01", device_type="switch", vendor="Cisco", model="Catalyst 2960-X", serial="FOC2219X0QA",
             ip="10.20.1.11", mgmt_ip="10.20.1.11", mac="00:1B:54:AB:01:11", os_type="IOS", os_version="15.2(7)E8", site=mum,
             location="DC-Rack-04", role="Access Switch", contact="network@finspot.in", description="BSE trading floor access switch",
             status="online", booted=timedelta(days=36, hours=2), cpu=8.1, mem=31.0, temp=33, onboarded=timedelta(days=128),
             details=_switch_details("BSE-SW-01", "10.20.1.11", _ports("bse", unused=tuple(range(40, 49)), hot={1: (310, 240)}), []),
             events=[(timedelta(days=1), "info", "System", "Configuration saved")]),
        dict(id="nse-fw-01", hostname="NSE-FW-01", device_type="firewall", vendor="Fortinet", model="FortiGate 200F", serial="FG200FTK21900123",
             ip="10.10.0.1", mgmt_ip="10.10.0.1", mac="00:09:0F:09:00:01", os_type="FortiOS", os_version="7.2.8", site=mum,
             location="DC-Rack-01", role="Perimeter Firewall", contact="security@finspot.in", description="NSE segment perimeter firewall",
             status="online", booted=timedelta(days=88), cpu=23.0, mem=44.5, temp=41, onboarded=timedelta(days=129, hours=4),
             details=_switch_details("NSE-FW-01", "10.10.0.1", _ports("fw", unused=tuple(range(17, 49)), hot={1: (880, 610), 2: (640, 590)}), []),
             events=[(timedelta(hours=5), "warning", "System", "High session count: 9800")]),
        dict(id="nse-srv-01", hostname="NSE-SRV-01", device_type="server", vendor="Dell", model="PowerEdge R740", serial="7F3K9H2",
             ip="10.10.1.21", mgmt_ip="10.10.1.22", mac="00:1B:44:11:3A:B7", os_type="Linux", os_version="RHEL 8.8", site=mum,
             location="DC-Rack-02", role="Application Server", contact="infra@finspot.in", description="NSE trading application server - primary",
             status="online", booted=timedelta(days=45, hours=6), cpu=31.2, mem=62.0, temp=24, onboarded=timedelta(days=420),
             details=_bmc_server_details("iDRAC"),
             events=[(timedelta(hours=2), "info", "iDRAC", "System health restored"), (timedelta(hours=3), "warning", "Inlet Temp", "Inlet temperature high (42 °C)")]),
        dict(id="nse-srv-02", hostname="NSE-SRV-02", device_type="server", vendor="HPE", model="ProLiant DL380 Gen10", serial="CZJ1230ABX",
             ip="10.10.1.23", mgmt_ip="10.10.1.24", mac="94:40:C9:1A:2B:3C", os_type="Linux", os_version="RHEL 8.8", site=mum,
             location="DC-Rack-02", role="Application Server", contact="infra@finspot.in", description="NSE trading application server - secondary",
             status="online", booted=timedelta(days=12, hours=9), cpu=18.6, mem=48.2, temp=23, onboarded=timedelta(days=300),
             details=_bmc_server_details("iLO", healthy=False),
             events=[(timedelta(days=1), "critical", "Memory", "Corrected memory errors on DIMM B2")]),
        dict(id="nse-db-01", hostname="NSE-DB-01", device_type="database", vendor="Dell", model="PowerEdge R650", serial="9GK2LM1",
             ip="10.10.1.30", mgmt_ip=None, mac="00:1B:44:22:10:01", os_type="Linux", os_version="RHEL 8.8", site=mum,
             location="DC-Rack-03", role="Database Server", contact="dba@finspot.in", description="NSE order database",
             status="online", booted=timedelta(days=20), cpu=27.0, mem=71.0, temp=None, onboarded=timedelta(days=127, hours=4), details={}, events=[]),
        dict(id="mcx-app-01", hostname="MCX-APP-01", device_type="server", vendor="Dell", model="PowerEdge R640", serial="4HJ8QK2",
             ip="10.50.1.33", mgmt_ip=None, mac="00:1B:44:33:50:33", os_type="Linux", os_version="Ubuntu 22.04", site=mum,
             location="DC-Rack-05", role="Application Server", contact="infra@finspot.in", description="MCX commodity trading app",
             status="online", booted=timedelta(days=9), cpu=14.0, mem=40.0, temp=None, onboarded=timedelta(days=130, hours=13), details={}, events=[]),
        dict(id="dr-db-01", hostname="DR-DB-01", device_type="database", vendor="Dell", model="PowerEdge R650", serial="2PL0ZX9",
             ip="10.60.1.45", mgmt_ip=None, mac="00:1B:44:60:01:45", os_type="Linux", os_version="RHEL 8.8", site=sites["dc-blr-1"],
             location="DR Site", role="Database Server (DR)", contact="dba@finspot.in", description="DR replica of NSE-DB-01",
             status="offline", booted=None, cpu=None, mem=None, temp=None, onboarded=timedelta(days=131, hours=7), details={},
             events=[(timedelta(hours=7), "critical", "System", "Device unreachable (ICMP + SNMP)")]),
    ]

    simple = lambda alerts=(): {"alerts": list(alerts), "logs": [], "vlans": [], "neighbors": []}
    specs += [
        dict(id="nse-rtr-01", hostname="NSE-RTR-01", device_type="router", vendor="Cisco", model="ISR 4451", serial="FDO2231A1BC",
             ip="10.10.1.1", mgmt_ip="10.10.1.1", mac="00:1B:54:00:01:01", os_type="IOS-XE", os_version="17.6.4", site=mum,
             location="DC-Rack-01", role="WAN Edge Router", contact="network@finspot.in", description="Primary WAN edge for NSE leased lines",
             status="online", booted=timedelta(days=210), cpu=18.0, mem=41.0, temp=38, onboarded=timedelta(days=500),
             details=simple([{"ts": "2025-09-26 11:02", "severity": "warning", "source": "Gi0/0/1", "message": "BGP flap with ISP-2 (3 in 1h)"}]),
             events=[(timedelta(hours=2), "warning", "Gi0/0/1", "BGP neighbor 203.0.113.9 Down→Up")]),
        dict(id="lb-01", hostname="LB-01", device_type="load_balancer", vendor="F5", model="BIG-IP i5800", serial="f5-xqtz-1122",
             ip="10.10.1.80", mgmt_ip="10.10.1.81", mac="00:94:A1:00:80:01", os_type="TMOS", os_version="16.1.4", site=mum,
             location="DC-Rack-01", role="Application Load Balancer", contact="network@finspot.in", description="Front door for OMS/Order Gateway",
             status="online", booted=timedelta(days=96), cpu=27.0, mem=52.0, temp=35, onboarded=timedelta(days=480),
             details=simple(), events=[(timedelta(days=1), "info", "System", "Pool oms-pool member 10.10.1.21:8443 up")]),
        dict(id="wlc-01", hostname="WLC-01", device_type="wireless", vendor="Cisco", model="Catalyst 9800-40", serial="TTM2405Q0RS",
             ip="10.10.2.5", mgmt_ip="10.10.2.5", mac="00:1B:54:02:05:01", os_type="IOS-XE", os_version="17.9.4", site=mum,
             location="DC-Rack-03", role="Wireless LAN Controller", contact="network@finspot.in", description="Controller for 42 office APs",
             status="online", booted=timedelta(days=61), cpu=11.0, mem=37.0, temp=33, onboarded=timedelta(days=300),
             details=simple(), events=[(timedelta(hours=9), "info", "System", "AP-03 rejoined controller")]),
    ]

    for spec in specs:
        booted, events, onboarded = spec.pop("booted"), spec.pop("events"), spec.pop("onboarded")
        cpu, mem, temp = spec.pop("cpu"), spec.pop("mem"), spec.pop("temp")
        d = NetworkDevice.objects.create(
            booted_at=(now - booted) if booted else None, onboarded_at=now - onboarded,
            last_seen=now - timedelta(minutes=1) if spec["status"] == "online" else now - timedelta(hours=7),
            cpu_pct=cpu, mem_pct=mem, temp_c=temp, **spec,
        )
        DeviceEvent.objects.bulk_create([
            DeviceEvent(device=d, ts=now - ago, severity=sev, source=src, message=msg) for ago, sev, src, msg in events
        ])
    return NetworkDevice.objects.count()
