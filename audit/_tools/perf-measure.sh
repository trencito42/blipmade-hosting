#!/usr/bin/env bash
# Masuratorile de "dupa" — aceeasi metoda ca baseline-ul, ca cele doua serii sa fie
# comparabile. Ruleaza pe stiva izolata de masuratoare (API 3106 / web 30020),
# niciodata pe productie.
#
#   bash perf-measure.sh <director_de_iesire> [eticheta]
#
# Metoda este cea a baseline-ului, cifrata cu cifrata:
#   - Lighthouse 13.5.0, fara --preset => preset implicit (mobile, 412x823@1.75,
#     throttling simulat: rtt 150 ms, 1638.4 kbps, CPU x4)
#   - autocannon: -c 10 -d 12 pentru API, -c 20 -d 12 pentru fisierul static
#   - aceleasi trei rute: /, /catalog, /login
set -uo pipefail

OUT="${1:?directorul de iesire}"
LABEL="${2:-masuratoare}"
API="${API:-http://127.0.0.1:3106}"
WEB="${WEB:-http://127.0.0.1:30020}"
TOOLS=/home/debian/perf-tools

mkdir -p "$OUT"

echo "== $LABEL: masuratori pe stiva izolata (API $API, web $WEB) =="
echo "   data: $(date -Is)"

# --- 1. Lighthouse, cele patru rute ---------------------------------------------
# Rutele sunt cele reale ale aplicatiei: /, /apps (catalogul), /apps/wordpress
# (pagina de produs) si /login. Ruta /catalog NU exista in aplicatie.
for route in home apps apps-wordpress login; do
  case "$route" in
    home)           url="$WEB/" ;;
    apps)           url="$WEB/apps" ;;
    apps-wordpress) url="$WEB/apps/wordpress" ;;
    login)          url="$WEB/login" ;;
  esac
  echo "-- lighthouse $url"
  (cd "$TOOLS" && CHROME_PATH=/usr/bin/chromium npx lighthouse "$url" \
    --output=json --output-path="$OUT/lh-$route.json" \
    --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu" \
    --quiet) >/dev/null 2>&1 || echo "   ATENTIE: lighthouse a esuat pentru $url"
done

# --- 2. Chunk principal: acesta se identifica din bundle-ul construit -----------
MAIN_JS="$(curl -s "$WEB/" | grep -oE '/assets/[^"]+\.js' | head -1)"
if [ -z "$MAIN_JS" ]; then
  MAIN_JS="$(curl -s "$WEB/index.html" | grep -oE '/assets/[^"]+\.js' | head -1)"
fi
echo "-- chunk principal: $MAIN_JS"

# --- 3. autocannon: API si fisier static ---------------------------------------
echo "-- autocannon API"
"$TOOLS/node_modules/.bin/autocannon" -c 10 -d 12 -j "$API/api/catalog/products" > "$OUT/ac-catalog.json" 2>/dev/null
if [ -n "$MAIN_JS" ]; then
  echo "-- autocannon fisier static"
  "$TOOLS/node_modules/.bin/autocannon" -c 20 -d 12 -j "$WEB$MAIN_JS" > "$OUT/ac-asset.json" 2>/dev/null
fi

# --- 4. Antetele livrarii: compresie, ETag, Vary -------------------------------
{
  echo "# Antetele livrarii, $LABEL"
  for p in / "$MAIN_JS" /assets/; do
    [ -n "$p" ] || continue
    echo "-- GET $p"
    curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip, br' "$WEB$p" \
      | grep -iE '^(HTTP/|cache-control|etag|content-encoding|vary|content-type|content-length)' \
      | sed 's/\r$//'
    echo
  done
} > "$OUT/headers.txt" 2>&1

# --- 5. Dimensiunile livrarii --------------------------------------------------
{
  echo "# Dimensiunile bundle-ului, $LABEL"
  echo "-- total pe tip (dist/)"
  DIST="${DIST:-/home/debian/bm-phase14/web/dist}"
  for ext in js css html; do
    total=$(find "$DIST" -name "*.$ext" -type f ! -name "*.gz" ! -name "*.br" -printf '%s\n' 2>/dev/null | awk '{s+=$1} END{print s+0}')
    count=$(find "$DIST" -name "*.$ext" -type f ! -name "*.gz" ! -name "*.br" 2>/dev/null | wc -l)
    printf -- '- %s: %d fisier(e), %s octeti (%.1f KB)\n' "$ext" "$count" "$total" "$(echo "$total/1024" | bc -l)"
  done
  echo
  echo "-- cele mai mari 15 fisiere"
  find "$DIST" -type f ! -name "*.gz" ! -name "*.br" -printf '%s %p\n' 2>/dev/null | sort -rn | head -15 | awk '{printf "%9.1f KB  %s\n", $1/1024, $2}'
  echo
  echo "-- chunk principal: brut / gzip / brotli"
  for f in $(find "$DIST/assets" -name '*.js' -type f ! -name '*.gz' ! -name '*.br' 2>/dev/null | head -6); do
    raw=$(stat -c%s "$f")
    gz=$(gzip -9 -c "$f" 2>/dev/null | wc -c)
    br=$(command -v brotli >/dev/null 2>&1 && brotli -q 11 -c "$f" 2>/dev/null | wc -c || echo "n/a")
    printf -- '- %s: brut %s B | gzip %s B | brotli %s B\n' "$(basename "$f")" "$raw" "$gz" "$br"
  done
} > "$OUT/bundle.txt" 2>&1

# --- 6. Costul unei autentificari cu parola gresita (scrypt) -------------------
{
  echo "# Autentificare cu parola gresita, $LABEL"
  for i in 1 2 3 4 5; do
    t=$(curl -s -o /dev/null -w '%{time_total}' -X POST "$API/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{"email":"perf-admin@blipmade.test","password":"wrong-password-for-measurement"}')
    echo "  incercare $i: ${t}s"
  done
} > "$OUT/login.txt" 2>&1

# --- 7. Rezumatul --------------------------------------------------------------
{
  echo "# Rezumat, $LABEL"
  python3 /tmp/lh-summary.py "$OUT"/lh-*.json 2>/dev/null
  python3 /tmp/ac-summary.py "$OUT"/ac-*.json 2>/dev/null
} > "$OUT/summary.txt" 2>&1

echo "== gata: $OUT"
cat "$OUT/summary.txt"
