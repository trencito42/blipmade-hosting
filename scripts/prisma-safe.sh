#!/usr/bin/env bash
# Runs a destructive Prisma command, and only against a disposable database.
#
# `prisma migrate reset` drops the schema of the database it is given, and
# `prisma db push --force-reset` does the same. On 2026-10-26 such a command
# was run with a connection string that pointed at the live database of the
# platform: the schema was dropped, the catalog was written again, and every
# row of every customer was gone.
#
# This script is the way to run a destructive command from now on. It asks
# the guard of the platform before it runs anything, and the guard refuses a
# database whose name does not say that it may be thrown away.
#
# Usage:
#   scripts/prisma-safe.sh migrate reset --force --schema prisma/schema.prisma
#   scripts/prisma-safe.sh db push --force-reset --accept-data-loss
#
# The way out is ALLOW_PRODUCTION_DESTRUCTIVE=true, and it says so in the
# output of the guard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/api"

echo "==> checking the target of: prisma $*"
npx tsx ../scripts/lib/assert-disposable-db.ts --label "run 'prisma $*' against the database"

exec npx prisma "$@"
