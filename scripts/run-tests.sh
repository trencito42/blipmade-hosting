#!/usr/bin/env bash
# Runs the API test suite against the dedicated test database.
#
# The suite truncates every table it touches, so it refuses to run against a
# database whose name does not end with "_test". This script builds that URL
# and points both the application and the migration step at it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/api"

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
elif [[ -f ../.env ]]; then
  set -a; . ./../.env; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and no .env was found." >&2
  exit 1
fi

# The compose network hostnames only resolve inside the containers.
HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
TEST_URL="$(echo "$HOST_URL" | sed -E 's#/([^/?]+)$#/blipmade_test#')"

if [[ "$TEST_URL" != *"/blipmade_test" ]]; then
  echo "Could not derive the test database URL from DATABASE_URL." >&2
  exit 1
fi

export DATABASE_URL="$TEST_URL"
export TEST_DATABASE_URL="$TEST_URL"
# The compose network hostnames only resolve inside the containers.
export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis:\/\/localhost:}"
export NODE_ENV=test
export LOG_LEVEL="${LOG_LEVEL:-silent}"
export STRIPE_SECRET_KEY=""
export STRIPE_WEBHOOK_SECRET=""
export STRIPE_PUBLISHABLE_KEY=""
export SMTP_URL=""
export COOKIE_SECURE=false

# The Prisma client is generated from the schema, so it is generated again
# before the suite runs. A client of an older schema would fail at runtime
# with an error that has nothing to do with the test.
echo "==> Generating the Prisma client"
npx prisma generate

echo "==> Running the test suite against blipmade_test"
exec npx vitest run "$@"
