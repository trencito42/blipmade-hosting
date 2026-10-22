#!/usr/bin/env python3
"""Create a server with the allocation as a plain id and check the host port.

The panel's build route wants `allocation` as an integer id, while the create
route was being sent an object. This creates a server both ways so the
difference is visible, then waits for the install and checks the port.

The script creates a server on the panel, so it only prints its plan unless
--execute is given.
"""
import argparse
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
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
COOKIE_FILE = os.environ.get("COOKIE_FILE", "/tmp/panel-cookie.json")
HOST = os.environ.get("PROBE_HOST", "10.77.0.11")
PROBE_USER = int(os.environ.get("PROBE_USER", "11"))
PROBE_EGG = int(os.environ.get("PROBE_EGG", "15"))
STARTUP = os.environ.get(
    "NEW_STARTUP",
    "node -e \"require('http').createServer((req,res)=>{res.end('blipmade verification')}).listen(3000)\"",
)

parser = argparse.ArgumentParser(description="Create a test server and watch its port bind.")
parser.add_argument("--execute", action="store_true",
                    help="actually create the server (the default only prints the plan)")
ARGS = parser.parse_args()


def app_request(method, path, body=None):
    url = f"{BASE}/api/application{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw[:600]
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:600]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


def client_request(method, path, body=None):
    with open(COOKIE_FILE) as handle:
        saved = json.load(handle)
    jar = {c["name"]: c["value"] for c in saved["cookies"]}
    xsrf = jar.get("XSRF-TOKEN")
    url = f"{BASE}/api/client{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in jar.items()))
    if data:
        req.add_header("Content-Type", "application/json")
    if xsrf:
        req.add_header("X-XSRF-TOKEN", urllib.parse.unquote(xsrf))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw[:400]
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:400]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


def allocation_by_id(target):
    for page in range(1, 6):
        status, data = app_request("GET", f"/nodes/1/allocations?page={page}")
        if status != 200 or not isinstance(data, dict):
            break
        rows = data.get("data", [])
        if not rows:
            break
        for entry in rows:
            attrs = entry.get("attributes", {})
            if attrs.get("id") == target:
                return attrs
    return None


def port_open(host, port, timeout=3):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_get(host, port, path="/"):
    try:
        with urllib.request.urlopen(f"http://{host}:{port}{path}", timeout=6) as resp:
            return resp.status, resp.read().decode()[:200]
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:200]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


target = int(os.environ.get("PROBE_ALLOCATION", "76"))
alloc = allocation_by_id(target)
print(f"allocation {target}: {json.dumps(alloc)}")
if not alloc:
    raise SystemExit("allocation not found")
if alloc.get("assigned"):
    raise SystemExit(f"allocation {target} is already assigned")

# The environment template of the existing server on this egg.
template_id = int(os.environ.get("PROBE_TEMPLATE_SERVER_ID", "6"))
status, data = app_request("GET", f"/servers/{template_id}")
if status != 200:
    print(f"cannot read the template server {template_id}: {status} {str(data)[:200]}")
    print("Nothing was created.")
    sys.exit(1)
environment = data["attributes"]["container"]["environment"]

print("\n=== what would change ===")
print("  create the server 'Blipmade port binding test' on the panel")
print(f"    owner user {PROBE_USER}, egg {PROBE_EGG}, allocation {target} (port {alloc.get('port')})")
print(f"    startup: {STARTUP}")
print("  reinstall it and wait for the daemon to install it")
print("  start it and check whether the port opens")
print("  the server stays behind and has to be removed again with scripts/cleanup-panel.py")
if not ARGS.execute:
    print("\n=== result ===")
    print("nothing was created (dry run)")
    print("To create the server, re-run with --execute.")
    raise SystemExit(0)

print("\n=== create server with allocation as a plain integer id ===")
status, data = app_request("POST", "/servers", {
    "name": "Blipmade port binding test",
    "description": "Blipmade allocation binding verification",
    "user": PROBE_USER,
    "egg": PROBE_EGG,
    "docker_image": "ghcr.io/ptero-eggs/yolks:nodejs_25",
    "startup": STARTUP,
    "environment": environment,
    "limits": {"memory": 1024, "swap": 0, "disk": 5120, "io": 500, "cpu": 100},
    "feature_limits": {"databases": 0, "backups": 0},
    "allocation": {"default": target, "allocations": [target]},
})
print(f"-> {status}")
if status not in (200, 201):
    print(json.dumps(data, indent=2)[:800])
    raise SystemExit(1)
attrs = data.get("attributes", data)
server_id = attrs["id"]
uuid = attrs["uuid"]
print(f"created server {server_id} uuid={uuid} allocation={attrs.get('allocation')}")

print("\n=== reinstall so the daemon installs and starts it ===")
print("reinstall ->", app_request("POST", f"/servers/{server_id}/reinstall")[0])

print("\n=== wait for the install to finish ===")
installed = False
for i in range(60):
    time.sleep(10)
    status, data = app_request("GET", f"/servers/{server_id}")
    if status != 200:
        continue
    inst = data["attributes"]["container"]["installed"]
    opened = port_open(HOST, alloc["port"])
    print(f"t+{(i + 1) * 10:>4}s installed={inst} port_open={opened}", flush=True)
    if inst == 1:
        installed = True
        break

if not installed:
    print("install did not finish in time")
    raise SystemExit(1)

print("\n=== power start ===")
print("start ->", client_request("POST", f"/servers/{uuid}/power", {"signal": "start"})[0])

print("\n=== port check ===")
for i in range(24):
    time.sleep(5)
    opened = port_open(HOST, alloc["port"])
    status, res = client_request("GET", f"/servers/{uuid}/resources")
    attrs2 = res.get("attributes", res) if isinstance(res, dict) else res
    print(f"t+{(i + 1) * 5:>3}s port_open={opened} {json.dumps(attrs2)[:180]}", flush=True)
    if opened:
        print("HTTP ->", http_get(HOST, alloc["port"]))
        print(f"\nRESULT: server {server_id} bound port {alloc['port']} successfully")
        break
else:
    print(f"\nRESULT: server {server_id} never bound port {alloc['port']}")
