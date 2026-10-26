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

# shellcheck source=scripts/backup-common.sh
source "$ROOT/scripts/backup-common.sh"

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
# sed reads the whole list, head closes the pipe after twenty lines and
# pg_restore would die of SIGPIPE, which stops the script before it
# restores anything.
pg_restore --list "$WORK/database.dump" | sed -n '1,20p'
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

# The files of the customers are part of the platform. They are put back into
# the volume that the platform reads them from, so a restore does not leave a
# database without the files that belong to it.
UPLOAD_TARGET="$(blipmade_upload_source "")"
if [[ -f "$WORK/uploads.tar.gz" ]]; then
  if [[ -z "$UPLOAD_TARGET" ]]; then
    echo "==> The upload storage of the platform was not found on this host." >&2
    echo "    The database was restored, the uploads were not." >&2
  else
    echo "==> Restoring the customer uploads into $UPLOAD_TARGET"
    # The mount point of a docker volume lives under a directory that only
    # root can enter, so the service account cannot create it and cannot
    # write into it. The files of the customers are read by the container,
    # which runs as another user again, so the rights of the files are set
    # to what that container expects.
    if mkdir -p "$UPLOAD_TARGET" 2>/dev/null && [[ -w "$UPLOAD_TARGET" ]]; then
      tar -xzf "$WORK/uploads.tar.gz" --no-same-owner -C "$UPLOAD_TARGET"
    elif sudo -n true 2>/dev/null; then
      sudo -n mkdir -p "$UPLOAD_TARGET"
      sudo -n tar -xzf "$WORK/uploads.tar.gz" --no-same-owner -C "$UPLOAD_TARGET"
      sudo -n chown -R 100:101 "$UPLOAD_TARGET" 2>/dev/null || true
    else
      echo "    The upload storage cannot be written to by this account and" >&2
      echo "    this account cannot become root. The files of the customers" >&2
      echo "    were NOT restored." >&2
    fi
    echo "    $(blipmade_count_files "$UPLOAD_TARGET") files are in place"
  fi
else
  echo "==> The archive holds no uploads." >&2
fi

if [[ -f "$WORK/config.tar.gz" ]]; then
  echo "==> The archive also holds the configuration of the platform."
  echo "    It was not applied: the configuration of a live platform is changed"
  echo "    by a human, and the secrets are never part of a backup."
  tar -tzf "$WORK/config.tar.gz" | sed -n '1,10p' | sed 's/^/      /'
fi

echo "==> Verifying the restored database"
psql "$HOST_URL" -c 'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
echo "==> Restore complete"
