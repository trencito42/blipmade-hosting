#!/bin/sh
# Applies pending database migrations before the service starts.
#
# Migrations are safe to run repeatedly: Prisma only applies the ones that
# have not been recorded yet.
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "==> Applying database migrations"
  npx prisma migrate deploy
fi

exec "$@"
