#!/usr/bin/env python3
"""Reads the Pterodactyl node and server state. Only safe GET requests."""
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
NODE_ID = int(os.environ.get("PROBE_NODE_ID", "1"))
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))


def get(path):
    request = urllib.request.Request(
        BASE + path,
        headers={
            "Authorization": "Bearer " + KEY,
            "Accept": "Application/vnd.pterodactyl.v1+json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()
    except Exception as error:  # noqa: BLE001
        return "ERR", str(error)[:200]


print("=== read-only requests ===")
for path in [
    f"/api/application/nodes/{NODE_ID}/system",
    f"/api/application/nodes/{NODE_ID}",
    f"/api/application/servers/{SERVER_ID}",
]:
    status, body = get(path)
    print("==", path, "->", status)
    if status == 200:
        try:
            parsed = json.loads(body)
            print(json.dumps(parsed, indent=1)[:2500])
        except Exception:
            print(body[:1500])
    else:
        print(body[:300])
    print()
