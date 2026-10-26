#!/bin/sh
# Applies pending database migrations before the service starts.
#
# Migrations are safe to run repeatedly: Prisma only applies the ones that
# have not been recorded yet.
set -e

# The migrations are applied by the host, with the credentials of the owner
# of the database, before the platform is started. The role the platform uses
# cannot change the schema, and that is the point: a command that would drop
# the schema fails at the database itself, before anything is destroyed.
#
# The container checks that the database is at the schema of this release and
# refuses to start when it is not, so a release that forgot a migration is
# seen at once and not by a customer.
if [ "${CHECK_MIGRATIONS:-false}" = "true" ]; then
  echo "==> Checking that the database is at the schema of this release"
  if ! npx prisma migrate status; then
    echo "The database is not at the schema of this release." >&2
    echo "Run scripts/apply-migrations.sh on the host before starting the platform." >&2
    exit 1
  fi
fi

exec "$@"
