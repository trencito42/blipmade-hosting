#!/usr/bin/env bash
# Stiva izolată de măsurători, construită din ramura de reparare.
#
# Baza de date este aleasă prin perf-db.sh, care verifică numele bazei înainte
# de orice scriere: o eroare de adresare nu poate ajunge la baza vie.
set -euo pipefail

ROOT=/home/debian/bm-phase14
DB="${1:-blipmade_perf_test}"

cd "$ROOT"
# Sursa mediului din fisierul de configuratie al proiectului.
set -a
# shellcheck disable=SC1091
source ./.env
set +a
# shellcheck disable=SC1091
source ./perf-db.sh "$DB"

REDIS_HELPER="$ROOT/audit/_tools/redis-db-url.py"
[ -f "$REDIS_HELPER" ] || REDIS_HELPER=/opt/blipmade/audit/_tools/redis-db-url.py
export REDIS_URL="$(python3 "$REDIS_HELPER" "$REDIS_URL" 127.0.0.1 2)"
export NODE_ENV=production PORT=3106 HOST=127.0.0.1
export APP_ORIGIN=http://127.0.0.1:30020 APP_PUBLIC_URL=http://127.0.0.1:30020
export TRUSTED_PROXIES=127.0.0.1,::1
export SMTP_URL= COOKIE_SECURE=false LOG_LEVEL=info
export STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_PUBLISHABLE_KEY=
export PAYMENTS_ENABLED=false

# Oprirea stivei vechi, ca sa nu ramana doua procese pe aceleasi porturi.
pkill -f "node dist/index.js" 2>/dev/null || true
pkill -f "node server.mjs" 2>/dev/null || true
sleep 1

cd "$ROOT/api"
setsid nohup node dist/index.js > /tmp/perf-api.log 2>&1 < /dev/null &
echo "api pid $!"

sleep 4

cd "$ROOT/web"
API_URL=http://127.0.0.1:3106 SERVER_PORT=30020 TRUSTED_PROXY_IPS=127.0.0.1 \
  setsid nohup node server.mjs > /tmp/perf-web.log 2>&1 < /dev/null &
echo "web pid $!"
