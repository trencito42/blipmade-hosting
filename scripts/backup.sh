#!/usr/bin/env bash
# Blipmade database and configuration backup.
#
# The physical host uses RAID 0, so a local copy is not a backup. This script
# always writes a local copy and, when an offsite target is configured, sends
# a second copy away from the host.
#
# Usage: scripts/backup.sh [label]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/blipmade}"
LABEL="${1:-auto}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

# The database is reachable through the compose network from the host too.
HOST_URL="${DATABASE_URL/@postgres:/@localhost:}"
HOST_URL="${HOST_URL/@redis:/@localhost:}"

echo "==> Dumping the database"
pg_dump "$HOST_URL" --format=custom --file="$WORK/database.dump"

echo "==> Copying the configuration (secrets are never included)"
tar -czf "$WORK/config.tar.gz" \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  compose.yml compose.api.yml compose.web.yml api/prisma web/package.json 2>/dev/null || \
tar -czf "$WORK/config.tar.gz" --exclude='.env' --exclude='node_modules' --exclude='dist' --exclude='.git' compose.yml api/prisma web/package.json

ARCHIVE="$BACKUP_DIR/blipmade-$LABEL-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .

sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

echo "==> Backup written: $ARCHIVE"
cat "$ARCHIVE.sha256"

echo "==> Removing local backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name "blipmade-*.tar.gz" -mtime "+$KEEP_DAYS" -print -delete

# Offsite copy. The target is configured through OFFSITE_TARGET, for example
# "user@host:/path" for scp or an rclone remote name.
if [[ -n "${OFFSITE_TARGET:-}" ]]; then
  echo "==> Sending a copy to $OFFSITE_TARGET"
  if command -v rclone >/dev/null 2>&1 && [[ "$OFFSITE_TARGET" != *":"* || "$OFFSITE_TARGET" == *"://"* ]]; then
    rclone copy "$ARCHIVE" "$OFFSITE_TARGET"
    rclone copy "$ARCHIVE.sha256" "$OFFSITE_TARGET"
  else
    scp "$ARCHIVE" "$ARCHIVE.sha256" "$OFFSITE_TARGET"
  fi
  echo "==> Offsite copy complete"
else
  echo "==> OFFSITE_TARGET is not set, so the copy stayed on this host."
  echo "    The host uses RAID 0. Configure OFFSITE_TARGET before relying on these backups."
fi
