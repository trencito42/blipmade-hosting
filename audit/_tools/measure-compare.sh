#!/usr/bin/env bash
# Masurarea comparativa: acelasi lucru masurat pe codul de dinaintea lotului de
# performanta si pe codul de dupa, cu aceeasi metoda si cu acelasi numar de
# runde.
#
#   bash measure-compare.sh [commit_de_baza] [runde]
#
# Se masoara:
#   - Lighthouse pe cele patru rute reale (preset implicit, aceeasi versiune)
#   - autocannon pe API-ul de citire si pe fisierul static
#   - antetele livrarii si dimensiunile bundle-ului
#
# Iesirea: doua directoare, /home/debian/perf-out/before si .../after, cu
# rapoartele Lighthouse si autocannon si cu un rezumat.
set -euo pipefail

KEY=/root/.ssh/blipmade_vm103
VM=debian@10.77.0.13
BASE="${1:-4969f4a}"
BRANCH="remediation/phase-2-critical-fixes"
WORK=/home/debian/bm-phase14
RUNS="${2:-3}"

ssh -i "$KEY" "$VM" "bash -s -- '$BASE' '$BRANCH' '$WORK' '$RUNS'" <<'SH'
set -euo pipefail
BASE="$1"; BRANCH="$2"; WORK="$3"; RUNS="$4"
REPO=/opt/blipmade
OUT=/home/debian/perf-out
TOOLS=/home/debian/perf-tools

routes() {
  case "$1" in
    home) echo "http://127.0.0.1:30020/";;
    apps) echo "http://127.0.0.1:30020/apps";;
    apps-wordpress) echo "http://127.0.0.1:30020/apps/wordpress";;
    login) echo "http://127.0.0.1:30020/login";;
  esac
}

measure_lighthouse() {
  local dir="$1"
  mkdir -p "$dir"
  for r in home apps apps-wordpress login; do
    for i in $(seq 1 "$RUNS"); do
      (cd "$TOOLS" && CHROME_PATH=/usr/bin/chromium npx lighthouse "$(routes "$r")" \
        --output=json --output-path="$dir/lh-$r-$i.json" \
        --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu" \
        --quiet) >/dev/null 2>&1 || true
    done
    echo "   lighthouse $r: $RUNS runde"
  done
}

measure_load() {
  local dir="$1"
  mkdir -p "$dir"
  local main_js
  main_js="$(curl -s http://127.0.0.1:30020/ | grep -oE '/assets/[^"]+\.js' | head -1)"
  for i in $(seq 1 "$RUNS"); do
    "$TOOLS/node_modules/.bin/autocannon" -c 10 -d 12 -j http://127.0.0.1:3106/api/catalog/products > "$dir/ac-catalog-$i.json" 2>/dev/null || true
    if [ -n "$main_js" ]; then
      "$TOOLS/node_modules/.bin/autocannon" -c 20 -d 12 -j "http://127.0.0.1:30020$main_js" > "$dir/ac-asset-$i.json" 2>/dev/null || true
    fi
  done
  echo "   autocannon: $RUNS runde pentru API si pentru fisierul static"
}

measure_headers() {
  local dir="$1"
  mkdir -p "$dir"
  local main_js
  main_js="$(curl -s http://127.0.0.1:30020/ | grep -oE '/assets/[^"]+\.js' | head -1)"
  {
    echo "# Antetele livrarii"
    for p in / "$main_js"; do
      [ -n "$p" ] || continue
      echo "-- GET $p"
      curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip, br' "http://127.0.0.1:30020$p" \
        | grep -iE '^(HTTP/|cache-control|etag|content-encoding|vary|content-type|content-length)' | sed 's/\r$//'
      echo
    done
  } > "$dir/headers.txt" 2>&1
}

build_and_start() {
  git -C "$WORK" checkout --detach "$1" >/dev/null
  cd "$WORK/api" && npx tsc -p tsconfig.json
  cd "$WORK/web" && rm -rf dist && npx vite build > /tmp/perf-web-build.log 2>&1 || { tail -20 /tmp/perf-web-build.log; exit 1; }
  bash /opt/blipmade/audit/_tools/perf-stack.sh blipmade_perf_test >/dev/null
  sleep 3
}

cd "$REPO"
echo "== INAINTE: $BASE"
build_and_start "$BASE"
printf "   stiva: api "; curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3106/health
printf "web "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30020/healthz
measure_lighthouse "$OUT/before"
measure_load "$OUT/before"
measure_headers "$OUT/before"

echo
echo "== DUPA: $BRANCH"
build_and_start "$BRANCH"
printf "   stiva: api "; curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3106/health
printf "web "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30020/healthz
measure_lighthouse "$OUT/after"
measure_load "$OUT/after"
measure_headers "$OUT/after"

echo
echo "== rezumatul (medianele)"
python3 /opt/blipmade/audit/_tools/measure-summary.py "$OUT/before" "$OUT/after"
SH
