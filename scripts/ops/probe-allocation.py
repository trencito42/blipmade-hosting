#!/usr/bin/env python3
"""Inspect the allocation attached to a server and probe every plausible address.

Read-only: it only sends GET requests and opens TCP connections.
"""
import json
import os
import socket
import sys
import urllib.error
import urllib.request


def require_env(name, purpose):
    """Read a credential from the environment or stop with a clear message."""
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"error: {name} is not set ({purpose}).", file=sys.stderr)
        print("Nothing was read and nothing was changed.", file=sys.stderr)
        raise SystemExit(1)
    return value


BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = require_env("PTERODACTYL_APP_KEY", "the panel Application API key")
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))
NODE_ID = int(os.environ.get("PROBE_NODE_ID", "1"))
RELEVANT_ALLOCATIONS = [
    int(value) for value in os.environ.get("PROBE_ALLOCATIONS", "73,74,75,76").split(",") if value.strip()
]

CANDIDATES = [
    ("10.77.0.11", 30002),
    ("193.34.214.87", 30002),
    ("node1.blipmade.com", 30002),
    ("10.77.0.13", 30002),
]


def app_get(path):
    req = urllib.request.Request(f"{BASE}/api/application{path}")
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:400]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


status, data = app_get(f"/servers/{SERVER_ID}")
print(f"server -> {status}")
if status == 200:
    attrs = data["attributes"]
    print("  allocation id:", attrs["allocation"], "| node:", attrs["node"])
    print("  container.installed:", attrs["container"]["installed"])
    print("  startup:", attrs["container"]["startup_command"])

print(f"\n=== allocations on node {NODE_ID} ===")
for path in [f"/nodes/{NODE_ID}/allocations", f"/allocations?node={NODE_ID}"]:
    status, data = app_get(path)
    print(f"GET {path} -> {status}")
    if status == 200 and isinstance(data, dict) and data.get("data"):
        rows = []
        for entry in data["data"]:
            a = entry.get("attributes", {})
            rows.append(a)
        hit = [r for r in rows if r.get("id") in RELEVANT_ALLOCATIONS]
        print(f"  {len(rows)} allocations; relevant: {json.dumps(hit)[:1200]}")
        if rows:
            print("  sample:", json.dumps(rows[0])[:400])
        break

print("\n=== port probes ===")
for host, port in CANDIDATES:
    try:
        with socket.create_connection((host, port), timeout=5):
            print(f"  {host}:{port} -> OPEN")
            try:
                with urllib.request.urlopen(f"http://{host}:{port}/", timeout=6) as resp:
                    print(f"    http {resp.status}: {resp.read().decode()[:200]}")
            except urllib.error.HTTPError as exc:
                print(f"    http {exc.code}: {exc.read().decode()[:200]}")
            except Exception as exc:  # noqa: BLE001
                print(f"    http error: {exc}")
    except OSError as exc:
        print(f"  {host}:{port} -> {exc}")
