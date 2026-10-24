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

# The name of the database the suite runs against. The default is the shared
# test database. A second name lets the suite run while another process is
# using the shared one, which is what the auditors need: the fixtures of the
# suite and the fixtures of an audit must not land in the same tables.
#
# The name must end with "_test", so the suite can never be pointed at the
# live database.
TEST_DB_NAME="${TEST_DB_NAME:-blipmade_test}"

if [[ "$TEST_DB_NAME" != *_test ]]; then
  echo "The test database name must end with _test. Refusing to run." >&2
  exit 1
fi

TEST_URL="${HOST_URL%/*}/$TEST_DB_NAME"

if [[ "$TEST_URL" != *"/$TEST_DB_NAME" ]]; then
  echo "Could not derive the test database URL from DATABASE_URL." >&2
  exit 1
fi

export DATABASE_URL="$TEST_URL"
export TEST_DATABASE_URL="$TEST_URL"
# The compose network hostnames only resolve inside the containers.
export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis:\/\/localhost:}"
# The suite gets a database of Redis of its own. The database 0 belongs to the
# application on a development machine: the worker of the platform consumes the
# jobs of the queue from there, so a job of the suite would be taken away before
# the test could read it. The database 1 is the one of the suite.
# Any index already written in the URL is removed first, so the URL cannot end
# up with two paths.
if [[ "$REDIS_URL" =~ ^(.+)/[0-9]+$ ]]; then
  REDIS_URL="${BASH_REMATCH[1]}"
fi
export REDIS_URL="${REDIS_URL}/${TEST_REDIS_DB:-1}"
export NODE_ENV=test
export LOG_LEVEL="${LOG_LEVEL:-silent}"
# The suite runs against the local gateway of Stripe, so the flows of the
# payments can be checked without a key. The gateway is never used when
# NODE_ENV is "production", so it cannot reach a live site.
export STRIPE_TEST_MODE=true
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
npx vitest run "$@"

# The rules of the routing of the session live in the web application and are
# checked with the test runner of Node, without a browser and without a
# database.
echo "==> Running the web tests"
cd "$ROOT/web"
node --test --experimental-strip-types tests/*.test.ts tests/*.test.mjs
