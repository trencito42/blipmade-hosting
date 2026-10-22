#!/usr/bin/env python3
"""Inspect the allocation attached to a server and probe every plausible address."""
import json
import os
import socket
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))

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

print("\n=== allocations on node 1 ===")
for path in ["/nodes/1/allocations", "/allocations?node=1"]:
    status, data = app_get(path)
    print(f"GET {path} -> {status}")
    if status == 200 and isinstance(data, dict) and data.get("data"):
        rows = []
        for entry in data["data"]:
            a = entry.get("attributes", {})
            rows.append(a)
        hit = [r for r in rows if r.get("id") in (73, 74, 75, 76)]
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
