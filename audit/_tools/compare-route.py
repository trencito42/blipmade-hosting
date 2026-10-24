import glob
import json
import sys

side = sys.argv[1]
route = sys.argv[2] if len(sys.argv) > 2 else "home"
files = sorted(glob.glob(f"/home/debian/perf-out/{side}/lh-{route}-*.json"))
if not files:
    print("fara rapoarte")
    raise SystemExit(0)

data = json.load(open(files[0]))
audits = data.get("audits", {})
print(f"== {side} ({files[0].split('/')[-1]})")

for key in ["bootup-time", "long-tasks", "mainthread-work-breakdown"]:
    audit = audits.get(key)
    if not audit:
        continue
    print(f"  {key}: {audit.get('displayValue')}")
    for item in (audit.get("details", {}) or {}).get("items", [])[:8]:
        if key == "bootup-time":
            print(f"    {item.get('total', 0)/1000:7.0f} ms  {str(item.get('url', ''))[:70]}")
        elif key == "long-tasks":
            print(f"    {item.get('duration', 0):6} ms  {str(item.get('url', ''))[:70]}")
        else:
            print(f"    {item.get('group', '')}  {item.get('duration', 0)/1000:7.0f} ms")

items = (audits.get("network-requests", {}).get("details", {}) or {}).get("items", [])
total = sum(i.get("transferSize", 0) for i in items)
print(f"  requests: {len(items)} | transfer {total/1024:.0f} KiB")
for item in sorted(items, key=lambda x: -x.get("transferSize", 0))[:8]:
    print(f"    {item.get('transferSize', 0)/1024:7.1f} KiB  {str(item.get('url', ''))[:70]}")
