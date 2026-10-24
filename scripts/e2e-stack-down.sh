#!/usr/bin/env bash
# Takes the isolated copy of the platform down again.
#
# The copy is removed completely: the processes, the database and the index of
# Redis it used. The live database, the live queue and the live containers are
# never touched.
#
# Usage: scripts/e2e-stack-down.sh
set -uo pipefail

ROOT=/opt/blipmade
DB_NAME=blipmade_e2e_test
REDIS_INDEX=5
API_PORT=3103
WEB_PORT=3003
SMTP_PORT=2525
RUN_DIR=/tmp/blipmade-e2e

kill_port() {
  local port="$1"
  local pids
  pids="$( { ss -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $NF}' \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; } || true )"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

echo "==> stopping the copy"
for file in api web worker smtp; do
  if [[ -f "$RUN_DIR/$file.pid" ]]; then
    kill "$(cat "$RUN_DIR/$file.pid")" 2>/dev/null || true
  fi
done
kill_port "$API_PORT"
kill_port "$WEB_PORT"
kill_port "$SMTP_PORT"
# The worker of the copy listens on the port of its health check.
kill_port 3101
sleep 3

echo "==> dropping the database of the copy"
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" 2>&1 | grep -v NOTICE || true

echo "==> emptying the index of Redis it used"
docker exec blipmade-redis-1 redis-cli -n "$REDIS_INDEX" FLUSHDB >/dev/null 2>&1 || true

echo
echo "==> what is left"
printf "    the live database : %s\n" "$(docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -At -c "select count(*) from \"User\";" 2>/dev/null) users"
printf "    the live queue    : %s keys\n" "$(docker exec blipmade-redis-1 redis-cli -n 0 DBSIZE 2>/dev/null)"
docker ps --format "    {{.Names}}|{{.Status}}" | sort
