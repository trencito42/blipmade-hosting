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

# shellcheck source=scripts/backup-common.sh
source "$ROOT/scripts/backup-common.sh"

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
HOST_URL="$(blipmade_host_database_url "$DATABASE_URL")"

echo "==> Dumping the database"
pg_dump "$HOST_URL" --format=custom --file="$WORK/database.dump"

echo "==> Copying the configuration (secrets are never included)"
CONFIG_MEMBERS=()
while IFS= read -r member; do
  CONFIG_MEMBERS+=("$member")
done < <(blipmade_config_members "$ROOT")
if [[ ${#CONFIG_MEMBERS[@]} -gt 0 ]]; then
  tar -czf "$WORK/config.tar.gz" \
    --exclude='.env' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    "${CONFIG_MEMBERS[@]}"
else
  echo "    No configuration file was found, the archive carries the database only." >&2
fi

# The uploads of the customers are part of the platform. A backup that holds
# the database but not the files of the customers is not a backup of the
# platform, so they travel with it.
UPLOAD_SOURCE="$(blipmade_upload_source "${OFFSITE_UPLOAD_DIR:-${ATTACHMENT_DIR:-}}")"
if [[ -n "$UPLOAD_SOURCE" ]]; then
  UPLOAD_COUNT="$(blipmade_count_files "$UPLOAD_SOURCE")"
  echo "==> Adding the customer uploads ($UPLOAD_COUNT files from $UPLOAD_SOURCE)"
  if ! blipmade_archive_dir "$UPLOAD_SOURCE" "$WORK/uploads.tar.gz"; then
    echo "    The uploads could not be packed, the archive holds the database only." >&2
  fi
else
  echo "==> No customer upload storage was found on this host." >&2
  echo "    The archive will carry the database and the configuration only." >&2
fi

ARCHIVE="$BACKUP_DIR/blipmade-$LABEL-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .

sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

echo "==> Backup written: $ARCHIVE"
cat "$ARCHIVE.sha256"

echo "==> Removing local backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name "blipmade-*.tar.gz" -mtime "+$KEEP_DAYS" -print -delete

# The copy that leaves the host is made by scripts/backup-offsite.sh, which
# encrypts the payload before it travels. A backup must never travel
# unencrypted, so this script never copies the archive on its own, and the
# unit of the timer runs the encrypted copy as its own step.
#
# A manual run of this script therefore stays on the host, and the operator is
# told where the encrypted copy is made.
if [[ -n "${OFFSITE_TARGET:-}" ]]; then
  echo "==> An off-site target is configured."
  echo "    The encrypted copy is made by scripts/backup-offsite.sh, which the"
  echo "    backup unit runs as its own step."
else
  echo "==> OFFSITE_TARGET is not set, so this copy stayed on this host."
  echo "    The host uses RAID 0. Configure OFFSITE_TARGET before relying on these backups."
fi
