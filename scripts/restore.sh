#!/usr/bin/env bash
# Restores a Blipmade backup into a database.
#
# The restore is verified before it is applied: the archive is checked against
# its checksum and the dump is listed first.
#
# Usage: scripts/restore.sh <backup.tar.gz> [--yes]
set -euo pipefail

ARCHIVE="${1:-}"
ASSUME_YES="${2:-}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: scripts/restore.sh <backup.tar.gz> [--yes]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  # The environment file only fills a gap, so a target can be given explicitly
  # for a restore drill.
  set -a; . ./.env; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"

echo "==> Checking the checksum"
if [[ -f "$ARCHIVE.sha256" ]]; then
  (cd "$(dirname "$ARCHIVE")" && sha256sum --check "$(basename "$ARCHIVE").sha256")
else
  echo "    No checksum file next to the archive, skipping the check."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"

echo "==> Listing the dump"
pg_restore --list "$WORK/database.dump" | head -20
echo "    ... $(pg_restore --list "$WORK/database.dump" | grep -c 'TABLE DATA' || true) tables with data"

if [[ "$ASSUME_YES" != "--yes" ]]; then
  echo
  echo "This will overwrite the current database:"
  echo "  $HOST_URL"
  read -r -p "Type 'restore' to continue: " answer
  [[ "$answer" == "restore" ]] || { echo "Aborted."; exit 1; }
fi

echo "==> Restoring"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$HOST_URL" "$WORK/database.dump"

echo "==> Verifying the restored database"
psql "$HOST_URL" -c 'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
echo "==> Restore complete"
