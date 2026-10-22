#!/usr/bin/env python3
"""List every HTTP call the panel interface makes, with its method and path.

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

print("=== axios calls with a literal path ===")
calls = sorted(set(re.findall(r"\.(post|put|patch|delete|get)\(\s*[\"'`](/[^\"'`]{2,80})[\"'`]", body)))
for method, path in calls:
    print(f"  {method.upper():6} {path}")

print("\n=== template calls ===")
calls2 = sorted(set(re.findall(r"\.(post|put|patch|delete|get)\(\s*[\"'`]([^\"'`]*\$\{[^`'\"]{0,60})[\"'`]", body)))
for method, path in calls2:
    print(f"  {method.upper():6} {path}")

print("\n=== 'api/client' occurrences with context ===")
for match in list(re.finditer(r"api/client", body))[:25]:
    start = max(0, match.start() - 60)
    print("   ...", body[start:match.start() + 110].replace("\n", " "))
