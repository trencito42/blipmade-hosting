#!/usr/bin/env python3
"""Extrage cifrele pe care conteaza dintr-un raport Lighthouse, in forma tabelara.

Folosit si pentru baseline (inainte) si pentru masuratoarea de dupa, ca cele doua
serii sa fie comparabile exact: aceleasi rute, aceeasi versiune, aceleasi reguli.
"""
import json
import sys

KEYS = [
    ("first-contentful-paint", "FCP"),
    ("largest-contentful-paint", "LCP"),
    ("total-blocking-time", "TBT"),
    ("cumulative-layout-shift", "CLS"),
    ("speed-index", "SI"),
    ("interactive", "TTI"),
    ("total-byte-weight", "Transfer"),
]


def summarize(path):
    with open(path) as handle:
        data = json.load(handle)
    audits = data.get("audits", {})
    cats = data.get("categories", {})
    cfg = data.get("configSettings", {})
    thr = cfg.get("throttling", {})
    emu = cfg.get("screenEmulation", {})

    print(f"== {path}")
    print(f"   url          : {data.get('finalUrl')}")
    print(f"   versiune     : {data.get('lighthouseVersion')}  | preluat: {data.get('fetchTime')}")
    print(
        f"   preset       : formFactor={cfg.get('formFactor')} method={cfg.get('throttlingMethod')} "
        f"ecran={emu.get('width')}x{emu.get('height')}@{emu.get('deviceScaleFactor')}"
    )
    print(
        f"   throttling   : rtt={thr.get('rttMs')}ms throughput={thr.get('throughputKbps')}kbps "
        f"cpuSlowdown={thr.get('cpuSlowdownMultiplier')}x"
    )
    score = cats.get("performance", {}).get("score")
    print(f"   scor perform : {round(score * 100) if score is not None else 'n/a'}")
    for key, label in KEYS:
        audit = audits.get(key, {})
        print(f"   {label:<12} : {audit.get('displayValue', 'n/a')}  (scor {audit.get('score')})")
    print()


def main():
    for path in sys.argv[1:]:
        summarize(path)


if __name__ == "__main__":
    main()
