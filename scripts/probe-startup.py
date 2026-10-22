#!/usr/bin/env python3
"""Try a different startup command on a Blipmade test server.

The panel splits server updates into details, build and startup. This uses the
startup route with the schema the panel's validator reports, reinstalls the
server and watches the daemon's reported state.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")
COOKIE_FILE = os.environ.get("COOKIE_FILE", "/tmp/panel-cookie.json")
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))
SERVER_UUID = os.environ.get("PROBE_SERVER_UUID", "")
STARTUP = os.environ.get("NEW_STARTUP", "sleep infinity")
WAIT = int(os.environ.get("WAIT_SECONDS", "60"))


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


status, data = app_request("GET", f"/servers/{SERVER_ID}")
if status != 200:
    print(f"cannot read server: {status}")
    sys.exit(1)
attrs = data["attributes"]
container = attrs["container"]
print(f"server {SERVER_ID} current startup: {container['startup_command']!r}")

print(f"\n=== PATCH /servers/{SERVER_ID}/startup -> {STARTUP!r} ===")
status, data = app_request("PATCH", f"/servers/{SERVER_ID}/startup", {
    "startup": STARTUP,
    "environment": container["environment"],
    "egg": attrs["egg"],
    "image": container["image"],
    "skip_scripts": container.get("skip_scripts", False),
})
print(f"-> {status}: {str(data)[:400]}")

if status != 200:
    sys.exit(1)

status, data = app_request("GET", f"/servers/{SERVER_ID}")
print("stored startup now:", data["attributes"]["container"]["startup_command"])

print("\n=== reinstall + power cycle ===")
print("reinstall ->", app_request("POST", f"/servers/{SERVER_ID}/reinstall")[0])
time.sleep(6)
print("stop ->", client_request("POST", f"/servers/{SERVER_UUID}/power", {"signal": "stop"})[0])
time.sleep(4)
print("start ->", client_request("POST", f"/servers/{SERVER_UUID}/power", {"signal": "start"})[0])

print("\n=== watch ===")
for i in range(WAIT // 5):
    time.sleep(5)
    status, res = client_request("GET", f"/servers/{SERVER_UUID}/resources")
    attrs2 = res.get("attributes", res) if isinstance(res, dict) else res
    print(f"t+{(i + 1) * 5:>3}s {json.dumps(attrs2)[:220]}", flush=True)
