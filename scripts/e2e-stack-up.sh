#!/usr/bin/env bash
# Brings up an isolated copy of the platform for the end to end test.
#
# The copy has its own database, its own index of Redis and its own ports, so
# nothing it does can reach the live database, the live queue or the live
# traffic. The worker is deliberately NOT started: the orders of the test
# stay in the state "awaiting payment" and no provisioning is ever attempted,
# so the test cannot create a server on the panel.
#
# Usage: scripts/e2e-stack-up.sh
set -euo pipefail

ROOT=/opt/blipmade
DB_NAME=blipmade_e2e_test
REDIS_INDEX=5
API_PORT=3103
WEB_PORT=3003
SMTP_PORT=2525
RUN_DIR=/tmp/blipmade-e2e
LOG_DIR="$RUN_DIR/logs"

mkdir -p "$RUN_DIR" "$LOG_DIR/mail" "$LOG_DIR" "$RUN_DIR/smtp"

# Stops whatever holds a port of the copy.
#
# The processes are found through the port they listen on and not through a
# pattern: the production containers run the same commands, so a pattern would
# stop the production worker as well.
kill_port() {
  local port="$1"
  local pids
  pids="$( { ss -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $NF}' \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; } || true )"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

# The processes of a previous run are stopped by their recorded process
# identifier, never by a pattern: a pattern would also match the shell that
# runs this script.
if [[ -f "$RUN_DIR/api.pid" ]]; then
  kill "$(cat "$RUN_DIR/api.pid")" 2>/dev/null || true
fi
if [[ -f "$RUN_DIR/web.pid" ]]; then
  kill "$(cat "$RUN_DIR/web.pid")" 2>/dev/null || true
fi
if [[ -f "$RUN_DIR/worker.pid" ]]; then
  kill "$(cat "$RUN_DIR/worker.pid")" 2>/dev/null || true
fi
if [[ -f "$RUN_DIR/smtp.pid" ]]; then
  kill "$(cat "$RUN_DIR/smtp.pid")" 2>/dev/null || true
fi
# The pattern is written so that it cannot match this shell: a sink that was
# left behind by an earlier run would keep the port and the new one could not
# listen on it.
kill_port "$SMTP_PORT"
kill_port "$API_PORT"
kill_port "$WEB_PORT"
kill_port 3101
sleep 3

cd "$ROOT/api"

if [[ ! -f dist/index.js ]]; then
  echo "==> building the api the way the image builds it"
  npx tsc -p tsconfig.json
fi

echo "==> creating the database $DB_NAME"
# FORCE closes the connections that a previous run of the copy left open, so
# the database of the test always starts empty.
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" >/dev/null
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null

echo "==> applying every migration to it"
set -a; . "$ROOT/.env"; set +a
HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
STAGING_URL="${HOST_URL%/*}/${DB_NAME}"
DATABASE_URL="$STAGING_URL" npx prisma migrate deploy --schema prisma/schema.prisma 2>&1 | tail -2

echo "==> seeding the catalog and the administrator"
ADMIN_EMAIL="e2e-admin@blipmade.test" \
ADMIN_PASSWORD="E2eAdminPassword9" \
DATABASE_URL="$STAGING_URL" \
npm run seed 2>&1 | tail -2

echo "==> starting the SMTP sink on port $SMTP_PORT"
# The sink keeps the messages that the platform really delivers through SMTP.
# The production platform has no relay yet, so this is the only way to prove
# that the delivery path works.
setsid nohup node "$ROOT/audit/_tools/smtp-sink.mjs" "$SMTP_PORT" "$RUN_DIR/smtp" > "$LOG_DIR/smtp.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/smtp.pid"
sleep 2

echo "==> starting the API on port $API_PORT"
set -a; . "$ROOT/.env"; set +a
DATABASE_URL="$STAGING_URL" \
REDIS_URL="redis://127.0.0.1:6379/$REDIS_INDEX" \
PORT="$API_PORT" \
HOST=127.0.0.1 \
NODE_ENV=production \
BACKUP_DIR="$LOG_DIR" \
APP_ORIGIN="http://127.0.0.1:$WEB_PORT" \
APP_PUBLIC_URL="http://127.0.0.1:$WEB_PORT" \
PUBLIC_WEB_URL="http://127.0.0.1:$WEB_PORT" \
SMTP_URL="smtp://127.0.0.1:$SMTP_PORT" \
  setsid nohup node dist/index.js > "$LOG_DIR/api.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/api.pid"

for _ in $(seq 1 40); do
  if curl -sS -m 2 -o /dev/null "http://127.0.0.1:$API_PORT/health/ready" 2>/dev/null; then break; fi
  sleep 1
done

echo "==> starting the web server on port $WEB_PORT"
cd "$ROOT/web"
API_URL="http://127.0.0.1:$API_PORT" \
SERVER_PORT="$WEB_PORT" \
TRUSTED_PROXY_IPS="" \
  setsid nohup node server.mjs > "$LOG_DIR/web.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/web.pid"

for _ in $(seq 1 40); do
  if curl -sS -m 2 -o /dev/null "http://127.0.0.1:$WEB_PORT/healthz" 2>/dev/null; then break; fi
  sleep 1
done

echo
echo "==> starting the worker on the same copy"
# The worker is needed because the mails of the platform travel through a
# queue. It cannot touch the panel: an order only reaches the provisioning
# when it is paid, and the payments are switched off in this copy, so no
# order can ever get an amount of zero and be confirmed automatically.
cd "$ROOT/api"
set -a; . "$ROOT/.env"; set +a
DATABASE_URL="$STAGING_URL" \
REDIS_URL="redis://127.0.0.1:6379/$REDIS_INDEX" \
NODE_ENV=production \
BACKUP_DIR="$LOG_DIR" \
APP_ORIGIN="http://127.0.0.1:$WEB_PORT" \
SMTP_URL="smtp://127.0.0.1:$SMTP_PORT" \
  setsid nohup node dist/worker.js > "$LOG_DIR/worker.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/worker.pid"
sleep 4

echo
echo "==> the stack is up"
curl -sS -m 5 -o /dev/null -w "    api  /health      -> %{http_code}\n" "http://127.0.0.1:$API_PORT/health"
curl -sS -m 8 -o /dev/null -w "    api  /health/ready -> %{http_code}\n" "http://127.0.0.1:$API_PORT/health/ready"
curl -sS -m 5 -o /dev/null -w "    web  /healthz     -> %{http_code}\n" "http://127.0.0.1:$WEB_PORT/healthz"
echo "    database  : $DB_NAME"
echo "    redis     : index $REDIS_INDEX"
echo "    mail sink : $LOG_DIR/mail"
echo "    smtp sink : 127.0.0.1:$SMTP_PORT -> $RUN_DIR/smtp"
echo "    the worker runs, but the payments are off, so no order can be confirmed"
