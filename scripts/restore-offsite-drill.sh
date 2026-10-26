#!/usr/bin/env bash
# Restore drill for the encrypted copy that leaves the host.
#
# The drill of the local archive (scripts/restore-drill.sh) proves that the
# archive of the host restores. That archive never leaves the host, and the
# host uses RAID 0, so the copy that has to survive the loss of the host is
# the encrypted copy on the off-site target. This drill proves that copy: it
# lists the target, reads the newest copy down, checks the checksum, decrypts
# the copy, restores it into a scratch database and compares that database
# with the live one.
#
# Nothing is written on the target: the target is only listed and read. The
# live database is never written to. The scratch database is dropped at the
# end and the temporary files are removed. The drill is safe to run at any
# time, also while the platform is serving customers.
#
# Usage: scripts/restore-offsite-drill.sh [copy name]
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/backup-common.sh
source "$ROOT/scripts/backup-common.sh"

PREFIX="blipmade-offsite"
SCRATCH_DB="${SCRATCH_DB:-blipmade_offsite_drill}"

COPY_NAME="${1:-}"
case "$COPY_NAME" in
  -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
esac

# ---------------------------------------------------------------------------
# The configuration.
#
# The configuration of the host lives in the environment file of the platform.
# A value that is already in the environment wins over the file, so the drill
# can be pointed at another target or at another key without changing the
# file of the host.
# ---------------------------------------------------------------------------
CONFIG_KEYS=(OFFSITE_TARGET OFFSITE_TRANSPORT OFFSITE_AGE_RECIPIENT
             OFFSITE_AGE_IDENTITY OFFSITE_ENCRYPTION_KEY OFFSITE_PBKDF2_ITER
             DATABASE_URL)
declare -A FROM_ENVIRONMENT=()
for name in "${CONFIG_KEYS[@]}"; do
  if [[ -n "${!name+x}" ]]; then
    FROM_ENVIRONMENT["$name"]="${!name}"
  fi
done
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi
for name in "${!FROM_ENVIRONMENT[@]}"; do
  printf -v "$name" '%s' "${FROM_ENVIRONMENT[$name]}"
done

PBKDF2_ITER="${OFFSITE_PBKDF2_ITER:-600000}"

# ---------------------------------------------------------------------------
# The scratch database.
#
# The drill writes into a scratch database and into nothing else, so the name
# of that database has to say that it is one. The check is made before the
# target is even listed, so a mistake in this script cannot reach the live
# database.
# ---------------------------------------------------------------------------
if [[ ! "$SCRATCH_DB" =~ (_test|_drill)$ ]]; then
  echo "The name of the scratch database must end with _test or _drill," >&2
  echo "not \"$SCRATCH_DB\". Refusing to run." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and .env was not found." >&2
  exit 1
fi

# The name of the service of the compose network does not resolve from the
# host, so the host of the url is rewritten to the loopback address of the
# host, exactly like the backup scripts do it.
HOST_URL="$(blipmade_host_database_url "$DATABASE_URL")"
# The password is taken out of the url and handed to libpq through the
# environment, so it never shows up in the process list of the machine.
CREDENTIALS="$(blipmade_database_credentials "$HOST_URL")"
HOST_URL="${CREDENTIALS%%$'\n'*}"
export PGPASSWORD="${CREDENTIALS#*$'\n'}"

BASE_URL="${HOST_URL%/*}"
LIVE_DB="${BASE_URL##*/}"
LIVE_DB="${LIVE_DB%%\?*}"
SCRATCH_URL="${BASE_URL}/${SCRATCH_DB}"

if [[ "$SCRATCH_DB" == "$LIVE_DB" || "$SCRATCH_URL" == "$HOST_URL" ]]; then
  echo "The scratch database is the live database (\"$LIVE_DB\")." >&2
  echo "Refusing to run." >&2
  exit 1
fi

if [[ -z "${OFFSITE_TARGET:-}" ]]; then
  echo "OFFSITE_TARGET is not set, so there is no off-site copy to restore." >&2
  echo "Set it in the environment file of the platform." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# The transport. It is detected from the shape of the target and can be
