#!/usr/bin/env python3
"""
Puts the certificate of the origin on the edge and proves that it is served.

This script runs on the edge of Blipmade (VM 102), where Caddy answers the
requests of the visitors. It is not a script of the platform: the platform
writes its routes into Caddy through the administrative API and never touches
the certificate.

The certificate and the key are read from the standard input, so the private
key never appears in the list of the processes and never in the history of a
shell:

    cat certificate.pem key.pem | sudo python3 apply-origin-cert.py

The script refuses a pair that does not belong together, keeps a copy of the
certificate that was in use, writes the new one with the rights of Caddy,
puts the routes of the customers back after the reload (a reload of Caddy
replaces the configuration that was written through the administrative API) and
then checks the handshake with the name of the wildcard.

Nothing is printed that holds the key.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

CERT_PATH = "/etc/caddy/certs/blipmade-origin.crt"
KEY_PATH = "/etc/caddy/certs/blipmade-origin.key"
CADDYFILE = "/etc/caddy/Caddyfile"
ENV_FILE = "/etc/caddy/blipmade.env"
ADMIN_ROUTES = "http://127.0.0.1:2019/config/apps/http/servers/blipmade/routes"

# The names of the platform that the edge has to answer for. The certificate
# of the origin covers the wildcard of the base of the platform, so every
# application that is deployed under that base is served with it.
REQUIRED_NAMES = os.environ.get("BLIPMADE_ORIGIN_NAMES", "*.apps.blipmade.com,apps.blipmade.com")

# The sites that come from the Caddyfile. Every other route was written
# through the administrative API and has to be written back after a reload.
FROM_THE_FILE = {"blipmade.com", "www.blipmade.com", "*.apps.blipmade.com", "apps.blipmade.com"}


def say(message):
    print(f"==> {message}", flush=True)


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def run(command, stdin=None):
    return subprocess.run(command, input=stdin, capture_output=True, text=True)


def split_pem(text):
    """Splits a text into the PEM blocks it holds."""
    return re.findall(r"-----BEGIN [^-]+-----.*?-----END [^-]+-----", text, re.S)


def openssl(arguments, stdin=None):
    result = run(["openssl", *arguments], stdin=stdin)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return result.stdout.strip(), None


def read_pair(args):
    """Returns the certificate and the key, from the files or from the input."""
    if args.cert or args.key:
        if not (args.cert and args.key):
            fail("both --cert and --key are needed when a file is given")
        for path in (args.cert, args.key):
            if not os.path.isfile(path):
                fail(f"the file {path} does not exist")
        with open(args.cert) as handle:
            certificate = handle.read()
        with open(args.key) as handle:
            key = handle.read()
        return certificate, key

    raw = sys.stdin.read()
    blocks = split_pem(raw)
    if len(blocks) != 2:
        fail("two PEM blocks are needed on the standard input: the certificate and the key")
    certificate = next((block for block in blocks if "CERTIFICATE" in block), None)
    key = next((block for block in blocks if "PRIVATE KEY" in block), None)
    if not certificate or not key:
        fail("the standard input does not hold a certificate and a private key")
    return certificate, key


def check_pair(certificate, key):
    """Refuses a pair that is broken, that does not match, or that is short of life."""
    with tempfile.TemporaryDirectory() as folder:
        cert_file = os.path.join(folder, "cert.pem")
        key_file = os.path.join(folder, "key.pem")
        with open(cert_file, "w") as handle:
            handle.write(certificate)
        with open(key_file, "w") as handle:
            handle.write(key)

        text, error = openssl(["x509", "-in", cert_file, "-noout", "-text"])
        if error:
            fail(f"the certificate cannot be read: {error}")

        _, error = openssl(["x509", "-in", cert_file, "-noout", "-checkend", str(7 * 24 * 3600)])
        if error:
            fail("the certificate expires within a week")

        _, error = openssl(["pkey", "-in", key_file, "-noout", "-check"])
        if error:
            fail(f"the private key cannot be read: {error}")

        cert_public, _ = openssl(["x509", "-in", cert_file, "-noout", "-pubkey"])
        key_public, _ = openssl(["pkey", "-in", key_file, "-pubout"])
        if not cert_public or not key_public or cert_public != key_public:
            fail("the certificate and the key are not a pair")

        names = re.findall(r"DNS:([^,\s]+)", text)
        missing = [name for name in REQUIRED_NAMES.split(",") if name not in names]
        if missing:
            fail(f"the certificate does not cover {', '.join(missing)}; it covers {', '.join(names)}")

        subject, _ = openssl(["x509", "-in", cert_file, "-noout", "-subject"])
        dates, _ = openssl(["x509", "-in", cert_file, "-noout", "-dates"])
        say(f"the certificate is a pair with the key and covers {', '.join(names)}")
        say(f"{subject}")
        say(f"{dates.replace('notBefore=', 'from ').replace('notAfter=', 'until ')}")


def install(certificate, key):
    """Writes the pair where Caddy reads it."""
    os.makedirs(os.path.dirname(CERT_PATH), exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    for path in (CERT_PATH, KEY_PATH):
        if os.path.exists(path):
            shutil.copy2(path, f"{path}.before-{stamp}")

    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
        handle.write(certificate)
        temporary = handle.name
    shutil.copyfile(temporary, CERT_PATH)
    os.chmod(CERT_PATH, 0o644)
    shutil.chown(CERT_PATH, "root", "root")

    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
        handle.write(key)
        temporary = handle.name
    shutil.copyfile(temporary, KEY_PATH)
    os.chmod(KEY_PATH, 0o640)
    shutil.chown(KEY_PATH, "root", "caddy")
    for path in (temporary,):
        os.unlink(path)

    say(f"the pair was written to {CERT_PATH} and {KEY_PATH}")


def admin_token():
    with open(ENV_FILE) as handle:
        for line in handle:
            if line.startswith("CADDY_ADMIN_TOKEN="):
                return line.strip().split("=", 1)[1]
    fail("the token of the edge is not in " + ENV_FILE)


def admin(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{ADMIN_ROUTES}{path}", data=data, method=method)
    request.add_header("Authorization", "Bearer " + admin_token())
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = response.read()
        return json.loads(payload) if payload else None


def hosts_of(route):
    found = []

    def walk(node):
        if isinstance(node, dict):
            for entry in node.get("match", []) or []:
                found.extend(entry.get("host", []) or [])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(route)
    return found


def reload_with_routes():
    """Reloads Caddy and writes the routes of the customers back.

    A reload replaces the whole configuration, and the routes that were written
    through the administrative API are not a part of the file. They are read
    before the reload and written back after it.
    """
    try:
        routes = admin("") or []
    except (urllib.error.URLError, OSError):
        say("the administrative API did not answer; the reload goes on without it")
        routes = []

    kept = [route for route in routes if not set(hosts_of(route)) <= FROM_THE_FILE]
    say(f"the routes of the customers that are kept: {[hosts_of(route) for route in kept]}")

    subprocess.run(["systemctl", "reload", "caddy"], check=True)
    say("the edge was reloaded")

    for route in kept:
        admin("", method="POST", body=route)
        say(f"the route of {hosts_of(route)} was written back")


def verify(certificate):
    """Checks the handshake with the name of the wildcard."""
    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
        handle.write(certificate)
        cert_file = handle.name
    result = run([
        "openssl", "s_client", "-connect", "127.0.0.1:443",
        "-servername", "foo.apps.blipmade.com",
    ])
    if result.returncode != 0:
        os.unlink(cert_file)
        fail("the edge did not answer the handshake of the wildcard")

    served, error = openssl(["x509", "-noout", "-pubkey"], stdin=result.stdout)
    expected, _ = openssl(["x509", "-in", cert_file, "-noout", "-pubkey"])
    os.unlink(cert_file)
    if error:
        fail(f"the handshake of the wildcard failed: {error}")
    if not served or not expected or served != expected:
        fail("the edge does not serve the certificate that was written")
    say("the edge serves the certificate that was written, for the wildcard of the base")


def main():
    parser = argparse.ArgumentParser(description="Puts the certificate of the origin on the edge.")
    parser.add_argument("--cert", help="the file of the certificate")
    parser.add_argument("--key", help="the file of the private key")
    args = parser.parse_args()

    if os.geteuid() != 0:
        fail("the script writes in /etc/caddy and reloads the service: it needs the rights of root")

    certificate, key = read_pair(args)
    check_pair(certificate, key)
    install(certificate, key)
    reload_with_routes()
    verify(certificate)
    say("done. The origin answers with the new certificate.")


if __name__ == "__main__":
    main()
