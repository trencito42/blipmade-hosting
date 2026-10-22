#!/usr/bin/env python3
"""Probes the Pterodactyl Application API for the build contract."""
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
egg = json.loads(body)["attributes"]
print("egg docker_images:", json.dumps(egg.get("docker_images"), indent=1)[:600])
print("egg config:", json.dumps(egg.get("config"), indent=1)[:800])
print()

sid = int(sys.argv[2]) if len(sys.argv) > 2 else 6
status, body = call("GET", "/api/application/servers/%d" % sid)
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


for label, image, extra in [
    ("current image", srv["container"]["image"], None),
    ("egg image", candidate, None),
    ("current image + rebuild", srv["container"]["image"], {"rebuild_container": True}),
    ("current image, no pull", srv["container"]["image"], {"pull_image": False}),
]:
    status, body = call("PATCH", "/api/application/servers/%d/build" % sid, payload(image, extra))
    print("%-28s -> %s %s" % (label, status, body[:160].replace("\n", " ")))
