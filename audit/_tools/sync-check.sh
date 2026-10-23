#!/usr/bin/env bash
# Rebuilds the isolated check stack on the VM from the mirror and restarts it.
# The production containers are never touched: the copy lives in /tmp and runs
# against the test database.
set -euo pipefail

MIRROR=/root/blipmade-work
VM=debian@10.77.0.13
KEY=/root/.ssh/blipmade_vm103
ENVFILE=/tmp/check-env.sh

cat > "$ENVFILE" <<'SH'
# The environment of the check stack: the test database and the test
# configuration. The production database is never used here.
set -a
. /opt/blipmade/.env
set +a
DATABASE_URL="${DATABASE_URL/@postgres:/@localhost:}"
DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#/[^/?]+$#/blipmade_test#')"
export DATABASE_URL
export TEST_DATABASE_URL="$DATABASE_URL"
export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis:\/\/localhost:}"
# The check stack is shared by several auditors at the same time, and they all
# sign in from the same address, so the limit of the sign-in attempts is
# raised here. It never touches the production environment.
export LOGIN_RATE_LIMIT_MAX=500
export NODE_ENV=test
export LOG_LEVEL=silent
export PORT=3101
export HOST=127.0.0.1
export STRIPE_TEST_MODE=true
export STRIPE_SECRET_KEY=""
export STRIPE_WEBHOOK_SECRET=""
export STRIPE_PUBLISHABLE_KEY=""
export SMTP_URL=""
export COOKIE_SECURE=false
SH

echo "== copying the mirror"
cd "$MIRROR"
tar cf - --exclude=node_modules --exclude=dist api web scripts | ssh -i "$KEY" "$VM" 'rm -rf /tmp/check && mkdir -p /tmp/check && tar xf - -C /tmp/check'
scp -i "$KEY" "$ENVFILE" "$VM:/tmp/check/env.sh"

ssh -i "$KEY" "$VM" 'bash -s' <<'SH'
set -euo pipefail
cd /tmp/check
ln -sfn /opt/blipmade/api/node_modules api/node_modules
ln -sfn /opt/blipmade/web/node_modules web/node_modules
rm -rf /tmp/api-check /tmp/web-check
mv api /tmp/api-check
mv web /tmp/web-check
cp /tmp/check/env.sh /tmp/api-check/env.sh

echo "== building the api"
cd /tmp/api-check
npx tsc -p tsconfig.json

echo "== building the web"
cd /tmp/web-check
npx tsc --noEmit
npx vite build > /tmp/web-build.log 2>&1
tail -2 /tmp/web-build.log

echo "== restarting"

# The check stack must never reach the production API. The production API
# listens on 3100 on the loopback interface; a web instance pointed at it
# writes every sign-in, every ticket and every order into the live database.
# An earlier version of this script started one such instance on 30002 and
# four fixture accounts were created in production before it was noticed.
#
# The address of the API of the check stack is written once, here, and the
# guard checks that very value. A typo in the start lines below cannot reach
# the live data, because the start lines read the address from this variable.
CHECK_API_URL="http://127.0.0.1:3101"

case "$CHECK_API_URL" in
  *":3100"*|*"production"*|*"blipmade.com"*)
    echo "The check stack would point at the production API. Refusing to start." >&2
    exit 1
    ;;
esac

for port in 30002 30003 3101; do
  pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
done
sleep 1
cd /tmp/api-check && . ./env.sh && (setsid node dist/index.js > /tmp/api-new.log 2>&1 < /dev/null &)
cd /tmp/web-check && (SERVER_PORT=30002 API_URL="$CHECK_API_URL" setsid node server.mjs > /tmp/web-live.log 2>&1 < /dev/null &)
cd /tmp/web-check && (SERVER_PORT=30003 API_URL="$CHECK_API_URL" setsid node server.mjs > /tmp/web-new.log 2>&1 < /dev/null &)
sleep 6
echo -n "api:        "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3101/api/health
echo -n "web live:   "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30002/
echo -n "web new:    "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30003/
SH
echo "== done"
