#!/usr/bin/env bash
# Writes the catalogue of the eggs into the live database of the platform.
#
# The catalogue is the manifest `pterodactyl-eggs/manifest.json`. The script
# is idempotent: a product that is already there is brought back to what the
# manifest says, except for the flag that opens it for ordering and for the
# price.
#
# The script writes into the live database of the platform. It says so, and it
# asks for the permission that the seed asks for, because the same accident
# that cost the platform its rows on 2026-10-26 must not happen twice.
#
# Usage, on the host of the platform:
#
#     ALLOW_PRODUCTION_SEED=true scripts/import-catalogue.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/lib/load-env.sh"

# The import writes into the catalogue, so it needs the credentials of the
# owner of the database: the role of the application cannot write a product.
# The file of the owner is read first, and the file of the platform fills the
# gaps: the panel, the settings and the rest.
if [[ -f .env.db-admin ]]; then
  load_env_file "$ROOT/.env.db-admin"
fi
load_env_file "$ROOT/.env"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

# The connection string of the environment points at the name of the
# container. The script runs on the host, so the address of the host is what
# it must use.
HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
export DATABASE_URL="$HOST_URL"

# The name of the database is the last part of the path of the url. It is
# read from the url itself and not from the part before it: the scheme of the
# url holds a slash of its own, and the name would be read from the wrong
# place.
DB_NAME="${HOST_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"

if [[ "$DB_NAME" != "blipmade" ]]; then
  echo "REFUSED: the target database is '$DB_NAME', not 'blipmade'." >&2
  echo "         Nothing was changed." >&2
  exit 9
fi

if [[ "${ALLOW_PRODUCTION_SEED:-}" != "true" ]]; then
  cat >&2 <<EOF
REFUSED: the catalogue would be written into the live database "$DB_NAME".

Set ALLOW_PRODUCTION_SEED=true to do it on purpose. The script only writes
the products of the manifest: it does not touch the accounts, the orders,
the instances or the audit trail.
EOF
  exit 9
fi

echo "==> target database: $DB_NAME (on the live cluster)"
echo "==> writing the catalogue"

cd "$ROOT/api"
exec npx tsx ../scripts/import-catalogue.ts
