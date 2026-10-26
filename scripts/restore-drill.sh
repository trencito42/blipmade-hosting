#!/usr/bin/env bash
# Restore drill.
#
# The newest backup is restored into a scratch database and compared with the
# live database. The live database is never written to, and the scratch
# database is dropped afterwards.
#
# Usage: scripts/restore-drill.sh [archive]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/backup-common.sh
source "$ROOT/scripts/backup-common.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/blipmade}"
SCRATCH_DB="${SCRATCH_DB:-blipmade_restore_check}"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  set -a; . ./.env; set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
# The scratch database lives on the same server.
BASE_URL="${HOST_URL%/*}"
SCRATCH_URL="${BASE_URL}/${SCRATCH_DB}"

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  # sed reads the whole list, so the pipe is never closed under the writer.
  # head closes it and the script ends with the status 141.
  ARCHIVE="$(ls -1t "$BACKUP_DIR"/blipmade-*.tar.gz 2>/dev/null | sed -n '1p' || true)"
fi
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "No backup archive found in $BACKUP_DIR. Run scripts/backup.sh first." >&2
  exit 1
fi

echo "==> Archive: $ARCHIVE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"

echo "==> Creating the scratch database"
psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SCRATCH_DB\";" >/dev/null

restore_ok=0
cleanup() {
  echo "==> Dropping the scratch database"
  psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null || true
}
trap 'cleanup; rm -rf "$WORK"' EXIT

echo "==> Restoring into $SCRATCH_DB"
if pg_restore --clean --if-exists --no-owner --no-privileges -d "$SCRATCH_URL" "$WORK/database.dump"; then
  restore_ok=1
else
  echo "    The restore reported errors." >&2
fi

echo "==> Comparing the live database with the restored one"
TABLES='SELECT count(*) FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
USERS='SELECT count(*) FROM "User";'
PRODUCTS='SELECT count(*) FROM "Product";'
MIGRATIONS='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'

# The drill proves the whole archive, not only the database. A backup that
# holds the database but not the files of the customers is not a backup of
# the platform, so the uploads and the configuration have to be in it and
# have to be readable.
echo "==> Checking the rest of the archive"
archive_status=0

# The uploads are in the archive only when the live host has an upload
# storage. A host without one has nothing to archive, so the absence of the
# archive of the uploads is not a failure there. The drill failed every night
# on a host that never had any upload storage, and a signal that cries wolf
# every night is a signal nobody reads.
UPLOADS_EXPECTED=0
if [[ -n "$(blipmade_upload_source "${OFFSITE_UPLOAD_DIR:-${ATTACHMENT_DIR:-}}")" ]]; then
  UPLOADS_EXPECTED=1
fi

for member in uploads.tar.gz config.tar.gz; do
  if [[ "$member" == "uploads.tar.gz" && "$UPLOADS_EXPECTED" != "1" ]]; then
    if [[ -f "$WORK/$member" ]]; then
      printf '  %-16s present\n' "$member"
    else
      printf '  %-16s not needed: this host has no upload storage\n' "$member"
    fi
    continue
  fi
  if [[ -f "$WORK/$member" ]]; then
    if tar -tzf "$WORK/$member" >/dev/null 2>&1; then
      count="$(tar -tzf "$WORK/$member" 2>/dev/null | grep -cv '/$' || true)"
      printf '  %-16s present, %s entries, readable\n' "$member" "$count"
    else
      printf '  %-16s present but NOT readable\n' "$member"
      archive_status=1
    fi
  else
    printf '  %-16s MISSING from the archive\n' "$member"
    archive_status=1
  fi
done

live_tables=$(psql -At "$HOST_URL" -c "$TABLES")
restored_tables=$(psql -At "$SCRATCH_URL" -c "$TABLES")
live_users=$(psql -At "$HOST_URL" -c "$USERS")
restored_users=$(psql -At "$SCRATCH_URL" -c "$USERS")
live_products=$(psql -At "$HOST_URL" -c "$PRODUCTS")
restored_products=$(psql -At "$SCRATCH_URL" -c "$PRODUCTS")
live_migrations=$(psql -At "$HOST_URL" -c "$MIGRATIONS")
restored_migrations=$(psql -At "$SCRATCH_URL" -c "$MIGRATIONS")

printf '  %-14s live=%-6s restored=%-6s\n' \
  "tables" "$live_tables" "$restored_tables" \
  "users" "$live_users" "$restored_users" \
  "products" "$live_products" "$restored_products" \
  "migrations" "$live_migrations" "$restored_migrations"

status=0
if [[ "$restore_ok" != "1" ]]; then
  echo "  RESULT: the restore reported errors." >&2
  status=1
elif [[ "$archive_status" != "0" ]]; then
  echo "  RESULT: the archive does not hold the uploads and the configuration." >&2
  status=1
elif [[ "$live_tables" != "$restored_tables" || "$live_users" != "$restored_users" \
   || "$live_products" != "$restored_products" || "$live_migrations" != "$restored_migrations" ]]; then
  echo "  RESULT: the restored database does not match the live one." >&2
  status=1
else
  echo "  RESULT: the backup restores into a database that matches the live one,"
  if [[ "$UPLOADS_EXPECTED" == "1" ]]; then
    echo "           and it holds the uploads and the configuration."
  else
    echo "           and it holds the configuration."
  fi
fi

# The receipt of the drill, for the platform. The result is the one of the
# drill: a drill that failed is an alarm, and a drill that was never run
# leaves no receipt at all, which the platform reads as "nothing is known".
blipmade_write_receipt "restore-drill.json" "{\"runAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"result\":\"$([[ "$status" -eq 0 ]] && echo success || echo failed)\",\"source\":\"$(basename "${ARCHIVE:-the local archive}")\",\"restoredInto\":\"$SCRATCH_DB\",\"durationSeconds\":0,\"checks\":[],\"reason\":\"$([[ "$status" -eq 0 ]] && echo "" || echo "the restore did not match the live database")\"}"

exit "$status"
