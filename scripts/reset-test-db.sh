#!/usr/bin/env bash
# Resets a TEST database and never a live one.
#
# The suite of the platform and the drills of the backups need a database
# that can be thrown away and built again. `prisma migrate reset` does exactly
# that, and it does it on the database of the url it is given: it drops the
# schema, applies the migrations again and writes the catalog.
#
# On 2026-10-26 that command was run with a url that pointed at the live
# database of the platform. The schema was dropped, the catalog was written
# again, and every row of every customer was gone: five services, four
# accounts, ten orders, a ticket and seven hundred entries of the audit
# trail. The platform was put back from the backup of the night.
#
# This script is the way to reset a database from now on. It refuses any
# database whose name does not say that it is a scratch one, and it prints
# the name of the database it is about to touch before it touches it.
#
# Usage: scripts/reset-test-db.sh [database name]
#        (the default is the name of TEST_DATABASE_URL, else blipmade_test)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The names a scratch database may have.
SCRATCH_NAME='(_test|_drill|_scratch|_check)$'

# The configuration. A value that is already in the environment wins over the
# file of the host, so a drill can be pointed at another database without
# changing anything.
source "$ROOT/scripts/lib/load-env.sh"
load_env_file "$ROOT/.env"
if [[ -f "$ROOT/.env.test" ]]; then
  load_env_file "$ROOT/.env.test"
fi

# The scratch database belongs to the role of the suite, and it is reset with
# the credentials of that role. The objects of its schema then belong to it
# too, and a migration that changes an enumeration can be applied by the suite
# itself: PostgreSQL only lets the owner of a type add a value to it, and the
# suite is the owner of the scratch database.
BASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$BASE_URL" ]]; then
  echo "TEST_DATABASE_URL and DATABASE_URL are not set, and no .env was found." >&2
  exit 1
fi

# The script runs on the host, and the url of the platform names the container
# of the database. The address of the host is what it must use.
BASE_URL="${BASE_URL/@postgres:/@localhost:}"
BASE_URL="${BASE_URL/@redis:/@localhost:}"

# The name of the database of the url. It is read from the url itself and
# not from the part before it: the scheme of the url holds a slash of its
# own, and the name would be read from the wrong place.
DATABASE_NAME="${BASE_URL##*/}"
DATABASE_NAME="${DATABASE_NAME%%\?*}"

# The name that was asked for wins over the one of the url.
REQUESTED="${1:-${TEST_DATABASE_NAME:-$DATABASE_NAME}}"

if ! [[ "$REQUESTED" =~ $SCRATCH_NAME ]]; then
  cat >&2 <<EOF
Refusing to reset "$REQUESTED".

The database of the platform is named "blipmade", and resetting it drops the
schema of the platform and writes the catalog again: every account, every
order and every service of the customers is gone, and the platform has to be
put back from a backup.

Only a database whose name ends with _test, _drill, _scratch or _check may
be reset. To reset the live database on purpose, use the restore from a
backup instead: scripts/restore.sh <archive> --yes
EOF
  exit 1
fi

# The guard of the platform asks the same question and reads the list of the
# suffixes from one place, so this script and the module cannot drift apart.
(cd "$ROOT/api" && npx tsx ../scripts/lib/assert-disposable-db.ts --name "$REQUESTED" --label "reset the database")

# The url of the database that is asked for.
TARGET_URL="${BASE_URL%/*}/${REQUESTED}"

echo "==> The database that is about to be reset: $REQUESTED"
echo "    every row in it is lost, and it is rebuilt from the migrations."

export DATABASE_URL="$TARGET_URL"
cd "$ROOT/api"

exec npx prisma migrate reset --force --schema prisma/schema.prisma
