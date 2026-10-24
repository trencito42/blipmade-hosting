#!/usr/bin/env bash
# Tests the pending migrations of the release in disposable databases.
#
# Two paths are exercised, both on scratch databases whose name ends in
# "_test"; the live database is never written to.
#
#   A. A fresh install: an empty database receives every migration and must
#      end up with exactly the schema of prisma/schema.prisma.
#   B. The upgrade path: the production dump is restored into a scratch
#      database and only the pending migrations are applied on top of it.
#
# Usage: scripts/test-migrations.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/api"

if [[ -z "${DATABASE_URL:-}" && -f ../.env ]]; then
  set -a; . ./../.env; set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"
BASE_URL="${HOST_URL%/*}"

# Every scratch database ends in "_test", so a mistake can never reach the
# live database.
FRESH_DB="blipmade_migfresh_test"
UPGRADE_DB="blipmade_migupgrade_test"

refuse_if_not_test() {
  case "$1" in
    *_test) echo "  target database: $1 (name ends in _test)" ;;
    *) echo "REFUSED: the target database name does not end in _test." >&2; exit 9 ;;
  esac
}

cleanup() {
  psql "$HOST_URL" -q -c "DROP DATABASE IF EXISTS \"$FRESH_DB\";" >/dev/null 2>&1 || true
  psql "$HOST_URL" -q -c "DROP DATABASE IF EXISTS \"$UPGRADE_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Pending migrations of the release"
APPLIED_JSON="$(psql -At "$HOST_URL" -c "select coalesce(json_agg(migration_name),'[]') from \"_prisma_migrations\" where finished_at is not null;")"
export APPLIED_JSON
node -e '
const fs=require("fs");
const dir="prisma/migrations";
const applied=JSON.parse(process.env.APPLIED_JSON||"[]");
const all=fs.readdirSync(dir).filter(d=>fs.existsSync(dir+"/"+d+"/migration.sql")).sort();
const pending=all.filter(m=>!applied.includes(m));
console.log("  all migrations:", all.length);
console.log("  applied in production:", applied.length);
console.log("  pending:", pending.length ? pending.join(", ") : "(none)");
'

echo
echo "===== A. fresh install ====="
refuse_if_not_test "$FRESH_DB"
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$FRESH_DB\";" >/dev/null
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$FRESH_DB\";" >/dev/null
FRESH_URL="${BASE_URL}/${FRESH_DB}"
if DATABASE_URL="$FRESH_URL" npx prisma migrate deploy --schema prisma/schema.prisma >/tmp/mig-fresh.log 2>&1; then
  echo "  migrate deploy: OK"
else
  echo "  migrate deploy: FAILED" >&2; tail -20 /tmp/mig-fresh.log >&2; exit 1
fi
echo "  tables in the fresh database: $(psql -At "$FRESH_URL" -c "select count(*) from information_schema.tables where table_schema='public';")"

echo
echo "===== A2. drift between the fresh database and the schema ====="
SHADOW="blipmade_migshadow_test"
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SHADOW\";" >/dev/null
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SHADOW\";" >/dev/null
if npx prisma migrate diff --from-url "$FRESH_URL" --to-schema-datamodel prisma/schema.prisma \
     --shadow-database-url "${BASE_URL}/${SHADOW}" --exit-code >/tmp/mig-diff.log 2>&1; then
  echo "  RESULT: no difference between the migrated database and schema.prisma"
else
  echo "  RESULT: there is a difference:" >&2; cat /tmp/mig-diff.log >&2
fi
psql "$HOST_URL" -q -c "DROP DATABASE IF EXISTS \"$SHADOW\";" >/dev/null 2>&1 || true

echo
echo "===== B. upgrade path over the production dump ====="
refuse_if_not_test "$UPGRADE_DB"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  # sed reads the whole list, so the pipe is never closed under the writer.
  # head closes it and the script ends with the status 141.
  ARCHIVE="$(ls -1t /var/backups/blipmade/blipmade-pre-release-*.tar.gz 2>/dev/null | sed -n '1p' || true)"
fi
if [[ -z "$ARCHIVE" ]]; then
  echo "  no archive found; skipping the upgrade path" >&2
  exit 1
fi
echo "  archive: $ARCHIVE"
WORK="$(mktemp -d)"; tar -xzf "$ARCHIVE" -C "$WORK"
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$UPGRADE_DB\";" >/dev/null
psql "$HOST_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$UPGRADE_DB\";" >/dev/null
UPGRADE_URL="${BASE_URL}/${UPGRADE_DB}"
if pg_restore --clean --if-exists --no-owner --no-privileges -d "$UPGRADE_URL" "$WORK/database.dump" 2>/tmp/mig-restore.log; then
  echo "  the production dump was restored: OK"
else
  echo "  the restore reported errors (they are listed below)" >&2; tail -5 /tmp/mig-restore.log >&2
fi
echo "  rows in the restored copy:"
for t in "User" "Order" "Product" "Payment" "AuditLog"; do
  printf "    %-10s %s\n" "$t" "$(psql -At "$UPGRADE_URL" -c "select count(*) from \"$t\";" 2>/dev/null || echo n/a)"
done

echo
echo "  applying the pending migrations on top of the restored copy:"
if DATABASE_URL="$UPGRADE_URL" npx prisma migrate deploy --schema prisma/schema.prisma >/tmp/mig-upgrade.log 2>&1; then
  echo "  migrate deploy: OK"
  grep -E "Applying migration|migrations have been successfully applied" /tmp/mig-upgrade.log | sed "s/^/    /"
else
  echo "  migrate deploy: FAILED" >&2; tail -25 /tmp/mig-upgrade.log >&2; exit 1
fi

echo
echo "===== B2. drift after the upgrade ====="
if npx prisma migrate diff --from-url "$UPGRADE_URL" --to-schema-datamodel prisma/schema.prisma \
     --shadow-database-url "${BASE_URL}/${SHADOW}" --exit-code >/tmp/mig-diff2.log 2>&1; then
  echo "  RESULT: no difference between the upgraded database and schema.prisma"
else
  echo "  RESULT: there is a difference:" >&2; cat /tmp/mig-diff2.log >&2
fi

echo
echo "===== B3. the data survived the upgrade ====="
for t in "User" "Order" "Product" "Payment" "AuditLog" "Instance"; do
  printf "    %-10s %s\n" "$t" "$(psql -At "$UPGRADE_URL" -c "select count(*) from \"$t\";" 2>/dev/null || echo n/a)"
done
echo "  migrations recorded in the upgraded copy: $(psql -At "$UPGRADE_URL" -c "select count(*) from \"_prisma_migrations\" where finished_at is not null;")"

rm -rf "$WORK"
echo
echo "==> The scratch databases are dropped. The live database was not written to."
