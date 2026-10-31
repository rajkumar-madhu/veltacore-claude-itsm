"""Device lifecycle actions and network discovery.

Discovery is a real TCP connect check against a fixed list of common
service ports (no payloads, no UDP/SNMP), limited to private, loopback and
link-local addresses so the API can't be used to probe the internet.
Power and port actions only change Argus's own records — there is no live
iDRAC/iLO or switch CLI connection behind them.
"""
import ipaddress
import socket
import time
from concurrent.futures import ThreadPoolExecutor

from django.db import transaction
from django.utils import timezone

from .models import DeviceEvent, NetworkDevice
from .serializers import DeviceEditSerializer


class ActionError(Exception):
    pass


PORTS = [
    (22, "SSH", "Secure Shell"), (23, "Telnet", "Telnet (insecure)"), (80, "HTTP", "Web Server"),
    (443, "HTTPS", "Secure Web Server"), (3306, "MySQL", "Database Server"), (5432, "PostgreSQL", "Database Server"),
    (6379, "Redis", "Cache"), (5672, "AMQP", "Message Broker"), (8080, "HTTP-Alt", "Web / App Server"),
    (8443, "HTTPS-Alt", "Secure App Server"), (9090, "Prometheus", "Metrics Server"),
    (9100, "Node Exporter", "Prometheus Metrics"), (3389, "RDP", "Remote Desktop"), (27017, "MongoDB", "Database Server"),
]
CONNECT_TIMEOUT = 0.6


def _probe(ip, port):
    start = time.monotonic()
    try:
        with socket.create_connection((ip, port), timeout=CONNECT_TIMEOUT) as s:
            latency = round((time.monotonic() - start) * 1000, 1)
            banner = ""
            if port == 22:
                s.settimeout(0.5)
                try:
                    banner = s.recv(128).decode("ascii", "replace").strip()
                except OSError:
                    pass
            return port, True, latency, banner
    except OSError:
        return port, False, None, ""


def discover(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        raise ActionError("Enter a valid IP address.")
    if not (ip.is_private or ip.is_loopback or ip.is_link_local):
        raise ActionError("Discovery is limited to private, loopback and link-local addresses.")

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=len(PORTS)) as pool:
        results = list(pool.map(lambda p: _probe(str(ip), p[0]), PORTS))
    try:
        rdns = socket.gethostbyaddr(str(ip))[0]
    except OSError:
        rdns = None

    services = []
    for (port, name, desc), (_, is_open, latency, banner) in zip(PORTS, results):
        if is_open:
            services.append({"service": name, "port": port, "status": "open", "latencyMs": latency,
                             "version": banner or None, "description": desc})
    return {
        "ip": str(ip),
        "reachable": bool(services),
        "reverseDns": rdns,
        "portsScanned": len(PORTS),
        "services": services,
        "durationMs": round((time.monotonic() - started) * 1000),
        "discoveredAt": timezone.now().isoformat(),
        "method": "TCP connect scan",
    }


def _event(device, message, severity="info", source="System"):
    DeviceEvent.objects.create(device=device, ts=timezone.now(), severity=severity, source=source, message=message)


def _record_discovery(d, result):
    d.last_seen = timezone.now() if result["reachable"] else d.last_seen
    d.details = {**d.details, "lastDiscovery": result}
    d.save(update_fields=["last_seen", "details"])
    found = ", ".join(f"{s['service']}/{s['port']}" for s in result["services"]) or "no open ports"
    _event(d, f"Discovery completed: {found}", "info" if result["reachable"] else "warning")
    return f"Discovery finished in {result['durationMs']} ms — {found}"


def _edit(d, payload):
    s = DeviceEditSerializer(data=payload)
    if not s.is_valid():
        field, errors = next(iter(s.errors.items()))
        raise ActionError(f"{field}: {errors[0]}")
    for k, v in s.validated_data.items():
        setattr(d, k, v)
    d.save(update_fields=list(s.validated_data))
    _event(d, "Device details updated")
    return "Device updated"


def _set_port(d, payload):
    ports = d.details.get("ports")
    if d.device_type not in ("switch", "router", "firewall") or not ports:
        raise ActionError("This device has no manageable ports.")
    name, enabled = payload.get("port"), payload.get("enabled")
    if not isinstance(enabled, bool):
        raise ActionError("'enabled' must be true or false.")
    port = next((p for p in ports if p["name"] == name), None)
    if port is None:
        raise ActionError(f"Unknown port {name}.")
    if enabled and port["status"] == "disabled":
        port["status"], port["inMbps"], port["outMbps"] = "down", 0, 0
        msg = f"Port {name} enabled (no shutdown)"
    elif not enabled and port["status"] != "disabled":
        port["status"], port["inMbps"], port["outMbps"] = "disabled", 0, 0
        msg = f"Port {name} administratively disabled (shutdown)"
    else:
        return f"Port {name} already {'enabled' if enabled else 'disabled'}"
    d.save(update_fields=["details"])
    _event(d, msg, "warning" if not enabled else "info", name)
    return msg


BMC_POWER = {
    "power_on": ({"offline"}, "online", "Server powered on"),
    "graceful_shutdown": ({"online"}, "offline", "Graceful shutdown requested (ACPI)"),
    "force_off": ({"online"}, "offline", "Server forced power off"),
}


def _bmc_power(d, action):
    if not d.details.get("bmc"):
        raise ActionError("This device has no iDRAC/iLO configured.")
    allowed, to_status, message = BMC_POWER[action]
    if d.status not in allowed:
        raise ActionError(f"Cannot {action.replace('_', ' ')}: server is {d.status}.")
    d.status = to_status
    d.booted_at = timezone.now() if to_status == "online" else None
    d.save(update_fields=["status", "booted_at"])
    _event(d, message, "warning" if action == "force_off" else "info", d.details["bmc"]["kind"])
    return message


HANDLERS = {"edit": _edit, "set_port": _set_port}


def perform(device_id, action, payload):
    if action == "run_discovery":
        # scan first, without holding a row lock for the ~1s of network I/O
        target = NetworkDevice.objects.values_list("mgmt_ip", "ip").get(pk=device_id)
        result = discover(target[0] or target[1])
        with transaction.atomic():
            return _record_discovery(NetworkDevice.objects.select_for_update().get(pk=device_id), result)
    with transaction.atomic():
        d = NetworkDevice.objects.select_for_update().get(pk=device_id)
        if action in BMC_POWER:
            return _bmc_power(d, action)
        if action in HANDLERS:
            return HANDLERS[action](d, payload)
    raise ActionError(f"Unknown action '{action}'.")


def check_endpoint(endpoint):
    """TCP connect to an exporter's host:port. Same private-range guard as discovery."""
    host, sep, port_s = endpoint.rpartition(":")
    if not sep or not port_s.isdigit() or not (0 < int(port_s) < 65536) or not host:
        raise ActionError("Endpoint must look like host:port.")
    try:
        infos = socket.getaddrinfo(host.strip("[]"), int(port_s), proto=socket.IPPROTO_TCP)
    except OSError:
        return False, None, f"Cannot resolve {host}"
    ip = ipaddress.ip_address(infos[0][4][0])
    if not (ip.is_private or ip.is_loopback or ip.is_link_local):
        raise ActionError("Only private, loopback and link-local endpoints can be tested.")
    _, ok, latency, _ = _probe(str(ip), int(port_s))
    return ok, latency, None if ok else f"No response on {ip}:{port_s}"
