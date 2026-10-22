#!/usr/bin/env python3
"""Discover the payload schema of the panel's server sub-routes.

An empty payload makes the panel's validator answer with 422 and the list of
required fields, which is far more useful than the 500 the real payload
triggers. Only the Blipmade test server 6 is touched.

The reinstall probe can make the daemon reinstall the server, so the script
only prints its plan unless --execute is given.
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
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))

parser = argparse.ArgumentParser(description="Ask the panel which fields its server routes expect.")
parser.add_argument("--execute", action="store_true",
                    help="actually send the probe requests (the default only prints the plan)")
ARGS = parser.parse_args()


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
                return resp.status, raw[:900]
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:900]
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


def show(label, method, path, body):
    status, data = app_request(method, path, body)
    print(f"\n=== {label}: {method} {path} body={json.dumps(body)[:120]}")
    print(f"-> {status}")
    if isinstance(data, dict) and "errors" in data:
        for err in data["errors"]:
            meta = err.get("meta") or {}
            print(f"   - {meta.get('source_field', '?')}: {err.get('detail')} "
                  f"[{meta.get('rule', '')}]")
    else:
        print("   ", str(data)[:400])
    return status, data


print("\n=== what would change ===")
print(f"  send four empty requests against server {SERVER_ID} so the validator answers:")
print("    PATCH /build, PATCH /startup, PATCH /details, POST /reinstall")
print("  the reinstall probe can make the daemon reinstall the server")
if not ARGS.execute:
    print("\n=== result ===")
    print("nothing was sent (dry run)")
    print("To send the probe requests, re-run with --execute.")
    sys.exit(0)

show("build (empty)", "PATCH", f"/servers/{SERVER_ID}/build", {})
show("startup (empty)", "PATCH", f"/servers/{SERVER_ID}/startup", {})
show("details (empty)", "PATCH", f"/servers/{SERVER_ID}/details", {})
show("reinstall (empty)", "POST", f"/servers/{SERVER_ID}/reinstall", {})
