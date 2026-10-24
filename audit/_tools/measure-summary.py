#!/usr/bin/env python3
"""Rezumatul comparativ al doua serii de masuratori, cu mediane.

    measure-summary.py <director_inainte> <director_dupa>

Medianele, nu o singura valoare: Lighthouse are o abatere intre runde, iar o
singura masuratoare nu este o baza de comparatie.
"""
import json
import os
import re
import statistics
import sys


def lighthouse_runs(folder, route):
    values = []
    for name in sorted(os.listdir(folder)):
        # potrivire exacta: lh-<ruta>-<n>.json, ca ruta "apps" sa nu prinda si
        # fisierele rutei "apps-wordpress"
        if not re.fullmatch(rf"lh-{re.escape(route)}-\d+\.json", name):
            continue
        with open(os.path.join(folder, name)) as handle:
            data = json.load(handle)
        audits = data.get("audits", {})
        categories = data.get("categories", {})
        score = categories.get("performance", {}).get("score")
        values.append(
            {
                "scor": round(score * 100) if score is not None else None,
                "FCP": audits.get("first-contentful-paint", {}).get("numericValue"),
                "LCP": audits.get("largest-contentful-paint", {}).get("numericValue"),
                "TBT": audits.get("total-blocking-time", {}).get("numericValue"),
                "CLS": audits.get("cumulative-layout-shift", {}).get("numericValue"),
                "transfer": audits.get("total-byte-weight", {}).get("numericValue"),
            }
        )
    return values


def load_runs(folder, prefix):
    values = []
    for name in sorted(os.listdir(folder)):
        if not name.startswith(prefix) or not name.endswith(".json"):
            continue
        with open(os.path.join(folder, name)) as handle:
            data = json.load(handle)
        values.append(
            {
                "req_s": data.get("requests", {}).get("average"),
                "p50": data.get("latency", {}).get("p50"),
                "p975": data.get("latency", {}).get("p97_5"),
                "max": data.get("latency", {}).get("max"),
                "non2xx": data.get("non2xx"),
                "erori": data.get("errors"),
            }
        )
    return values


def median(rows, key):
    numbers = [row[key] for row in rows if row.get(key) is not None]
    return statistics.median(numbers) if numbers else None


def fmt(value, digits=0):
    if value is None:
        return "n/a"
    return f"{value:.{digits}f}"


def main():
    before, after = sys.argv[1], sys.argv[2]
    routes = ["home", "apps", "apps-wordpress", "login"]

    print("| Rută | Scor | FCP | LCP | TBT | CLS | Transfer |")
    print("|---|---|---|---|---|---|---|")
    for route in routes:
        b = lighthouse_runs(before, route)
        a = lighthouse_runs(after, route)
        if not b or not a:
            continue
        cells = []
        for key, digits in (("scor", 0), ("FCP", 1), ("LCP", 1), ("TBT", 0), ("CLS", 3), ("transfer", 0)):
            bv = median(b, key)
            av = median(a, key)
            if key == "transfer":
                cells.append(f"{bv/1024:.0f} KiB → **{av/1024:.0f} KiB**")
            else:
                cells.append(f"{fmt(bv, digits)} → **{fmt(av, digits)}**")
        print(f"| `/{route}` | " + " | ".join(cells) + " |")

    print()
    print("| Măsurătoare | Înainte | După |")
    print("|---|---|---|")
    for prefix, label in (("ac-catalog", "API `GET /api/catalog/products` (c=10, d=12)"), ("ac-asset", "fișier static (c=20, d=12)")):
        b = load_runs(before, prefix)
        a = load_runs(after, prefix)
        if not b or not a:
            continue
        for key, digits, unit in (("req_s", 0, " req/s"), ("p50", 0, " ms"), ("p975", 0, " ms"), ("max", 0, " ms")):
            print(
                f"| {label} — {key} | {fmt(median(b, key), digits)}{unit} | "
                f"**{fmt(median(a, key), digits)}{unit}** |"
            )


if __name__ == "__main__":
    main()
