#!/usr/bin/env python3
"""Remove the test artifacts that were created while verifying the platform.

The guards are deliberate: the protected server, its owner and the existing
administrators are never touched, and only servers that were created by the
verification runs are removed.
"""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")

# The server that must survive every cleanup run.
PROTECTED_SERVER_ID = 2
PROTECTED_SERVER_UUID = "aec52a41-0445-4c03-bab9-82f1af8ed621"
# Administrators that existed before the platform was connected.
PROTECTED_USER_IDS = {1, 2, 3, 4}
# Only accounts of the verification domain are removed.
TEST_EMAIL_SUFFIX = "@blipmade.test"
TEST_SERVER_NAMES = {"Nginx verification", "Blipmade port binding test"}

DRY_RUN = os.environ.get("CLEANUP_DRY_RUN") == "1"


def request(method, path, body=None):
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
                return resp.status, json.loads(raw) if raw else None
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


def main() -> int:
    status, data = request("GET", "/servers?per_page=100")
    if status != 200:
        print(f"cannot read servers: {status} {data}")
        return 1

    servers = [entry["attributes"] for entry in data.get("data", [])]
    removable = [
        server for server in servers
        if server["id"] != PROTECTED_SERVER_ID
        and server["uuid"] != PROTECTED_SERVER_UUID
        and server["name"] in TEST_SERVER_NAMES
    ]
    keep = [server["id"] for server in servers if server not in removable]

    print("servers to remove:", [f"{s['id']} ({s['name']})" for s in removable])
    print("servers to keep   :", keep)

    for server in removable:
        if DRY_RUN:
            continue
        status, body = request("DELETE", f"/servers/{server['id']}")
        print(f"  delete server {server['id']} -> {status} {str(body)[:160]}")

    status, data = request("GET", "/users?per_page=100")
    if status != 200:
        print(f"cannot read users: {status}")
        return 1

    users = [entry["attributes"] for entry in data.get("data", [])]
    removable_users = [
        user for user in users
        if user["id"] not in PROTECTED_USER_IDS
        and user["email"].endswith(TEST_EMAIL_SUFFIX)
    ]
    print("users to remove:", [f"{u['id']} ({u['email']})" for u in removable_users])
    print("users to keep   :", [u["id"] for u in users if u not in removable_users])

    for user in removable_users:
        if DRY_RUN:
            continue
        status, body = request("DELETE", f"/users/{user['id']}")
        print(f"  delete user {user['id']} -> {status} {str(body)[:160]}")

    # Prove the protected server is still there.
    status, body = request("GET", f"/servers/{PROTECTED_SERVER_ID}")
    if status == 200:
        attrs = body["attributes"]
        print(f"\nprotected server {PROTECTED_SERVER_ID}: name={attrs['name']!r} "
              f"uuid={attrs['uuid']} installed={attrs['container']['installed']} "
              f"allocation={attrs['allocation']}")
    else:
        print(f"\nWARNING: protected server could not be read: {status} {body}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
