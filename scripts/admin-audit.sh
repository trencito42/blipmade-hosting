#!/usr/bin/env bash
# Opens every screen of the back office in a real browser against a DISPOSABLE stack.
#
#   DATABASE_URL  a local database whose name contains "test" or "audit" (the seed refuses anything else)
#   REDIS_URL     a disposable redis
#   plus the variables the API needs to start (see ~/ci.env on the build machine)
#
# It builds nothing for production, starts the API and the web server on spare ports, seeds an
# administrator, runs web/e2e/admin-audit.spec.ts and writes the report to $AUDIT_OUT.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a disposable database}"
: "${REDIS_URL:?set REDIS_URL to a disposable redis}"
API_PORT="${AUDIT_API_PORT:-3290}"
WEB_PORT="${AUDIT_WEB_PORT:-30291}"
export AUDIT_OUT="${AUDIT_OUT:-$PWD/admin-audit-out}"
export AUDIT_SEED="${AUDIT_SEED:-$AUDIT_OUT/seed.json}"
export AUDIT_SEED_OUT="$AUDIT_SEED"
mkdir -p "$AUDIT_OUT"

(cd api && npx prisma migrate deploy >/dev/null && npx tsx scripts/admin-audit-seed.ts)

# The processes are found through the port they listen on and not through a pattern: the
# production containers run the same commands, and `npx` starts the real server as a child of a child.
kill_port() {
  local pids
  pids="$( { ss -tlnp 2>/dev/null | awk -v p=":$1" '$4 ~ p {print $NF}' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; } || true )"
  for pid in $pids; do kill "$pid" 2>/dev/null || true; done
}
cleanup() { kill_port "$API_PORT"; kill_port "$WEB_PORT"; }
trap cleanup EXIT
cleanup

(cd api && PORT="$API_PORT" HOST=127.0.0.1 WORKER_HEALTH_PORT=0 npx tsx src/index.ts >"$AUDIT_OUT/api.log" 2>&1) &
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fs "http://127.0.0.1:$API_PORT/api/health" >/dev/null || { echo "the API did not start"; tail -30 "$AUDIT_OUT/api.log"; exit 1; }

(cd web && SERVER_PORT="$WEB_PORT" API_URL="http://127.0.0.1:$API_PORT" node server.mjs >"$AUDIT_OUT/web.log" 2>&1) &
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break; sleep 1; done

cd web
E2E_BASE_URL="http://127.0.0.1:$WEB_PORT" npx playwright test e2e/admin-audit.spec.ts --project=desktop
