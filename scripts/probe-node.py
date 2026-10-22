#!/usr/bin/env python3
"""Reads the Pterodactyl node and server state. Only safe GET requests."""
import json
import sys
import urllib.error
import urllib.request

ENV = {}
with open(sys.argv[1] if len(sys.argv) > 1 else ".env") as handle:
    for line in handle:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        ENV[key.strip()] = value.strip().strip("'\"")
BASE = ENV["PTERODACTYL_URL"]
KEY = ENV["PTERODACTYL_APP_KEY"]


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


for path in [
    "/api/application/nodes/1/system",
    "/api/application/nodes/1",
    "/api/application/servers/6",
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
