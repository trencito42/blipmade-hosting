#!/usr/bin/env bash
# Applies the pending migrations of the release to the live database.
#
# The target is refused unless the name of the database is exactly the live
# one, so a mistyped variable can never point this at a test database or at
# anything else.
set -euo pipefail

cd /opt/blipmade/api

if [[ -z "${DATABASE_URL:-}" && -f ../.env ]]; then
  set -a; . ./../.env; set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
BASE_URL="${HOST_URL%/*}"
DB_NAME="${HOST_URL##*/}"

if [[ "$DB_NAME" != "blipmade" ]]; then
  echo "REFUSED: the target database is '$DB_NAME', not 'blipmade'." >&2
  echo "         Nothing was changed." >&2
  exit 9
fi

echo "==> target database: $DB_NAME (on the live cluster)"
echo "==> migrations before:"
psql "$HOST_URL" -At -c "select migration_name from \"_prisma_migrations\" where finished_at is not null order by finished_at;" | sed 's/^/    /'

echo
echo "==> applying the pending migrations"
# Prisma reads the connection string from the environment, and the value of
# the environment file points at the name of the container. The migration
# runs from the host, so the address of the host is what it must use.
export DATABASE_URL="$HOST_URL"
npx prisma migrate deploy --schema prisma/schema.prisma

echo
echo "==> migrations after:"
psql "$HOST_URL" -At -c "select migration_name from \"_prisma_migrations\" where finished_at is not null order by finished_at;" | sed 's/^/    /'
echo "    total: $(psql "$HOST_URL" -At -c "select count(*) from \"_prisma_migrations\" where finished_at is not null;")"
echo "    failed migrations: $(psql "$HOST_URL" -At -c "select count(*) from \"_prisma_migrations\" where finished_at is null or rolled_back_at is not null;")"

echo
echo "==> the data is still there"
for t in User Order Product Payment Invoice Instance AuditLog Session; do
  printf "    %-10s %s\n" "$t" "$(psql "$HOST_URL" -At -c "select count(*) from \"$t\";")"
done
