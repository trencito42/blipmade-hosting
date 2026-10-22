#!/bin/bash
# Removes migration directories that carry no migration.sql.
#
# An empty directory in prisma/migrations makes `prisma migrate deploy` and
# `prisma migrate diff` fail with "Could not find the migration file at
# migration.sql", which would break the deploy and the drift check.
#
# The script only touches directories that are empty apart from the missing
# file, and it never removes a directory that has a migration.sql.
set -euo pipefail

ROOT="${1:-/opt/blipmade/api/prisma/migrations}"

if [[ ! -d "$ROOT" ]]; then
  echo "==> $ROOT does not exist, nothing to do."
  exit 0
fi

removed=0
for dir in "$ROOT"/*/; do
  [[ -d "$dir" ]] || continue
  name="$(basename "$dir")"
  [[ "$name" == "migration_lock.toml" ]] && continue
  if [[ -f "$dir/migration.sql" ]]; then
    continue
  fi
  echo "==> Removing the empty migration directory $name"
  rm -rf "$dir"
  removed=$((removed + 1))
done

if [[ "$removed" -eq 0 ]]; then
  echo "==> Every migration directory has a migration.sql."
else
  echo "==> Removed $removed empty migration directory(ies)."
fi
