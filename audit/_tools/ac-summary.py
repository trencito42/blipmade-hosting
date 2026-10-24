#!/usr/bin/env python3
"""Extrage cifrele dintr-un raport autocannon, in forma comparabila cu baseline-ul."""
import json
import sys


def summarize(path):
    with open(path) as handle:
        data = json.load(handle)
    lat = data.get("latency", {})
    req = data.get("requests", {})
    thr = data.get("throughput", {})
    print(f"== {path}")
    print(f"   url        : {data.get('url')}")
    print(f"   conexiuni  : {data.get('connections')} | durata: {data.get('duration')}s | pipelining: {data.get('pipelining')}")
    print(f"   2xx        : {data.get('2xx')} | non2xx: {data.get('non2xx')} | erori: {data.get('errors')} | timeout: {data.get('timeouts')}")
    print(f"   debit      : {req.get('average')} req/s")
    print(f"   latenta    : p50 {lat.get('p50')} ms | p97,5 {lat.get('p97_5')} ms | max {lat.get('max')} ms | medie {lat.get('average')} ms")
    print(f"   debit date : {thr.get('average')} bytes/s")
    print(f"   fereastra  : {data.get('start')} -> {data.get('finish')}")
    print()


if __name__ == "__main__":
    for p in sys.argv[1:]:
        summarize(p)
