#!/usr/bin/env python3
"""Watch a Blipmade test server's install progress for a while."""
import json
import os
import socket
import time
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
KEY = os.environ.get("PTERODACTYL_APP_KEY", "")
SERVER_ID = int(os.environ.get("PROBE_SERVER_ID", "6"))
HOST = os.environ.get("PROBE_HOST", "10.77.0.11")
PORT = int(os.environ.get("PROBE_PORT", "30002"))
MINUTES = float(os.environ.get("PROBE_MINUTES", "12"))


def state():
    req = urllib.request.Request(f"{BASE}/api/application/servers/{SERVER_ID}")
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            attrs = data.get("attributes", {})
            cont = attrs.get("container") or {}
            return {
                "installed": cont.get("installed"),
                "image": cont.get("image"),
                "updated_at": attrs.get("updated_at"),
                "allocation": attrs.get("allocation"),
            }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def port_open():
    try:
        with socket.create_connection((HOST, PORT), timeout=2):
            return True
    except OSError:
        return False


deadline = time.time() + MINUTES * 60
last = None
while time.time() < deadline:
    s = state()
    p = port_open()
    marker = json.dumps(s, sort_keys=True)
    if marker != last:
        print(f"[{time.strftime('%H:%M:%S')}] {marker} port_open={p}", flush=True)
        last = marker
    if p:
        try:
            with urllib.request.urlopen(f"http://{HOST}:{PORT}/", timeout=5) as resp:
                print("HTTP RESPONSE:", resp.status, resp.read().decode()[:200], flush=True)
        except Exception as exc:  # noqa: BLE001
            print("HTTP ERROR:", exc, flush=True)
        break
    time.sleep(10)
print("watch finished", flush=True)
