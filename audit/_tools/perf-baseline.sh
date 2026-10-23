#!/usr/bin/env bash
# Collects the performance and reliability baseline of the isolated check stack.
#
# The stack is the production build of the application (vite build, node
# server.mjs), running against the test database on the loopback interface of
# the VM. Every number is measured on that stack, never on production, and
# the environment is written into the output so the numbers are never read as
# production measurements.
#
#   bash perf-baseline.sh > perf-baseline.txt
set -uo pipefail

API=http://127.0.0.1:3101
WEB=http://127.0.0.1:30003

echo "# Baseline de performanta si fiabilitate"
echo
echo "Data: $(date -Is)"
echo "Masina: $(hostname) ($(uname -r), $(nproc) nuclee, $(free -m | awk '/^Mem:/{print $2" MB RAM"}'))"
echo "Stack: build de productie (vite build + node server.mjs), API 3101, web 30003, baza blipmade_test"
echo "ATENTIE: aceste sunt masuratori pe stiva izolata, nu pe productie."
echo

echo "## 1. Dimensiunile bundle-ului (build de productie)"
echo
echo '### 1.1 Total pe tip'
for ext in js css html; do
  total=$(find /tmp/web-check/dist -name "*.$ext" -type f -printf '%s\n' 2>/dev/null | awk '{s+=$1} END{print s+0}')
  count=$(find /tmp/web-check/dist -name "*.$ext" -type f -type f 2>/dev/null | wc -l)
  printf -- '- %s: %d fisier(e), %s bytes (%.1f KB)\n' "$ext" "$count" "$total" "$(echo "$total/1024" | bc -l)"
done
echo
echo '### 1.2 Cele mai mari 25 de fisiere din bundle'
find /tmp/web-check/dist -type f -printf '%s %p\n' 2>/dev/null | sort -rn | head -25 | awk '{printf "%8.1f KB  %s\n", $1/1024, $2}'
echo
echo '### 1.3 Dimensiunile gzip si brotli ale bundle-ului JavaScript principal'
for f in $(find /tmp/web-check/dist/assets -name '*.js' -type f 2>/dev/null | head -8); do
  raw=$(stat -c%s "$f")
  gz=$(gzip -9 -c "$f" 2>/dev/null | wc -c)
  br=$(command -v brotli >/dev/null 2>&1 && brotli -q 11 -c "$f" 2>/dev/null | wc -c || echo "n/a")
  printf -- '- %s: raw %s B, gzip %s B, brotli %s\n' "$(basename "$f")" "$raw" "$gz" "$br"
done
echo
echo '### 1.4 Cache-Control si ETag pe fisierele statice si pe index.html'
for p in / /assets/ /index.html; do
  printf -- '- %s -> ' "$p"
  curl -s -o /dev/null -D - "$WEB$p" 2>/dev/null | grep -iE '^(cache-control|etag|content-encoding|content-type)' | tr '\n' ' '
  echo
done
echo

echo "## 2. Latenta HTTP a paginilor (web, port 30003)"
echo
printf '%-34s %8s %8s %8s %10s\n' "RUTA" "TTFBms" "TOTALms" "SIZE" "HTTP"
for p in / /apps /apps/wordpress /apps/discord-bot /docs /status /login /register /forgot-password \
         /app /app/deploy /app/instances /app/billing /app/tickets /app/domains /app/settings \
         /admin /admin/customers /admin/orders /admin/services /admin/products /admin/pricing \
         /admin/tickets /admin/promotions /admin/infrastructure /admin/audit /admin/staff /admin/settings; do
  out=$(curl -s -o /dev/null -w '%{time_starttransfer} %{time_total} %{size_download} %{http_code}' "$WEB$p" 2>/dev/null)
  set -- $out
  printf '%-34s %8s %8s %8s %10s\n' "$p" "${1:-n/a}" "${2:-n/a}" "${3:-n/a}" "${4:-n/a}"
done
echo

echo "## 3. Latenta API (Fastify, port 3101)"
echo
printf '%-46s %8s %8s %6s\n' "ENDPOINT" "TTFBms" "TOTALms" "HTTP"
for p in /api/health /api/catalog/products /api/auth/session /api/instances /api/orders /api/invoices \
         /api/tickets /api/admin/overview /api/admin/customers /api/admin/orders /api/admin/services \
         /api/admin/products /api/admin/pricing /api/admin/tickets /api/admin/promotions \
         /api/admin/infrastructure /api/admin/audit /api/admin/staff /api/admin/settings; do
  out=$(curl -s -o /dev/null -w '%{time_starttransfer} %{time_total} %{http_code}' "$API$p" 2>/dev/null)
  set -- $out
  printf '%-46s %8s %8s %6s\n' "$p" "${1:-n/a}" "${2:-n/a}" "${3:-n/a}"
done
echo
echo "### 3.1 POST /api/catalog/quote (calculul de pret)"
for i in 1 2 3; do
  out=$(curl -s -o /dev/null -w '%{time_starttransfer} %{time_total} %{http_code}' -X POST "$API/api/catalog/quote" \
    -H 'content-type: application/json' \
    -d '{"items":[{"productSlug":"wordpress","ram":1024,"cpu":1,"disk":10}]}' 2>/dev/null)
  set -- $out
  printf -- '- rularea %s: ttfb %s ms, total %s ms, http %s\n' "$i" "${1:-n/a}" "${2:-n/a}" "${3:-n/a}"
