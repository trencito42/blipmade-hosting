#!/usr/bin/env bash
# Applies the pending migrations of the release to the live database.
#
# The target is refused unless the name of the database is exactly the live
# one, so a mistyped variable can never point this at a test database or at
# anything else.
set -euo pipefail

cd /opt/blipmade/api

# The migrations change the schema, so they need the credentials of the
# owner of the database. The role the platform uses cannot do that, and that
# is what keeps a destructive command away from the live database.
if [[ -z "${DATABASE_URL:-}" && -f ../.env.db-admin ]]; then
  set -a; . ./../.env.db-admin; set +a
fi
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
# The host has no node_modules. npx would download the newest Prisma, which
# does not speak this project's migrations. The image that was just built has
# the Prisma the schema was written for, and it can see the database by its
# compose name.
docker compose -p blipmade -f /opt/blipmade/compose.yml -f /opt/blipmade/compose.api.yml run --rm --no-deps api \
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
