#!/usr/bin/env python3
"""Probes the Pterodactyl Application API for the build contract.

The script rebuilds a test server with different images, so it only prints
its plan unless --execute is given.
"""
import argparse
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

parser = argparse.ArgumentParser(description="Probe the build contract of a test server.")
parser.add_argument("server_id", nargs="?", type=int, default=int(os.environ.get("PROBE_SERVER_ID", "6")),
                    help="the id of the test server (default 6)")
parser.add_argument("--execute", action="store_true",
                    help="actually rebuild the server (the default only prints the plan)")
ARGS = parser.parse_args()


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + KEY,
            "Accept": "Application/vnd.pterodactyl.v1+json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()
    except Exception as error:  # noqa: BLE001
        return "ERR", str(error)[:200]


status, body = call("GET", "/api/application/nests/5/eggs/15")
if status != 200:
    print(f"cannot read the egg: {status} {str(body)[:200]}")
    print("Nothing was changed.")
    sys.exit(1)
egg = json.loads(body)["attributes"]
print("egg docker_images:", json.dumps(egg.get("docker_images"), indent=1)[:600])
print("egg config:", json.dumps(egg.get("config"), indent=1)[:800])
print()

sid = ARGS.server_id
status, body = call("GET", "/api/application/servers/%d" % sid)
if status != 200:
    print(f"cannot read server {sid}: {status} {str(body)[:200]}")
    print("Nothing was changed.")
    sys.exit(1)
srv = json.loads(body)["attributes"]
print("server image:", srv["container"]["image"])
print("server allocations:", srv["feature_limits"])
print()

images = egg.get("docker_images") or {}
candidate = list(images.values())[0] if images else srv["container"]["image"]


def payload(image, extra=None):
    body = {
        "name": srv["name"],
        "description": srv["description"],
        "user": srv["user"],
        "egg": srv["egg"],
        "docker_image": image,
        "startup": srv["container"]["startup_command"],
        "environment": srv["container"]["environment"],
        "limits": {
            "memory": srv["limits"]["memory"],
            "swap": srv["limits"]["swap"],
            "disk": srv["limits"]["disk"],
            "io": srv["limits"]["io"],
            "cpu": srv["limits"]["cpu"],
        },
        "feature_limits": {
            "databases": srv["feature_limits"]["databases"],
            "backups": srv["feature_limits"]["backups"],
        },
        "allocation": {
            "default": srv["allocation"],
            "allocations": [srv["allocation"]] if srv["allocation"] else [],
        },
        "image": image,
        "pull_image": True,
        "allow_failure": True,
    }
    if extra:
        body.update(extra)
    return body


print("\n=== what would change ===")
print(f"  rebuild server {sid} four times with a different image each time:")
print(f"    1. the current image ({srv['container']['image']})")
print(f"    2. the image of the egg ({candidate})")
print(f"    3. the current image, with rebuild_container")
print(f"    4. the current image, without pulling it")
print("  the server is rebuilt and restarted with every attempt")
if not ARGS.execute:
    print("\n=== result ===")
    print("nothing was changed (dry run)")
    print("To rebuild the server, re-run with --execute.")
    sys.exit(0)

for label, image, extra in [
    ("current image", srv["container"]["image"], None),
    ("egg image", candidate, None),
    ("current image + rebuild", srv["container"]["image"], {"rebuild_container": True}),
    ("current image, no pull", srv["container"]["image"], {"pull_image": False}),
]:
    status, body = call("PATCH", "/api/application/servers/%d/build" % sid, payload(image, extra))
    print("%-28s -> %s %s" % (label, status, body[:160].replace("\n", " ")))
