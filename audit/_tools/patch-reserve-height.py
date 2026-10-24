#!/usr/bin/env python3
"""Rezerva spatiul primei ecrane in paginile publice, ca subsolul sa nu sara.

Problema: pagina de produs arata mai intai o stare de incarcare, care este
mult mai scunda decat produsul care vine dupa. Cand produsul apare, continutul
creste cu aproximativ 460 de pixeli, subsolul coboara, iar saltul masurat de
Lighthouse a fost de 0,113 — peste tinta de 0,1. Saltul era atribuit logo-ului
din subsol, dar logo-ul era doar elementul care s-a miscat: cel care s-a
miscat era subsolul.

Repararea: continutul paginii publice ocupa cel putin o ecrana. In felul
acesta, subsolul sta sub prima ecran in ambele stari, iar aparitia
continutului nu-l mai misca. Ecranul masurat la 412x823 are 823 de pixeli, iar
produsul incape in 836 — diferenta ramane de 13 pixeli, sub pragul de salt.
"""
import io
import sys

FILES = ["web/src/app/ProductPage.tsx"]

OLD = '<main className="pt-[84px] sm:pt-[104px]">'
NEW = '<main className="min-h-[100svh] pt-[84px] sm:pt-[104px]">'

total = 0
for path in FILES:
    text = io.open(path, encoding="utf-8").read()
    count = text.count(OLD)
    if count == 0:
        print(f"  {path}: nimic de schimbat")
        continue
    text = text.replace(OLD, NEW)
    io.open(path, "w", encoding="utf-8").write(text)
    total += count
    print(f"  {path}: {count} zone de continut cu spatiu rezervat")

print(f"  total: {total}")
if total == 0:
    sys.exit(1)
