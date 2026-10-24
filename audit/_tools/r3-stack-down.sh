#!/usr/bin/env bash
# Takes the isolated copy of the round three audit down again.
#
# The copy is removed completely: the processes, the database and the index of
# Redis it used. The live database, the live queue and the live containers are
# never touched.
#
# The processes are found through the port they listen on and never through a
# pattern: a pattern would also match the worker of the production.
#
# Usage: audit/_tools/r3-stack-down.sh
set -uo pipefail

DB_NAME=blipmade_r3_ops_test
REDIS_INDEX=14
API_PORT=3113
WEB_PORT=3013
SMTP_PORT=2625
CADDY_PORT=2619
WORKER_PORT=3114
RUN_DIR=/tmp/blipmade-r3

kill_port() {
  local port="$1" pids
  pids="$( { ss -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $NF}' \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; } || true )"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

echo "==> Stopping the copy"
for port in "$API_PORT" "$WEB_PORT" "$SMTP_PORT" "$CADDY_PORT" "$WORKER_PORT"; do
  kill_port "$port"
done
sleep 3

echo "==> Dropping the database of the copy"
docker exec blipmade-postgres-1 psql -U blipmade -d postgres -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" 2>&1 | grep -v NOTICE || true

echo "==> Emptying the index of Redis it used"
docker exec blipmade-redis-1 redis-cli -n "$REDIS_INDEX" FLUSHDB >/dev/null 2>&1 || true

echo
echo "==> What is left"
printf "    the live database : %s users\n" "$(docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -At -c 'select count(*) from "User";' 2>/dev/null)"
printf "    the live queue    : %s keys\n" "$(docker exec blipmade-redis-1 redis-cli -n 0 DBSIZE 2>/dev/null)"
printf "    the copy database : %s\n" "$(docker exec blipmade-postgres-1 psql -U blipmade -d postgres -At -c "select count(*) from pg_database where datname = '$DB_NAME';" 2>/dev/null)"
docker ps --format "    {{.Names}}|{{.Status}}" | sort
