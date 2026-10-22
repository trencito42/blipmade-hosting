#!/usr/bin/env python3
"""List the panel servers and users so the test artifacts can be identified."""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")


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
