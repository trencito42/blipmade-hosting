#!/usr/bin/env python3
"""Creates the one server that the platform needs as the environment template
for the node.js egg.

The platform reads the default environment variables of an egg from an
existing server on that egg, because Pterodactyl 1.15 does not expose the
variables of an egg through the Application API. The panel refuses to create
a server without those variables, so the first server on the egg has to be
created by hand. This script does exactly that, and nothing else: it creates
one server, it never deletes one and it never touches an existing one.

The server is the infrastructure of the platform, it is named so, and it is
owned by the administrator account of the panel.

Usage:
    scripts/create-egg-template.py            # dry run, prints the plan
    scripts/create-egg-template.py --execute  # creates it
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")
EGG_ID = 15
OWNER_USER_ID = 1
NAME = "Blipmade runtime template (node.js generic)"
DESCRIPTION = (
    "The environment template of the node.js egg. The platform reads the "
    "default variables of the egg from a server that runs on it, so this "
    "server has to exist for a customer service to be provisioned."
)

# The variables the egg uses, taken from its startup command and from its
# installation script.
ENVIRONMENT = {
    "AUTO_UPDATE": "0",
    "NODE_PACKAGES": "",
    "UNNODE_PACKAGES": "",
    "MAIN_FILE": "index.js",
    "NODE_ARGS": "",
    "GIT_ADDRESS": "",
    "USERNAME": "",
    "ACCESS_TOKEN": "",
    "USER_UPLOAD": "0",
}


def api(method, path, body=None):
    url = f"{BASE}/api/application{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:500]
    except urllib.error.URLError as exc:
        print(f"the panel could not be reached: {exc.reason}", file=sys.stderr)
        sys.exit(1)


def find_free_allocation():
    status, data = api("GET", "/nodes/1/allocations?per_page=500")
    if status != 200:
        print(f"the allocations could not be read: HTTP {status}", file=sys.stderr)
        sys.exit(1)
    for entry in data.get("data", []):
        a = entry.get("attributes") or entry
        if not a.get("assigned"):
            return a
    print("the node has no free allocation left.", file=sys.stderr)
    sys.exit(1)


def find_egg():
    for nest_id in range(1, 12):
        status, data = api("GET", f"/nests/{nest_id}/eggs?per_page=100")
        if status != 200:
            continue
        for entry in data.get("data", []):
            a = entry.get("attributes") or entry
            if a.get("id") == EGG_ID:
                return a
    print(f"the egg {EGG_ID} is not on the panel.", file=sys.stderr)
    sys.exit(1)


def main():
    execute = "--execute" in sys.argv
    if not BASE or not KEY:
        print("PTERODACTYL_URL and PTERODACTYL_APP_KEY must be in the environment.",
              file=sys.stderr)
        sys.exit(1)

    # Is there already a server on this egg? Then nothing has to be created.
    status, data = api("GET", "/servers?per_page=100")
    servers = [(e.get("attributes") or e) for e in (data or {}).get("data", [])]
    same_egg = [s for s in servers if s.get("egg") == EGG_ID]
    if same_egg:
        print("a server already runs on this egg:")
        for s in same_egg:
            print(f"  id={s.get('id')} name={s.get('name')!r}")
        print("nothing has to be created.")
        return 0

    egg = find_egg()
    allocation = find_free_allocation()

    payload = {
        "name": NAME,
        "description": DESCRIPTION,
        "user": OWNER_USER_ID,
        "egg": EGG_ID,
        "docker_image": egg.get("docker_image"),
        "startup": egg.get("startup"),
        "environment": ENVIRONMENT,
        "limits": {"memory": 512, "swap": 0, "disk": 2048, "io": 500, "cpu": 100},
        "resource_limits": {"memory": 512, "swap": 0, "disk": 2048, "io": 500, "cpu": 100},
        "feature_limits": {"databases": 0, "backups": 0},
        "allocation": {"default": allocation.get("id"), "allocations": [allocation.get("id")]},
    }

    print("=== create-egg-template.py ===")
    print(f"mode      : {'EXECUTE - the server will be created' if execute else 'DRY RUN - nothing is created'}")
    print(f"egg       : {egg.get('name')} (id {EGG_ID})")
    print(f"image     : {egg.get('docker_image')}")
    print(f"allocation: id {allocation.get('id')} ({allocation.get('ip')}:{allocation.get('port')})")
    print(f"owner     : panel user {OWNER_USER_ID}")
    print(f"variables : {len(ENVIRONMENT)}")

    if not execute:
        print("\nTo create it: scripts/create-egg-template.py --execute")
        return 0

    status, data = api("POST", "/servers", payload)
    if status not in (200, 201):
        print(f"\nthe panel refused the creation: HTTP {status}")
        print(json.dumps(data, indent=1)[:1200] if isinstance(data, (dict, list)) else str(data)[:1200])
        return 1

    server = (data or {}).get("attributes") or {}
    print(f"\ncreated: id={server.get('id')} name={server.get('name')!r} "
          f"uuid={server.get('uuid')} allocation={server.get('allocation')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
