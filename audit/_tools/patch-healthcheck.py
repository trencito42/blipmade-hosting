#!/usr/bin/env python3
"""Schimba verificarea de sanatate a containerului API pe ruta de viabilitate.

Motivul: ruta `/health` intreaba baza de date si cache-ul. O baza de date
incepanda, sau un cache lent, ar face containerul sa para bolnav si Docker l-ar
reporni in sir — chiar in momentul in care 数据库 e doar lent, nu cazat. Ruta de
viabilitate (`/health/live`) cere nimic: procesul raspunde, deci e viu.

Decizia a fost luata de workerul care a construit rutele de sanatate si a fost
notata ca apartinand fisierului de compose, pe care el nu l-a atins.
"""
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "compose.api.yml"

with open(PATH) as handle:
    text = handle.read()

old = """    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3100/health"]
      interval: 30s"""
new = """    healthcheck:
      # The liveness of the process: it asks no database and no cache, so a
      # slow dependency cannot restart the container in a loop.
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3100/health/live"]
      interval: 30s"""

if old not in text:
    print("  nu gasesc verificarea de sanatate a API-ului")
    sys.exit(1)

text = text.replace(old, new, 1)

with open(PATH, "w") as handle:
    handle.write(text)
print("  aplicat in", PATH)
