import json
import sys

path = sys.argv[1]
with open(path) as handle:
    data = json.load(handle)
audits = data.get("audits", {})

for item in (audits.get("layout-shifts", {}).get("details", {}) or {}).get("items", []):
    print(json.dumps(item, indent=1)[:2500])
    print("---")

for key in ["unsized-images", "network-requests", "render-blocking-resources", "font-display", "uses-rel-preconnect"]:
    audit = audits.get(key)
    if not audit:
        continue
    print(key, "->", audit.get("displayValue"), "scor", audit.get("score"))
    for it in (audit.get("details", {}) or {}).get("items", [])[:5]:
        node = it.get("node", {})
        label = node.get("selector") or node.get("snippet") or it.get("url") or it.get("wastedBytes") or ""
        print("   -", str(label)[:120], it.get("transferSize", ""))
