#!/usr/bin/env bash
# The isolated stack of the round three operational audit.
#
# The stack is a copy of the platform that runs beside the live one. It has:
#
#   * its own database     : blipmade_r3_ops_test
#   * its own Redis index  : 14
#   * its own ports        : 3113 (api), 3013 (web), 2625 (smtp sink),
#                            2619 (the stand-in for the Caddy admin API)
#   * its own directory    : /tmp/blipmade-r3
#
# The live database, the live Redis index, the live containers and the files of
# /opt/blipmade are never written. The environment of the platform is read
# from /opt/blipmade/.env (read only), because the session secret and the
# password of the database are needed to start the API. Every variable that
# points at something is overridden afterwards, and the keys of Stripe, of the
# panel and of the bridge are emptied, so the copy cannot reach them.
#
# The processes are stopped by the port they listen on (ss -tlnp) and never by
# a pattern: the containers of the production run the same commands.
#
# The index of Redis of the copy must not be the index of the test suite. A
# worker that runs on the index of the suite takes its jobs away before the
# test can read them, which shows up as tests that fail for no reason. The
# same warning is in scripts/run-tests.sh.
#
# Usage:
#   audit/_tools/r3-stack-up.sh [--no-smtp] [--with-caddy] [--no-dns-stub]
#
#   --no-smtp      SMTP_URL stays empty, so the platform uses the file transport
#   --with-caddy   a stand-in for the Caddy admin API is started and
#                  CADDY_ADMIN_URL / CADDY_ADMIN_TOKEN are pointed at it
#   --no-dns-stub  the resolver of the platform is not replaced by the stub
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DB_NAME=blipmade_r3_ops_test
REDIS_INDEX=14
API_PORT=3113
WEB_PORT=3013
SMTP_PORT=2625
CADDY_PORT=2619
WORKER_PORT=3114
RUN_DIR=/tmp/blipmade-r3
LOG_DIR="$RUN_DIR/logs"
ENV_FILE=/opt/blipmade/.env

SMTP_MODE=smtp
CADDY_MODE=empty
DNS_STUB=1

for argument in "$@"; do
  case "$argument" in
    --no-smtp) SMTP_MODE=file ;;
    --with-caddy) CADDY_MODE=stub ;;
    --no-dns-stub) DNS_STUB=0 ;;
    *) echo "unknown argument: $argument" >&2; exit 2 ;;
  esac
done

mkdir -p "$RUN_DIR" "$LOG_DIR/mail" "$RUN_DIR/smtp"

