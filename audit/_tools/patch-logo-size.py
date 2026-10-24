#!/usr/bin/env python3
"""Da dimensiunile explicite logo-ului, ca pagina sa nu sara la incarcare.

Logo-ul avea `h-6 w-auto`: inaltimea era cunoscuta, latimea nu. Browserul nu
putea-si decat locul logo-ului pana cand il descarca, iar continutul de sub el
(subsolul public) sarea in jos. Lighthouse a masurat exact asta: un singur
salt, de 0,113, cu cauza "Media element lacking an explicit size".

Dimensiunile vin din `viewBox`-ul logo-ului (164 x 148). Cu ele, browserul
rezerva locul inainte de incarcare, iar raportul rămâne cel al logo-ului.
"""
import io
import re
import sys

WIDTH = 164
HEIGHT = 148

FILES = ["web/src/ui.tsx", "web/src/ui-app.tsx"]

OLD = '<img src={logo} alt="" className="h-6 w-auto" />'
NEW = f'<img src={{logo}} alt="" width={{{WIDTH}}} height={{{HEIGHT}}} className="h-6 w-auto" />'

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
    print(f"  {path}: {count} imagini cu dimensiune explicita")

print(f"  total: {total}")
if total == 0:
    sys.exit(1)
