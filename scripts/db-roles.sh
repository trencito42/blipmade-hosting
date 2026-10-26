#!/usr/bin/env bash
# Creates the roles of the platform and the privileges that keep them apart.
#
# Until now the whole cluster had one role, and it was a superuser. The
# platform, the suite of the tests and the scripts of the backups all entered
# with the same credentials, so a command that was meant for a scratch
# database could reach the live one. That is how the live database of the
# platform was emptied on 2026-10-26.
#
# From now on there are three:
#
#   blipmade       the owner of the live database. It applies the migrations
#                  and restores the backups. The scripts of the host use it.
#   blipmade_app   what the platform uses. It reads and writes the rows and
#                  it cannot change the schema, so `prisma migrate reset` and
#                  `prisma db push --force-reset` fail at the database itself,
#                  before anything is destroyed.
#   blipmade_test  what the suite uses. It owns the scratch databases and it
#                  cannot even connect to the live one.
#
# The names of the roles and the passwords come from the environment, so no
# secret is written in this file and none is printed by it.
#
# Usage:
#   APP_DATABASE_URL=... TEST_DATABASE_URL=... scripts/db-roles.sh
#
# The script is idempotent: it can be run again after a change.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL (the owner of the live database) is not set." >&2
  exit 1
fi
if [[ -z "${APP_DATABASE_URL:-}" || -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "APP_DATABASE_URL and TEST_DATABASE_URL have to be set." >&2
  exit 1
fi

HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
BASE_URL="${HOST_URL%/*}"

# The user and the password are the part of the connection string between
# the scheme and the "@".
app_userinfo="${APP_DATABASE_URL#*://}"
app_userinfo="${app_userinfo%%@*}"
APP_ROLE="${app_userinfo%%:*}"
APP_PASSWORD="${app_userinfo#*:}"

test_userinfo="${TEST_DATABASE_URL#*://}"
test_userinfo="${test_userinfo%%@*}"
TEST_ROLE="${test_userinfo%%:*}"
TEST_PASSWORD="${test_userinfo#*:}"

APP_ROLE="${APP_ROLE:-blipmade_app}"
TEST_ROLE="${TEST_ROLE:-blipmade_test}"

if [[ "$APP_ROLE" == "$TEST_ROLE" || "$APP_ROLE" == "blipmade" || "$TEST_ROLE" == "blipmade" ]]; then
  echo "The roles have to be three different names." >&2
  exit 1
fi

# The passwords are hexadecimal, so they never need to be quoted.
if ! [[ "$APP_PASSWORD" =~ ^[0-9a-f]+$ ]] || ! [[ "$TEST_PASSWORD" =~ ^[0-9a-f]+$ ]]; then
  echo "The passwords have to be hexadecimal." >&2
  exit 1
fi

echo "==> Creating the roles and the privileges"

psql "$HOST_URL" -v ON_ERROR_STOP=1 -q <<SQL
-- The role of the platform: it reads and writes, and it changes nothing.
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$APP_ROLE') THEN
    CREATE ROLE $APP_ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
\$\$;
ALTER ROLE $APP_ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$APP_PASSWORD';

-- The role of the suite: it owns the scratch databases and nothing else.
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$TEST_ROLE') THEN
    CREATE ROLE $TEST_ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
\$\$;
ALTER ROLE $TEST_ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$TEST_PASSWORD';

-- The live database belongs to the owner alone. The role of the platform may
-- connect to it, and the role of the suite may not.
REVOKE ALL ON DATABASE blipmade FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE blipmade TO $APP_ROLE;

-- The scratch database belongs to the role of the suite. The role of the
-- platform may not connect to it.
REVOKE ALL ON DATABASE blipmade_test FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE blipmade_test TO $TEST_ROLE;
REVOKE ALL ON DATABASE blipmade_test FROM $APP_ROLE;

-- The rows of the live database: read, write, and the schema is not touched.
GRANT USAGE ON SCHEMA public TO $APP_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $APP_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $APP_ROLE;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $APP_ROLE;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO $APP_ROLE;

-- The scratch database belongs to the role of the suite, so the suite may
-- build its schema there and drop it again.
ALTER DATABASE blipmade_test OWNER TO $TEST_ROLE;
SQL

echo "==> The roles are in place"
echo "    $APP_ROLE: the rows of the live database, and nothing else"
echo "    $TEST_ROLE: the scratch databases, and nothing else"
echo "    blipmade:  the owner, the migrations and the restores"