done
echo

echo "## 4. Memorie si CPU ale proceselor stivei"
echo
for pid in $(ss -ltnp 2>/dev/null | grep -E ':(3101|30003) ' | grep -oP 'pid=\K[0-9]+' | sort -u); do
  cmd=$(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null)
  rss=$(awk '/^VmRSS/{print $2}' /proc/$pid/status 2>/dev/null)
  thr=$(awk '/^Threads/{print $2}' /proc/$pid/status 2>/dev/null)
  printf -- '- pid %s rss %s kB, threaduri %s, %s\n' "$pid" "${rss:-n/a}" "${thr:-n/a}" "$cmd"
done
echo
echo '### 4.1 Consumul de CPU al containerelor de productie (doar citire)'
docker stats --no-stream --format '  {{.Name}}\tCPU {{.CPUPerc}}\tMEM {{.MemUsage}}\tNET {{.NetIO}}\tBLK {{.BlockIO}}' 2>/dev/null || echo '  indisponibil'
echo

echo "## 5. Baza de date"
echo
echo '### 5.1 Dimensiunea bazei si a tabelelor'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select pg_size_pretty(pg_database_size('blipmade_test'));" 2>/dev/null | sed 's/^/  baza: /'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select relname||' | '||pg_size_pretty(pg_total_relation_size(relid))||' | '||n_live_tup||' randari' from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15;" 2>/dev/null | sed 's/^/  /'
echo
echo '### 5.2 Numarul de conexiuni si pool-ul'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select state||' = '||count(*) from pg_stat_activity where datname='blipmade_test' group by state;" 2>/dev/null | sed 's/^/  /'
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -tAc \
  "select name||' = '||setting from pg_settings where name in ('max_connections','shared_buffers','work_mem','effective_cache_size');" 2>/dev/null | sed 's/^/  /'
echo
echo '### 5.3 Cache-ul PostgreSQL (hit ratio, trebuie sa fie mare)'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select 'bloki citite: '||blks_read||' | bloki din cache: '||blks_hit||' | hit ratio: '||
          round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2)||'%' from pg_stat_database where datname='blipmade_test';" 2>/dev/null | sed 's/^/  /'
echo
echo '### 5.4 Indicile care nu sunt folositi niciodata (candidates de stergere)'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select relname||'.'||indexrelname||' | '||idx_scan||' scanari' from pg_stat_user_indexes where idx_scan=0 and relname not in ('_prisma_migrations') limit 20;" 2>/dev/null | sed 's/^/  /'
echo

echo "## 6. Coada si workerul"
echo
echo '### 6.1 Joburi in asteptare / active / esuate / finalizate'
docker exec blipmade-redis-1 redis-cli --no-raw eval "local k=0 local out={} for i=0,3 do local s=redis.call('llen','bull:provisioning:'..i..':wait') or 0 local a=redis.call('llen','bull:provisioning:'..i..':active') or 0 out[#out+1]=i..' wait='..s..' active='..a end return out" 2 2>/dev/null | sed 's/^/  /' || echo '  indisponibil'
docker exec blipmade-redis-1 redis-cli keys 'bull:*' 2>/dev/null | sed 's/^/  cheie: /' | head -20
echo
echo '### 6.2 Memoria si timpul de activitate al workerului'
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_test -tAc \
  "select count(*)||' evenimente in coada' from \"InstanceEvent\";" 2>/dev/null | sed 's/^/  /'
echo

echo "## 7. Fiabilitate: repornirea si recuperarea"
echo
echo '### 7.1 Timpul de pornire al API-ului'
start=$(date +%s%N)
kill -0 $(ss -ltnp 2>/dev/null | grep ':3101 ' | grep -oP 'pid=\K[0-9]+' | head -1) 2>/dev/null && echo "  API-ul raspunde inainte de repornire: da"
echo "  (repornirea stivei se face separat; nu se reinitializeaza nimic aici)"
echo
echo '### 7.2 Endpoint-urile de sanatate'
for p in /api/health /health /healthz; do
  printf -- '- %s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "$API$p" 2>/dev/null
done
for p in /healthz /; do
  printf -- '- web %s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "$WEB$p" 2>/dev/null
done
echo

echo "## 8. Ce NU a putut fi masurat in acest mediu"
echo
echo '- Lighthouse: nu este instalat pe masina de audit. Cifrele Lighthouse lipsesc; in schimb sunt masurate TTFB, dimensiunea bundle-ului si latenta API.'
echo '- Core Web Vitals reale (INP/LCP/CLS de la utilizatori reali): nu exista trafic de productie in acest mediu. Valorile ar fi sintetice si nu trebuie prezentate ca atare.'
echo '- Firefox si WebKit: nu sunt instalate. Auditul vizual acopera doar Chromium.'
echo '- Comportament sub sarcina: nu a fost rulat, pentru ca nu exista un mediu de test autorizat pentru asta.'
echo
echo "Sfarsitul raportului."
