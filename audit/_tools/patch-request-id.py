#!/usr/bin/env python3
"""Adauga in web/server.mjs identificatorul de cerere al serverului.

Problema: proxy-ul copiaza antetele clientului, deci un `x-request-id` ales de
client ajunge la API. API-ul are voie sa creada antetul doar de la un proxy de
incredere, iar web-ul este tocmai acel proxy: identifierul clientului ar fi
deci acceptat. Un client ar putea pune acelasi numar pe mai multe cereri, sau
numarul altei cereri, iar jurnalul incidentului ar minti.

Repararea: web-ulsterge antetul primit si pune in locul lui unul pe care il
face el, la fel cum inlocuieste `x-forwarded-for`.
"""
import re
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "web/server.mjs"

with open(PATH) as handle:
    text = handle.read()

if "randomUUID" in text and "requestId(req)" in text:
    print("  deja aplicat")
    sys.exit(0)

# 1. importul
old_import = "import { createServer, request as httpRequest } from 'node:http';"
new_import = old_import + "\nimport { randomUUID } from 'node:crypto';"
if old_import not in text:
    print("  nu gasesc linia de import")
    sys.exit(1)
text = text.replace(old_import, new_import, 1)

# 2. functia, langa celelalte functii ale adresei
anchor = """/** The scheme the client used, taken from a trusted proxy only. */"""
helper = """/**
 * The identifier of the request.
 *
 * The API believes this header only when it comes from a proxy it trusts, and
 * this server is that proxy. The identifier of the client must therefore never
 * arrive: a client that chose its own identifier could put the same number on
 * many requests, or the number of another request, and the journal of an
 * incident would lie. The identifier is made here instead, and the one that
 * arrived is replaced.
 */
function requestId() {
  return randomUUID();
}

"""
if anchor not in text:
    print("  nu gasesc ancora functiei")
    sys.exit(1)
text = text.replace(anchor, helper + anchor, 1)

# 3. cele doua cai de proxy: cererea si trecerea la WebSocket
pattern = re.compile(r"^([ \t]*)headers\['x-forwarded-proto'\] = clientProtocol\(req\);$", re.M)
found = pattern.findall(text)
if len(found) != 2:
    print(f"  asteptam 2 cai de proxy, am gasit {len(found)}")
    sys.exit(1)


def add_request_id(match):
    indent = match.group(1)
    return (
        match.group(0)
        + f"\n{indent}// The identifier of the request is the one of this server, never the\n"
        + f"{indent}// one the client chose.\n"
        + f"{indent}headers['x-request-id'] = requestId();"
    )


text = pattern.sub(add_request_id, text)

with open(PATH, "w") as handle:
    handle.write(text)
print("  aplicat in", PATH)