# forced with OFFSITE_TRANSPORT.
# ---------------------------------------------------------------------------
TRANSPORT="${OFFSITE_TRANSPORT:-}"
if [[ -z "$TRANSPORT" ]]; then
  case "$OFFSITE_TARGET" in
    /*) TRANSPORT="local" ;;
    *@*) TRANSPORT="ssh" ;;
    *) TRANSPORT="rclone" ;;
  esac
fi
case "$TRANSPORT" in
  rclone|ssh|local) ;;
  *)
    echo "OFFSITE_TRANSPORT must be rclone, ssh or local, not \"$TRANSPORT\"." >&2
    exit 1
    ;;
esac

ssh_host() { printf '%s' "${OFFSITE_TARGET%%:*}"; }
ssh_path() {
  local path="${OFFSITE_TARGET#*:}"
  if [[ "$path" == "$OFFSITE_TARGET" ]]; then path="."; fi
  printf '%s' "$path"
}

# The copy that leaves the host carries no checksum file of its own, so the
# checksum is computed on the target and compared with the checksum of the
# copy that was read down. The target is only read, never written.
case "$TRANSPORT" in
  rclone) CHECKSUM_ALGO="md5" ;;
  *)      CHECKSUM_ALGO="sha256" ;;
esac

remote_list() {
  case "$TRANSPORT" in
    rclone) rclone lsf "$OFFSITE_TARGET" 2>/dev/null ;;
    ssh) ssh "$(ssh_host)" "ls -1 '$(ssh_path)'" 2>/dev/null ;;
    local) ls -1 "$OFFSITE_TARGET" 2>/dev/null ;;
  esac
}

remote_checksum() {
  case "$TRANSPORT" in
    rclone) rclone md5sum "$OFFSITE_TARGET/$COPY_NAME" 2>/dev/null | awk '{print $1}' ;;
    ssh) ssh "$(ssh_host)" "sha256sum '$(ssh_path)/$COPY_NAME'" 2>/dev/null | awk '{print $1}' ;;
    local) sha256sum "$OFFSITE_TARGET/$COPY_NAME" 2>/dev/null | awk '{print $1}' ;;
  esac
}

local_checksum() {
  case "$CHECKSUM_ALGO" in
    md5) md5sum "$1" | awk '{print $1}' ;;
    *) sha256sum "$1" | awk '{print $1}' ;;
  esac
}

# ---------------------------------------------------------------------------
# The keys. The copy was encrypted with age when the host had the key of age,
# and with the openssl fallback otherwise. Every key that is on this host is
# tried, so a copy that was made with the other method is still read.
# ---------------------------------------------------------------------------
AGE_READY=0
if command -v age >/dev/null 2>&1 \
   && [[ -n "${OFFSITE_AGE_IDENTITY:-}" ]] && [[ -r "${OFFSITE_AGE_IDENTITY}" ]]; then
  AGE_READY=1
fi
OPENSSL_READY=0
if [[ -n "${OFFSITE_ENCRYPTION_KEY:-}" ]]; then
  export OFFSITE_ENCRYPTION_KEY
  OPENSSL_READY=1
fi
if [[ "$AGE_READY" != "1" && "$OPENSSL_READY" != "1" ]]; then
  echo "No key is available to read the off-site copy." >&2
  echo "Set OFFSITE_AGE_IDENTITY (the path of the age identity) or" >&2
  echo "OFFSITE_ENCRYPTION_KEY (the passphrase of the openssl fallback)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# The copy. The target is only listed and read.
# ---------------------------------------------------------------------------
echo "==> Listing the off-site target"
LISTING="$(remote_list || true)"
mapfile -t COPIES < <(printf '%s\n' "$LISTING" | grep -E "^${PREFIX}-.*\.tar\.gz\.enc$" | sort)
if [[ "${#COPIES[@]}" -eq 0 ]]; then
  echo "The off-site target holds no copy of the platform." >&2
  echo "Target: $TRANSPORT \"$OFFSITE_TARGET\"" >&2
  exit 1
fi

if [[ -z "$COPY_NAME" ]]; then
  # The names carry the UTC timestamp of the copy, so the order of the names
  # is the order of the copies and the last one is the newest.
  COPY_NAME="${COPIES[$(( ${#COPIES[@]} - 1 ))]}"
fi
if ! printf '%s\n' "${COPIES[@]}" | grep -qxF "$COPY_NAME"; then
  echo "The off-site target does not hold a copy called \"$COPY_NAME\"." >&2
  exit 1
fi
echo "    the target holds ${#COPIES[@]} copy/copies, the newest one is $COPY_NAME"

WORK="$(mktemp -d)"
SCRATCH_CREATED=0
cleanup() {
  if [[ "$SCRATCH_CREATED" == "1" ]]; then
    psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> Reading the copy down from the target"
COPY="$WORK/$COPY_NAME"
case "$TRANSPORT" in
  rclone) rclone copyto "$OFFSITE_TARGET/$COPY_NAME" "$COPY" ;;
  ssh) scp -q "$(ssh_host):$(ssh_path)/$COPY_NAME" "$COPY" ;;
  local) cp "$OFFSITE_TARGET/$COPY_NAME" "$COPY" ;;
esac

# ---------------------------------------------------------------------------
# The checksum. A copy that was truncated on the way, or that was damaged in
# the storage of the target, is caught here.
# ---------------------------------------------------------------------------
echo "==> Checking the checksum"
REMOTE_SUM="$(remote_checksum || true)"
LOCAL_SUM="$(local_checksum "$COPY")"
if [[ -z "$REMOTE_SUM" ]]; then
  echo "The checksum of the copy could not be computed on the target." >&2
  exit 1
fi
if [[ "$REMOTE_SUM" != "$LOCAL_SUM" ]]; then
  echo "The copy that was read down has a different checksum than the copy" >&2
  echo "on the target. The copy is damaged and must not be restored." >&2
  exit 1
fi
echo "    the copy matches the one on the target ($CHECKSUM_ALGO $LOCAL_SUM)"

# ---------------------------------------------------------------------------
# The decryption.
# ---------------------------------------------------------------------------
echo "==> Decrypting the copy"
PAYLOAD="$WORK/payload.tar.gz"
DECRYPTED=0
METHOD=""
if [[ "$AGE_READY" == "1" ]]; then
  if age --decrypt --identity "$OFFSITE_AGE_IDENTITY" \
        --output "$PAYLOAD" "$COPY" 2>"$WORK/age.log"; then
    DECRYPTED=1
    METHOD="age"
  else
    echo "    the age identity did not read the copy:"
    sed -n '1,3p' "$WORK/age.log" | sed 's/^/      /'
  fi
fi
if [[ "$DECRYPTED" != "1" && "$OPENSSL_READY" == "1" ]]; then
  if openssl enc -d -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITER" -md sha256 \
       -pass env:OFFSITE_ENCRYPTION_KEY -in "$COPY" -out "$PAYLOAD" 2>"$WORK/openssl.log"; then
    DECRYPTED=1
    METHOD="openssl"
  else
    echo "    the openssl passphrase did not read the copy:"
    sed -n '1,3p' "$WORK/openssl.log" | sed 's/^/      /'
  fi
fi
if [[ "$DECRYPTED" != "1" ]]; then
  echo "The copy could not be decrypted with any of the keys of this host." >&2
  exit 1
fi
echo "    the copy was read with $METHOD"

# ---------------------------------------------------------------------------
# The payload. The dump has to be readable, not only present: a copy that
# holds a broken dump is not a backup.
# ---------------------------------------------------------------------------
echo "==> Opening the payload"
mkdir -p "$WORK/payload"
if ! tar -xzf "$PAYLOAD" -C "$WORK/payload"; then
  echo "The decrypted payload is not a readable archive." >&2
  exit 1
fi
if [[ ! -f "$WORK/payload/database.dump" ]]; then
  echo "The decrypted payload holds no database dump." >&2
  exit 1
fi
if ! pg_restore --list "$WORK/payload/database.dump" >/dev/null 2>&1; then
  echo "The dump inside the copy cannot be read." >&2
  exit 1
fi
echo "    the payload holds a readable dump"

# ---------------------------------------------------------------------------
# The scratch database. The live database is only read.
# ---------------------------------------------------------------------------
echo "==> Creating the scratch database $SCRATCH_DB"
psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
psql "$HOST_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SCRATCH_DB\";" >/dev/null
SCRATCH_CREATED=1

restore_ok=0
echo "==> Restoring into $SCRATCH_DB"
if pg_restore --clean --if-exists --no-owner --no-privileges \
     -d "$SCRATCH_URL" "$WORK/payload/database.dump"; then
  restore_ok=1
else
  echo "    The restore reported errors." >&2
fi

echo "==> Comparing the live database with the restored one"
TABLES='SELECT count(*) FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
USERS='SELECT count(*) FROM "User";'
PRODUCTS='SELECT count(*) FROM "Product";'
MIGRATIONS='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'

live_tables=$(psql -At "$HOST_URL" -c "$TABLES" || true)
restored_tables=$(psql -At "$SCRATCH_URL" -c "$TABLES" || true)
live_users=$(psql -At "$HOST_URL" -c "$USERS" || true)
restored_users=$(psql -At "$SCRATCH_URL" -c "$USERS" || true)
live_products=$(psql -At "$HOST_URL" -c "$PRODUCTS" || true)
restored_products=$(psql -At "$SCRATCH_URL" -c "$PRODUCTS" || true)
live_migrations=$(psql -At "$HOST_URL" -c "$MIGRATIONS" || true)
restored_migrations=$(psql -At "$SCRATCH_URL" -c "$MIGRATIONS" || true)

printf '  %-14s live=%-6s restored=%-6s\n' \
  "tables" "$live_tables" "$restored_tables" \
  "users" "$live_users" "$restored_users" \
  "products" "$live_products" "$restored_products" \
  "migrations" "$live_migrations" "$restored_migrations"

# A number that could not be read is not a match. The drill reports it
# instead of comparing an empty answer with an empty answer.
numbers_ok=1
for value in "$live_tables" "$restored_tables" "$live_users" "$restored_users" \
              "$live_products" "$restored_products" "$live_migrations" "$restored_migrations"; do
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    numbers_ok=0
  fi
done

# A backup is a copy of the platform of the moment it was made, and the
# platform keeps running after that. The copy of the night is therefore
# usually a little older than the live database, and the numbers of the
# restored database can be lower. That is not a broken copy, it is an old
# copy, and the difference is printed so the operator can tell the two
# apart.
if [[ "$numbers_ok" == "1" ]] \
   && { [[ "$restored_users" -lt "$live_users" ]] || [[ "$restored_products" -lt "$live_products" ]]; }; then
  echo "    the restored database holds fewer rows than the live one, so the"
  echo "    copy is older than the live database."
fi

# ---------------------------------------------------------------------------
# The rest of the payload. A backup that holds the database but not the files
# of the customers is not a backup of the platform.
# ---------------------------------------------------------------------------
echo "==> Checking the rest of the payload"
payload_status=0

UPLOADS_EXPECTED=0
if [[ -n "$(blipmade_upload_source "${OFFSITE_UPLOAD_DIR:-${ATTACHMENT_DIR:-}}")" ]]; then
  UPLOADS_EXPECTED=1
fi

for member in uploads.tar.gz config.tar.gz; do
  if [[ "$member" == "uploads.tar.gz" && "$UPLOADS_EXPECTED" != "1" ]]; then
    if [[ -f "$WORK/payload/$member" ]]; then
      printf '  %-16s present\n' "$member"
    else
      printf '  %-16s not needed: this host has no upload storage\n' "$member"
    fi
    continue
  fi
  if [[ -f "$WORK/payload/$member" ]]; then
    if tar -tzf "$WORK/payload/$member" >/dev/null 2>&1; then
      count="$(tar -tzf "$WORK/payload/$member" 2>/dev/null | grep -cv '/$' || true)"
      printf '  %-16s present, %s entries, readable\n' "$member" "$count"
    else
      printf '  %-16s present but NOT readable\n' "$member"
      payload_status=1
    fi
  else
    printf '  %-16s MISSING from the payload\n' "$member"
    payload_status=1
  fi
done

status=0
if [[ "$restore_ok" != "1" ]]; then
  echo "  RESULT: the restore reported errors." >&2
  status=1
elif [[ "$payload_status" != "0" ]]; then
  echo "  RESULT: the copy does not hold the uploads and the configuration." >&2
  status=1
elif [[ "$numbers_ok" != "1" ]]; then
  echo "  RESULT: a number could not be read from one of the two databases." >&2
  status=1
elif [[ "$live_tables" != "$restored_tables" || "$live_users" != "$restored_users" \
   || "$live_products" != "$restored_products" || "$live_migrations" != "$restored_migrations" ]]; then
  echo "  RESULT: the restored database does not match the live one." >&2
  status=1
fi

echo
echo "==> Result"
if [[ "$status" == "0" ]]; then
  echo "  PASS  the copy $COPY_NAME was read from the off-site target, it was"
  echo "        decrypted and it restores into a database that matches the"
  echo "        live one."
  echo "        The live database was not written to and the scratch database"
  echo "        $SCRATCH_DB is dropped."
else
  echo "  FAIL  the copy $COPY_NAME did not restore into a database that" >&2
  echo "        matches the live one. The live database was not written to." >&2
fi

# The receipt of the drill, for the platform. The result is the one of the
# drill: a drill that failed is an alarm, and a drill that was never run
# leaves no receipt at all, which the platform reads as "nothing is known".
blipmade_write_receipt "restore-drill.json" "{\"runAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"result\":\"$([[ "$status" -eq 0 ]] && echo success || echo failed)\",\"source\":\"$COPY_NAME\",\"restoredInto\":\"$SCRATCH_DB\",\"durationSeconds\":0,\"checks\":[],\"reason\":\"$([[ "$status" -eq 0 ]] && echo "" || echo "the copy that leaves the host did not restore")\"}"

exit "$status"
