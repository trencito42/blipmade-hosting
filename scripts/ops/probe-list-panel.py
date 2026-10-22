#!/usr/bin/env python3
"""List the panel servers and users so the test artifacts can be identified.

Read-only: it only sends GET requests.
"""
import json
import os
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


def get(path):
    req = urllib.request.Request(f"{BASE}/api/application{path}")
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:300]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


status, data = get("/servers?per_page=100")
print(f"=== servers -> {status} ===")
if status == 200:
    for entry in data.get("data", []):
        a = entry["attributes"]
        print(f"  id={a['id']:>3} user={a['user']:>3} alloc={a['allocation']} "
              f"installed={a['container']['installed']} name={a['name']!r} uuid={a['uuid']}")

status, data = get("/users?per_page=100")
print(f"\n=== users -> {status} ===")
if status == 200:
    for entry in data.get("data", []):
        a = entry["attributes"]
        print(f"  id={a['id']:>3} root={str(a['root_admin']):>5} email={a['email']:<40} username={a['username']}")