# The captures of an earlier run are moved out of the way, so the evidence of
# one run is never mixed with the evidence of another one.
mkdir -p "$RUN_DIR/previous"
for old in "$RUN_DIR"/smtp/*.eml "$LOG_DIR"/mail/*.json; do
  [[ -e "$old" ]] || continue
  mv "$old" "$RUN_DIR/previous/" 2>/dev/null || true
done

# Stops whatever holds a port of the copy. The processes are found through the
# port they listen on and not through a pattern.
kill_port() {
  local port="$1" pids
  pids="$( { ss -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $NF}' \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; } || true )"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

for port in "$API_PORT" "$WEB_PORT" "$SMTP_PORT" "$CADDY_PORT" "$WORKER_PORT"; do
  kill_port "$port"
done
sleep 2

# ---------------------------------------------------------------------------
# The environment of the copy.
#
# The file of the platform is read, never written. Everything that points at
# the live service is replaced afterwards. The values of the audit are set
# after the file was read, so they cannot be overwritten by it.
# ---------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "The environment file $ENV_FILE was not found." >&2
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

export NODE_ENV=production
export HOST=127.0.0.1
export PORT="$API_PORT"
export WORKER_HEALTH_PORT="$WORKER_PORT"
export WORKER_URL="http://127.0.0.1:$WORKER_PORT"

# The database of the copy and the index of Redis of the copy.
export DATABASE_URL="${DATABASE_URL/@postgres:/@localhost:}"
export DATABASE_URL="${DATABASE_URL%/*}/$DB_NAME"
export REDIS_URL="redis://127.0.0.1:6379/$REDIS_INDEX"

# The public address of the copy.
export APP_ORIGIN="http://127.0.0.1:$WEB_PORT"
export APP_PUBLIC_URL="http://127.0.0.1:$WEB_PORT"
export PUBLIC_WEB_URL="http://127.0.0.1:$WEB_PORT"
export COOKIE_SECURE=false
export TRUSTED_PROXIES="127.0.0.1,::1"

# The copy must never reach the outside world on its own.
export PAYMENTS_ENABLED=false
export STRIPE_SECRET_KEY=""
export STRIPE_WEBHOOK_SECRET=""
export STRIPE_PUBLISHABLE_KEY=""
export PTERODACTYL_URL=""
export PTERODACTYL_APP_KEY=""
export PTERODACTYL_CLIENT_KEY=""
export PANEL_KEYMINT_URL=""
export PANEL_KEYMINT_SECRET=""

# The files of the copy stay in its own directory.
export BACKUP_DIR="$LOG_DIR"

# The mail: a relay that is the local sink, or no relay at all.
if [[ "$SMTP_MODE" == "smtp" ]]; then
  export SMTP_URL="smtp://127.0.0.1:$SMTP_PORT"
else
  export SMTP_URL=""
fi

# The gateway: nothing, or the stand-in for the Caddy admin API.
if [[ "$CADDY_MODE" == "stub" ]]; then
  export CADDY_ADMIN_URL="http://127.0.0.1:$CADDY_PORT"
  export CADDY_ADMIN_TOKEN="r3-audit-caddy-token"
else
  export CADDY_ADMIN_URL=""
  export CADDY_ADMIN_TOKEN=""
fi

# The accounts of the audit. They are set after the file of the platform was
# read, so the copy never uses the account of the production.
export ADMIN_EMAIL="r3-admin@blipmade.test"
export ADMIN_PASSWORD="R3AuditAdminPassword9"

# ---------------------------------------------------------------------------
# The database of the copy.
# ---------------------------------------------------------------------------
cd "$ROOT/api"
if [[ ! -f dist/index.js ]]; then
  echo "==> Building the api the way the image builds it"
  npm run build 2>&1 | tail -2
fi

echo "==> Creating the database $DB_NAME"
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" >/dev/null
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null

echo "==> Applying every migration to it"
npx prisma migrate deploy --schema prisma/schema.prisma 2>&1 | tail -2

echo "==> Seeding the catalog and the administrator"
npm run seed 2>&1 | tail -2

# ---------------------------------------------------------------------------
# The processes of the copy.
# ---------------------------------------------------------------------------
echo "==> Starting the SMTP sink on port $SMTP_PORT"
setsid nohup node "$ROOT/audit/_tools/smtp-sink.mjs" "$SMTP_PORT" "$RUN_DIR/smtp" \
  > "$LOG_DIR/smtp.log" 2>&1 < /dev/null &
sleep 2

if [[ "$CADDY_MODE" == "stub" ]]; then
  echo "==> Starting the stand-in for the Caddy admin API on port $CADDY_PORT"
  setsid nohup node "$ROOT/audit/_tools/r3-caddy-admin-stub.mjs" "$CADDY_PORT" "$RUN_DIR/caddy-admin.json" "$CADDY_ADMIN_TOKEN" \
    > "$LOG_DIR/caddy-admin.log" 2>&1 < /dev/null &
  sleep 1
fi

# The resolver of the platform is replaced by a stub when it is asked for, so
# the proof of ownership of a hostname can be satisfied without publishing a
# real TXT record. Everything else is the real code of the platform.
API_START=(node)
if [[ "$DNS_STUB" -eq 1 ]]; then
  API_START+=(--import "file://$ROOT/audit/_tools/r3-dns-stub.mjs")
fi

echo "==> Starting the API on port $API_PORT"
setsid nohup "${API_START[@]}" dist/index.js > "$LOG_DIR/api.log" 2>&1 < /dev/null &
for _ in $(seq 1 40); do
  if curl -sS -m 2 -o /dev/null "http://127.0.0.1:$API_PORT/health/ready" 2>/dev/null; then break; fi
  sleep 1
done

echo "==> Starting the web server on port $WEB_PORT"
cd "$ROOT/web"
if [[ ! -f dist/index.html ]]; then
  echo "    building the web application"
  npm run build 2>&1 | tail -3
fi
API_URL="http://127.0.0.1:$API_PORT" SERVER_PORT="$WEB_PORT" TRUSTED_PROXY_IPS="" \
  setsid nohup node server.mjs > "$LOG_DIR/web.log" 2>&1 < /dev/null &
for _ in $(seq 1 40); do
  if curl -sS -m 2 -o /dev/null "http://127.0.0.1:$WEB_PORT/healthz" 2>/dev/null; then break; fi
  sleep 1
done

echo "==> Starting the worker on the same copy"
cd "$ROOT/api"
setsid nohup "${API_START[@]}" dist/worker.js > "$LOG_DIR/worker.log" 2>&1 < /dev/null &
sleep 4

echo
echo "==> The stack is up"
curl -sS -m 5 -o /dev/null -w "    api  /health      -> %{http_code}\n" "http://127.0.0.1:$API_PORT/health" || true
curl -sS -m 8 -o /dev/null -w "    api  /health/ready -> %{http_code}\n" "http://127.0.0.1:$API_PORT/health/ready" || true
curl -sS -m 5 -o /dev/null -w "    web  /healthz     -> %{http_code}\n" "http://127.0.0.1:$WEB_PORT/healthz" || true
echo "    database  : $DB_NAME"
echo "    redis     : index $REDIS_INDEX"
echo "    mail      : transport ${SMTP_MODE} (smtp sink 127.0.0.1:$SMTP_PORT -> $RUN_DIR/smtp)"
echo "    gateway   : $CADDY_MODE (CADDY_ADMIN_URL='$CADDY_ADMIN_URL')"
echo "    dns stub  : $([[ "$DNS_STUB" -eq 1 ]] && echo on || echo off)"
echo "    files     : $LOG_DIR"
