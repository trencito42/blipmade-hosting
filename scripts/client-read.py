#!/usr/bin/env python3
"""Read a server's runtime details through the panel's Client API.

Reuses the session cookie captured from a real browser login, so no
reCAPTCHA interaction is needed while the panel is rate limiting.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
COOKIE_FILE = os.environ.get("COOKIE_FILE", "/tmp/panel-cookie.json")
SERVER_UUID = os.environ.get("PROBE_SERVER_UUID", "")


def load_cookies():
    with open(COOKIE_FILE) as handle:
        data = json.load(handle)
    jar = {}
    xsrf = None
    for cookie in data["cookies"]:
        jar[cookie["name"]] = cookie["value"]
        if cookie["name"] == "XSRF-TOKEN":
            xsrf = cookie["value"]
    return jar, xsrf


def client_get(path):
    jar, xsrf = load_cookies()
    req = urllib.request.Request(f"{BASE}/api/client{path}")
    req.add_header("Accept", "application/json")
    req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in jar.items()))
    if xsrf:
        req.add_header("X-XSRF-TOKEN", urllib.parse.unquote(xsrf))
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
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


status, account = client_get("/account")
print(f"GET /api/client/account -> {status}")
if status != 200:
    print(json.dumps(account)[:400])
    sys.exit(1)
attrs = account.get("attributes", account)
print("authenticated as:", attrs.get("email"), "| root_admin:", attrs.get("root_admin"))

status, server = client_get(f"/servers/{SERVER_UUID}")
print(f"\nGET /servers/{SERVER_UUID} -> {status}")
if status != 200:
    print(json.dumps(server)[:400])
    sys.exit(1)
s = server.get("attributes", server)
print(json.dumps({
    "name": s.get("name"),
    "state": s.get("state"),
    "is_suspended": s.get("is_suspended"),
    "invocation": s.get("invocation"),
    "docker_image": s.get("docker_image"),
    "allocation": s.get("allocation"),
    "sftp_details": s.get("sftp_details"),
    "utilization": s.get("utilization"),
    "environment": s.get("environment"),
    "limits": s.get("limits"),
    "feature_limits": s.get("feature_limits"),
    "installed": s.get("installed"),
}, indent=2))

status, res = client_get(f"/servers/{SERVER_UUID}/resources")
print(f"\nGET /resources -> {status}")
print(json.dumps(res, indent=2)[:900])
