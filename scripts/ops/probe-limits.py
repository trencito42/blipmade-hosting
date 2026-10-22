#!/usr/bin/env python3
"""Update a Blipmade test server's build limits and restart it.

Uses the payload schema the panel's own validator reports:
  PATCH /servers/{id}/build -> allocation, limits, feature_limits
and drives the container through the Client API with the saved panel session.

The script changes a server, so it only prints its plan unless --execute is
given.
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
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))
SERVER_UUID = os.environ.get("PROBE_SERVER_UUID", "")
HOST = os.environ.get("PROBE_HOST", "10.77.0.11")
PORT = int(os.environ.get("PROBE_PORT", "30002"))
DISK_MB = int(os.environ.get("PROBE_DISK_MB", "5120"))

parser = argparse.ArgumentParser(description="Change the build limits of a test server.")
parser.add_argument("--execute", action="store_true",
                    help="actually change the server (the default only prints the plan)")
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


def session_cookies():
    with open(COOKIE_FILE) as handle:
        data = json.load(handle)
    jar = {c["name"]: c["value"] for c in data["cookies"]}
    xsrf = jar.get("XSRF-TOKEN")
    return jar, urllib.parse.unquote(xsrf) if xsrf else None


def client_request(method, path, body=None):
    jar, xsrf = session_cookies()
    url = f"{BASE}/api/client{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in jar.items()))
    if data:
        req.add_header("Content-Type", "application/json")
    if xsrf:
        req.add_header("X-XSRF-TOKEN", xsrf)
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


status, data = app_request("GET", f"/servers/{SERVER_ID}")
if status != 200:
    print(f"cannot read server: {status}")
    sys.exit(1)
attrs = data["attributes"]
limits = attrs["limits"]
print(f"server {SERVER_ID}: limits={limits} allocation={attrs['allocation']}")

new_limits = {
    "memory": limits["memory"],
    "swap": limits["swap"],
    "disk": DISK_MB * 1024,
    "io": limits["io"],
    "cpu": limits["cpu"],
}

print("\n=== what would change ===")
print(f"  set the disk limit of server {SERVER_ID} to {DISK_MB} MB "
      f"(the memory, swap, io and cpu limits stay as they are)")
print("  power cycle the server and watch whether the port opens")
if not ARGS.execute:
    print("\n=== result ===")
    print("nothing was changed (dry run)")
    print("To change the server, re-run with --execute.")
    sys.exit(0)

print("\n=== PATCH /servers/{id}/build (panel schema: allocation, limits, feature_limits) ===")
status, data = app_request("PATCH", f"/servers/{SERVER_ID}/build", {
    "allocation": attrs["allocation"],
    "limits": new_limits,
    "feature_limits": {
        "databases": attrs["feature_limits"]["databases"],
        "backups": attrs["feature_limits"]["backups"],
    },
})
print(f"-> {status}: {str(data)[:500]}")

status, data = app_request("GET", f"/servers/{SERVER_ID}")
if status == 200:
    print("limits now:", data["attributes"]["limits"])

print("\n=== power cycle through the client API ===")
print("stop ->", client_request("POST", f"/servers/{SERVER_UUID}/power", {"signal": "stop"})[0])
time.sleep(4)
print("start ->", client_request("POST", f"/servers/{SERVER_UUID}/power", {"signal": "start"})[0])

print("\n=== poll ===")
for i in range(24):
    time.sleep(5)
    opened = port_open(HOST, PORT)
    status, res = client_request("GET", f"/servers/{SERVER_UUID}/resources")
    state = res.get("attributes", res) if isinstance(res, dict) else res
    print(f"t+{(i + 1) * 5:>3}s port_open={opened} state={json.dumps(state)[:200]}", flush=True)
    if opened:
        print("HTTP ->", http_get(HOST, PORT))
        break
