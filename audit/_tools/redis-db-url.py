#!/usr/bin/env python3
"""Construiește URL-ul de Redis cu gazda și indicele bazei cerute.

    redis-db-url.py <url> <gazda> <indicele_bazei>

Motivul: workerul de producție consumă din coada `blipmade.provision` a bazei
Redis 0. O suita de teste sau o stivă de măsurătoare care folosește aceeași
bază pune joburi în coada de producție, iar workerul le consumă: testul nu mai
poate vedea eșecul pe care îl aștepta, iar producția vede joburi de test. Fiecare
stivă primește, așadar, un indice propriu.
"""
import sys
from urllib.parse import urlsplit, urlunsplit


def main():
    if len(sys.argv) != 4:
        print("folosire: redis-db-url.py <url> <gazda> <indicele_bazei>", file=sys.stderr)
        return 2
    url, host, index = sys.argv[1], sys.argv[2], sys.argv[3]
    parts = urlsplit(url)
    port = parts.port or 6379
    netloc = f"{host}:{port}"
    if parts.username:
        netloc = f"{parts.username}:{parts.password or ''}@{netloc}"
    path = f"/{index}"
    print(urlunsplit((parts.scheme, netloc, path, "", "")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
