#!/usr/bin/env python3
"""Descarca un CSS Font Awesome Pro si referintele sale WOFF2.

Folosește exclusiv cu resurse pentru care ai drept de descărcare și găzduire.
Nu ocolește limitări HTTP, abonamente sau autorizări.

Exemple:
    python3 download_fontawesome_fixed.py --version 7.3.1
    python3 download_fontawesome_fixed.py --version 7.1.0 --css ~/pro.min.css
    python3 download_fontawesome_fixed.py --version 7.3.1 --dry-run
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, unquote
from urllib.request import Request, urlopen

URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def fetch(url, attempts=3):
    for i in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
            with urlopen(req, timeout=45) as resp:
                return resp.read()
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or i == attempts - 1:
                raise
        except (URLError, OSError, TimeoutError):
            if i == attempts - 1:
                raise
        time.sleep(2 ** i)
    raise RuntimeError("Nu s-a putut descarca")


def is_woff2(data):
    return len(data) > 16 and data[:4] == b"wOF2"


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".part")
    try:
        temp.write_bytes(data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def download_one(url, path):
    try:
        if path.exists() and is_woff2(path.read_bytes()):
            return "existing", path.name, ""
        data = fetch(url)
        if not is_woff2(data):
            raise ValueError("Raspunsul nu este un font WOFF2 valid (poate fi HTML/eroare CDN)")
        save(path, data)
        return "ok", path.name, ""
    except Exception as exc:
        return "error", path.name, str(exc)


def main():
    p = argparse.ArgumentParser(description="Font Awesome Pro CSS + toate fonturile WOFF2 referite")
    p.add_argument("--version", default="7.3.1", help="Versiunea din URL (implicit: 7.3.1)")
    p.add_argument("--css", type=Path, help="Optional: foloseste un CSS local deja descarcat")
    p.add_argument("--output", type=Path, help="Directorul rezultat (implicit: fontawesome-VERSION)")
    p.add_argument("--workers", type=int, default=4, help="Maxim descarcari simultane (implicit: 4)")
    p.add_argument("--dry-run", action="store_true", help="Arata ce resurse ar descarca, fara fonturi")
    args = p.parse_args()

    if not VERSION_RE.fullmatch(args.version):
        p.error("Versiunea trebuie sa arate ca 7.3.1")
    if not 1 <= args.workers <= 8:
        p.error("--workers trebuie sa fie intre 1 si 8")

    css_url = f"https://kit-pro.fontawesome.com/releases/v{args.version}/css/pro.min.css"
    root = (args.output or Path(f"fontawesome-{args.version}")).expanduser().resolve()
    try:
        if args.css:
            inp = args.css.expanduser().resolve()
            print(f"Citesc CSS local: {inp}")
            css_bytes = inp.read_bytes()
        else:
            print(f"Descarc CSS: {css_url}")
            css_bytes = fetch(css_url)
        css_text = css_bytes.decode("utf-8-sig")
    except (OSError, UnicodeError, HTTPError, URLError, TimeoutError) as exc:
        print(f"EROARE la citirea CSS: {exc}", file=sys.stderr)
        return 1

    references = [m.group(2).strip() for m in URL_RE.finditer(css_text)]
    downloads = {}
    unsupported = []
    for ref in references:
        normalized = unquote(ref.split("?", 1)[0].split("#", 1)[0])
        if not normalized.lower().endswith(".woff2"):
            continue
        target_url = urljoin(css_url, ref)
        parsed = urlparse(target_url)
        # Restrange descarcarea la originea explicita a CSS-ului.
        if parsed.scheme != "https" or parsed.netloc != "kit-pro.fontawesome.com":
            unsupported.append(ref)
            continue
        name = Path(parsed.path).name
        if not re.fullmatch(r"[a-zA-Z0-9._-]+\.woff2", name):
            unsupported.append(ref)
            continue
        previous = downloads.get(name)
        if previous and previous != target_url:
            print(f"EROARE: doua URL-uri distincte pentru acelasi fisier {name}", file=sys.stderr)
            return 1
        downloads[name] = target_url

    print(f"CSS: {len(css_bytes):,} bytes | url(...): {len(references)} | WOFF2 valide: {len(downloads)}")
    if unsupported:
        print(f"Atentie: {len(unsupported)} referinte WOFF2 externe sau invalide au fost omise")
    if not downloads:
        print("EROARE: niciun fisier WOFF2 identificat.", file=sys.stderr)
        print(f"  - versiunea declarata: {args.version}", file=sys.stderr)
        print(f"  - CSS incepe cu: {css_text[:220]!r}", file=sys.stderr)
        print(f"  - primele referinte CSS: {references[:5]}", file=sys.stderr)
        print("Verifica daca --css pointeaza la CSS real (nu HTML), si versiunea corecta.", file=sys.stderr)
        return 1

    if args.dry_run:
        for name, url in sorted(downloads.items())[:8]:
            print(f"  {name} <- {url}")
        print(f"Test OK: {len(downloads)} fonturi detectate; nu am descarcat nimic (dry-run).")
        return 0

    css_out = root / "css" / "pro.min.css"
    save(css_out, css_bytes)
    font_dir = root / "webfonts"
    ok = old = 0
    errors = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {
            pool.submit(download_one, url, font_dir / name): name
            for name, url in sorted(downloads.items())
        }
        for index, f in enumerate(as_completed(tasks), 1):
            status, name, message = f.result()
            if status == "ok":
                ok += 1
            elif status == "existing":
                old += 1
            else:
                errors.append((name, message))
                print(f"EROARE {name}: {message}")
            if index % 25 == 0 or index == len(tasks):
                print(f"[{index}/{len(tasks)}] Noi: {ok}, existente: {old}, erori: {len(errors)}")
    print(f"\nDirector: {root}")
    print(f"CSS: {css_out}")
    print(f"Fonturi: {font_dir}")
    if errors:
        print(f"INCOMPLET: {len(errors)} fonturi au esuat. Ruleaza din nou pentru retry.", file=sys.stderr)
        return 1
    print("SUCCES: toate fonturile WOFF2 referite sunt salvate local.")
    print('Link HTML: <link rel="stylesheet" href="/fontawesome/css/pro.min.css">')
    return 0


if __name__ == "__main__":
    sys.exit(main())
