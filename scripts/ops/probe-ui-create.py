#!/usr/bin/env python3
"""Find how the panel's own interface creates a server.

The front-end bundle shows which API the interface calls, which is what makes
a working server different from one created through the Application API.

Read-only: it only downloads the public login page and its bundle.
"""
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("PTERODACTYL_URL", "https://panel.blipmade.com").rstrip("/")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        print(f"error: {url} answered HTTP {exc.code}.")
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {url} could not be read: {type(exc).__name__}: {exc}")
        print("The panel is unreachable from here; nothing was changed.")
        sys.exit(1)


html = fetch(f"{BASE}/auth/login")
srcs = re.findall(r'<script[^>]+src="([^"]+)"', html)
if not srcs:
    print("error: the login page does not reference a bundle.")
    sys.exit(1)
body = fetch(f"{BASE}{srcs[0]}")
print(f"bundle: {srcs[0]} ({len(body)} bytes)")

print("\n=== api paths used by the interface ===")
paths = sorted(set(re.findall(r"/api/(?:client|application)/[A-Za-z0-9_\-/{}$.?=]*", body)))
for path in paths:
    print("  ", path)

print("\n=== create / install / deploy wording ===")
for keyword in ("api/client/servers", "api/application/servers", "install", "deployment",
                "eggId", "egg_id", "allocation"):
    for match in list(re.finditer(re.escape(keyword), body))[:3]:
        start = max(0, match.start() - 130)
        print(f"  [{keyword}] ...{body[start:match.start() + 130]}...")
