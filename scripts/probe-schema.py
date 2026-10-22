#!/usr/bin/env python3
"""Discover the payload schema of the panel's server sub-routes.

An empty payload makes the panel's validator answer with 422 and the list of
required fields, which is far more useful than the 500 the real payload
triggers. Only the Blipmade test server 6 is touched.
"""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))


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


show("build (empty)", "PATCH", f"/servers/{SERVER_ID}/build", {})
show("startup (empty)", "PATCH", f"/servers/{SERVER_ID}/startup", {})
show("details (empty)", "PATCH", f"/servers/{SERVER_ID}/details", {})
show("reinstall (empty)", "POST", f"/servers/{SERVER_ID}/reinstall", {})
