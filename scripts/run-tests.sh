#!/usr/bin/env bash
# Runs the API test suite against the dedicated test database.
#
# The suite truncates every table it touches, so it refuses to run against a
# database whose name does not end with "_test". This script builds that URL
# and points both the application and the migration step at it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/api"

# The suite runs with the credentials of the role of the suite. The password
# of the live database is not in the hands of the runner of the tests, and the
# role of the suite cannot connect to the live database even by accident.
if [[ -f .env.test ]]; then
  set -a; . ./.env.test; set +a
elif [[ -f ../.env.test ]]; then
  # The file of the scratch database sits at the root of the repository, and
  # the runner works from the directory of the API. Without this the file was
  # never read, the suite fell back to the credentials of the environment and
  # entered the scratch database as the owner of the live one.
  set -a; . ./../.env.test; set +a
fi

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

# The connection string of the suite comes from the file of its own, when
# that file is there. Without it, the connection string of the environment is
# used with the name of the scratch database.
TEST_URL="${TEST_DATABASE_URL:-${HOST_URL%/*}/$TEST_DB_NAME}"

# The suite runs on the host, so the name of the container of the database is
# the name of the host.
TEST_URL="${TEST_URL/@postgres:/@localhost:}"
TEST_URL="${TEST_URL/@redis:/@localhost:}"

if [[ "$TEST_URL" != *"/$TEST_DB_NAME" ]]; then
  echo "The connection string of the suite does not point at the scratch database." >&2
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
# The mail of a fixture of a test is written to the file transport, and the
# file transport writes into the directory of the mail of the platform. The
# retention of that directory then removes the mail of the customers as if it
# were old, and the operator reads thousands of fixtures instead of the
# messages of the platform. The suite gets a directory of its own, so a
# fixture of a test never touches the mail of the platform.
export BACKUP_DIR="${TEST_BACKUP_DIR:-/var/tmp/blipmade-test-backup}"
mkdir -p "$BACKUP_DIR/mail"

# The receipts of the backups are the state of the operations, and the
# platform reads them to know whether the backup of the night happened. The
# suite runs the scripts of the backups, so without this the suite writes the
# receipts of its own run over the receipts of the platform, and the platform
# reads the receipts of a test as if they were the receipts of the night.
export OPS_STATUS_DIR="${TEST_OPS_STATUS_DIR:-/var/tmp/blipmade-test-backup/status}"
mkdir -p "$OPS_STATUS_DIR"
export COOKIE_SECURE=false

# The gateway of the platform is never called by the suite. The routes of the
# customers are written into the configuration of a real Caddy, and the suite
# must not touch the configuration of the edge of the production. The tests
# that exercise the gateway bring their own address and their own token.
export CADDY_ADMIN_URL=""
export CADDY_ADMIN_TOKEN=""

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
