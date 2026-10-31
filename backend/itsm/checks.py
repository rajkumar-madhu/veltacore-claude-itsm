"""Real reachability checks for uptime monitors, integrations and runbooks.

HTTP checks may target private or public hosts (checking internal URLs is the
point of a URL checker) but never link-local addresses such as cloud metadata
endpoints, and only http/https URLs are allowed.
"""
import ipaddress
import socket
import ssl
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class CheckError(Exception):
    pass


def _guard_host(host):
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        raise CheckError(f"Cannot resolve {host}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            raise CheckError(f"{host} resolves to a blocked address ({ip}).")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # report the 3xx itself
        return None


def http_check(url, expected_status=200, timeout=5):
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise CheckError("URL must start with http:// or https://")
    _guard_host(parts.hostname)
    opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Argus-URL-Checker/1.0"})
    start = time.monotonic()
    try:
        with opener.open(req, timeout=timeout) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    except (urllib.error.URLError, OSError) as e:
        reason = getattr(e, "reason", e)
        return {"ok": False, "ms": None, "code": None, "error": str(reason)[:200]}
    ms = round((time.monotonic() - start) * 1000, 1)
    ok = code == expected_status
    return {"ok": ok, "ms": ms, "code": code, "error": "" if ok else f"HTTP {code} (expected {expected_status})"}


def tcp_check(target, timeout=5):
    host, sep, port = target.rpartition(":")
    host = host.strip("[]")
    if not sep or not port.isdigit() or not 0 < int(port) < 65536 or not host:
        raise CheckError("Target must be host:port")
    _guard_host(host)
    start = time.monotonic()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return {"ok": True, "ms": round((time.monotonic() - start) * 1000, 1), "code": None, "error": ""}
    except OSError as e:
        return {"ok": False, "ms": None, "code": None, "error": (str(e) or "connection failed")[:200]}
