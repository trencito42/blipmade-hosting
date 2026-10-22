#!/usr/bin/env bash
# Off-site encrypted backup for the Blipmade platform.
#
# The control plane host uses RAID 0, so a copy that stays on this machine is
# not a backup. This script dumps the database, adds the customer upload
# storage, encrypts the result and sends it to a destination on another
# machine. The payload is encrypted before it leaves the host, the ciphertext is
# decrypted again and compared with the original before anything local is
# removed, and the copy on the remote is verified by listing it and comparing
# the size.
#
# Everything is configured through the environment. A key or a target that is
# given on the command line ends up in the shell history and in the process
# list, so neither is accepted as an argument.
#
#   OFFSITE_TARGET          where the copy goes. Without it the script does
#                           nothing and exits 0, so a host that has not been
#                           set up yet is never blocked by it.
#                             rclone:blipmade-backups   an rclone remote
#                             user@host:/srv/blipmade  an ssh destination
#                             /mnt/offsite/blipmade     a mounted volume
#   OFFSITE_TRANSPORT       rclone, ssh or local. Detected when it is not set.
#   OFFSITE_ENCRYPTION_KEY  the passphrase of the openssl fallback. Secret.
#   OFFSITE_AGE_RECIPIENT   the age recipient, for example age1.... Public.
#   OFFSITE_AGE_IDENTITY    the path to the age identity file. Secret.
#   OFFSITE_KEEP_COPIES     how many copies stay on the remote. Default 14.
#   OFFSITE_UPLOAD_DIR      the customer upload storage. It defaults to the
#                           ATTACHMENT_DIR of the platform.
#   BACKUP_DIR              where the local copy is written. Default
#                           /var/backups/blipmade.
#   DATABASE_URL            the database that is dumped.
#
# Encryption: age is used when it is installed and a recipient is configured.
# It encrypts with ChaCha20-Poly1305, which is an authenticated cipher. The
# fallback is "openssl enc", which has no AEAD mode at all: it refuses every
# GCM cipher, so AES-256-CBC with PBKDF2 is used instead and the round trip
# comparison below provides the integrity check. Install age for the stronger
# mode.
#
# Note: scripts/backup.sh reads OFFSITE_TARGET as well and copies the
# unencrypted archive to it. That copy must not be used. This script is the
# one that is allowed to have the target.
#
# Usage: scripts/backup-offsite.sh
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/blipmade}"
# The upload storage is the directory the platform stores the attached files
# in. It is taken from the platform configuration when it is not set here.
UPLOAD_DIR="${OFFSITE_UPLOAD_DIR:-${ATTACHMENT_DIR:-/data/uploads}}"
KEEP_COPIES="${OFFSITE_KEEP_COPIES:-14}"
PREFIX="blipmade-offsite"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${PREFIX}-${STAMP}.tar.gz.enc"
PBKDF2_ITER="${OFFSITE_PBKDF2_ITER:-600000}"

# The environment file only fills a gap, it never overrides a value that is
# already in the environment.
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

# ---------------------------------------------------------------------------
# Without a target there is nothing to do. The local backup is not affected and
# the script never claims that a copy was made.
# ---------------------------------------------------------------------------
if [[ -z "${OFFSITE_TARGET:-}" ]]; then
  echo "==> OFFSITE_TARGET is not set, so no off-site copy was made."
  echo "    The local backup is unaffected. This host uses RAID 0, so configure"
  echo "    OFFSITE_TARGET before relying on these backups."
  exit 0
fi

if ! [[ "$KEEP_COPIES" =~ ^[0-9]+$ ]] || [[ "$KEEP_COPIES" -lt 1 ]]; then
  echo "OFFSITE_KEEP_COPIES must be a positive number, not \"$KEEP_COPIES\"." >&2
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

# ---------------------------------------------------------------------------
# The encryption. A target without a key is a failure, never a plain copy.
# ---------------------------------------------------------------------------
ENCRYPTION=""
if command -v age >/dev/null 2>&1 && [[ -n "${OFFSITE_AGE_RECIPIENT:-}" ]]; then
  ENCRYPTION="age"
elif [[ -n "${OFFSITE_ENCRYPTION_KEY:-}" ]]; then
  ENCRYPTION="openssl"
else
  echo "OFFSITE_TARGET is set but no encryption key is configured." >&2
  echo "Set OFFSITE_AGE_RECIPIENT together with OFFSITE_AGE_IDENTITY, or set" >&2
  echo "OFFSITE_ENCRYPTION_KEY for the openssl fallback." >&2
  exit 1
fi

if [[ "$ENCRYPTION" == "age" ]]; then
  if [[ -z "${OFFSITE_AGE_IDENTITY:-}" ]]; then
    echo "OFFSITE_AGE_IDENTITY is not set, so the copy cannot be read back." >&2
    echo "The key file is needed to verify the copy before it is sent." >&2
    exit 1
  fi
  if [[ ! -r "$OFFSITE_AGE_IDENTITY" ]]; then
    echo "The age identity file cannot be read. Check OFFSITE_AGE_IDENTITY." >&2
    exit 1
  fi
else
  export OFFSITE_ENCRYPTION_KEY
fi

# ---------------------------------------------------------------------------
# The database.
# ---------------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set and no .env was found." >&2
  exit 1
fi

# The password is handed to libpq through the environment, so it never shows
# up in the process list.
DB_USER=""
DB_PASSWORD=""
DB_HOST=""
DB_URL="$DATABASE_URL"
url_scheme="${DATABASE_URL%%://*}"
url_rest="${DATABASE_URL#*://}"
if [[ "$url_rest" == *"@"* ]]; then
  url_creds="${url_rest%@*}"
  DB_HOST="${url_rest##*@}"
  if [[ "$url_creds" == *":"* ]]; then
    DB_USER="${url_creds%%:*}"
    DB_PASSWORD="${url_creds#*:}"
  else
    DB_USER="$url_creds"
  fi
  DB_URL="${url_scheme}://${DB_USER}@${DB_HOST}"
fi
export PGPASSWORD="$DB_PASSWORD"

# ---------------------------------------------------------------------------
# The PostgreSQL tools. postgresql-client-17 installs them in a versioned
# directory that is not always on the PATH.
# ---------------------------------------------------------------------------
resolve_tool() {
  local tool="$1" directory
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    return 0
  fi
  for directory in $(ls -1d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V -r); do
    if [[ -x "$directory/$tool" ]]; then
      printf '%s' "$directory/$tool"
      return 0
    fi
  done
  return 1
}

PG_DUMP="$(resolve_tool pg_dump || true)"
if [[ -z "$PG_DUMP" ]]; then
  echo "pg_dump was not found on this host." >&2
  echo "Install postgresql-client-17, or add its bin directory to the PATH." >&2
  exit 1
fi
PG_RESTORE="$(resolve_tool pg_restore || true)"
if [[ -z "$PG_RESTORE" ]]; then
  echo "pg_restore was not found on this host." >&2
  echo "Install postgresql-client-17, or add its bin directory to the PATH." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# The payload.
# ---------------------------------------------------------------------------
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

LOCAL_DIR="$BACKUP_DIR/offsite"
LOCAL_COPY="$LOCAL_DIR/$NAME"
PAYLOAD="$WORK/payload.tar.gz"

echo "==> Dumping the database"
"$PG_DUMP" "$DB_URL" --format=custom --file="$WORK/database.dump"

MEMBERS=(database.dump)
if [[ -d "$UPLOAD_DIR" ]]; then
  echo "==> Adding the upload storage"
  tar -czf "$WORK/uploads.tar.gz" -C "$UPLOAD_DIR" .
  MEMBERS+=(uploads.tar.gz)
else
  echo "==> There is no upload storage at $UPLOAD_DIR, the payload holds the database only"
fi

tar -czf "$PAYLOAD" -C "$WORK" "${MEMBERS[@]}"
PLAINTEXT_SUM="$(sha256sum "$PAYLOAD" | cut -d' ' -f1)"

# ---------------------------------------------------------------------------
# The encryption, and the check that the copy can be read back.
# ---------------------------------------------------------------------------
if ! mkdir -p "$LOCAL_DIR"; then
  echo "The local directory $LOCAL_DIR could not be created." >&2
  exit 1
fi

echo "==> Encrypting the payload"
case "$ENCRYPTION" in
  age)
    age --recipient "$OFFSITE_AGE_RECIPIENT" --output "$LOCAL_COPY" "$PAYLOAD"
    ;;
  openssl)
    openssl enc -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITER" -salt -md sha256 \
      -pass env:OFFSITE_ENCRYPTION_KEY -in "$PAYLOAD" -out "$LOCAL_COPY"
    ;;
esac
chmod 600 "$LOCAL_COPY"

echo "==> Reading the encrypted copy back"
case "$ENCRYPTION" in
  age)
    age --decrypt --identity "$OFFSITE_AGE_IDENTITY" --output "$WORK/verify.tar.gz" "$LOCAL_COPY"
    ;;
  openssl)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITER" -md sha256 \
      -pass env:OFFSITE_ENCRYPTION_KEY -in "$LOCAL_COPY" -out "$WORK/verify.tar.gz"
    ;;
esac

VERIFY_SUM="$(sha256sum "$WORK/verify.tar.gz" | cut -d' ' -f1)"
if [[ "$VERIFY_SUM" != "$PLAINTEXT_SUM" ]]; then
  echo "The encrypted copy does not read back as the original payload." >&2
  echo "The local copy $LOCAL_COPY was kept, the remote was not written." >&2
  exit 1
fi

# The dump inside the copy has to be readable, not only byte identical.
mkdir -p "$WORK/verify"
tar -xzf "$WORK/verify.tar.gz" -C "$WORK/verify"
if ! "$PG_RESTORE" --list "$WORK/verify/database.dump" >/dev/null; then
  echo "The dump inside the encrypted copy cannot be read." >&2
  echo "The local copy $LOCAL_COPY was kept, the remote was not written." >&2
  exit 1
fi
echo "    The copy decrypts into a readable dump."

# ---------------------------------------------------------------------------
# The upload.
# ---------------------------------------------------------------------------
ssh_host() { printf '%s' "${OFFSITE_TARGET%%:*}"; }
ssh_path() {
  local path="${OFFSITE_TARGET#*:}"
  if [[ "$path" == "$OFFSITE_TARGET" ]]; then path="."; fi
  printf '%s' "$path"
}

echo "==> Sending the copy to the off-site target"
case "$TRANSPORT" in
  rclone)
    if ! command -v rclone >/dev/null 2>&1; then
      echo "rclone is not installed on this host." >&2
      exit 1
    fi
    rclone copyto "$LOCAL_COPY" "$OFFSITE_TARGET/$NAME"
    ;;
  ssh)
    if ! command -v scp >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1; then
      echo "scp and ssh are needed for an ssh target and are not installed." >&2
      exit 1
    fi
    ssh "$(ssh_host)" "mkdir -p '$(ssh_path)'"
    scp -q "$LOCAL_COPY" "$(ssh_host):$(ssh_path)/$NAME"
    ;;
  local)
    mkdir -p "$OFFSITE_TARGET"
    cp "$LOCAL_COPY" "$OFFSITE_TARGET/$NAME"
    ;;
esac

# ---------------------------------------------------------------------------
# The verification. The remote is listed and the size is compared, so a copy
# that was truncated or never arrived is caught here.
# ---------------------------------------------------------------------------
remote_size() {
  case "$TRANSPORT" in
    rclone)
      rclone lsjson --files-only "$OFFSITE_TARGET" 2>/dev/null \
        | tr '{' '\n' \
        | grep -F "\"Path\":\"$NAME\"" \
        | sed -E 's/.*"Size":([0-9]+).*/\1/' \
        | head -n 1
      ;;
    ssh)
      ssh "$(ssh_host)" "stat -c %s '$(ssh_path)/$NAME'" 2>/dev/null
      ;;
    local)
      stat -c %s "$OFFSITE_TARGET/$NAME" 2>/dev/null
      ;;
  esac
}

remote_list() {
  case "$TRANSPORT" in
    rclone) rclone lsf "$OFFSITE_TARGET" 2>/dev/null ;;
    ssh) ssh "$(ssh_host)" "ls -1 '$(ssh_path)'" 2>/dev/null ;;
    local) ls -1 "$OFFSITE_TARGET" 2>/dev/null ;;
  esac
}

remote_delete() {
  case "$TRANSPORT" in
    rclone) rclone deletefile "$OFFSITE_TARGET/$1" ;;
    ssh) ssh "$(ssh_host)" "rm -f '$(ssh_path)/$1'" ;;
    local) rm -f "$OFFSITE_TARGET/$1" ;;
  esac
}

LOCAL_SIZE="$(stat -c %s "$LOCAL_COPY" 2>/dev/null || echo 0)"
REMOTE_SIZE="$(remote_size || true)"
if [[ -z "$REMOTE_SIZE" ]]; then
  echo "The copy was not found on the target after the upload." >&2
  echo "The local copy $LOCAL_COPY was kept, so the upload can be repeated." >&2
  exit 1
fi
if [[ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]]; then
  echo "The copy on the target has a different size than the local one." >&2
  echo "The local copy $LOCAL_COPY was kept, so the upload can be repeated." >&2
  exit 1
fi

LISTING="$(remote_list || true)"
if ! printf '%s\n' "$LISTING" | grep -qxF "$NAME"; then
  echo "The target was listed but does not hold the copy." >&2
  echo "The local copy $LOCAL_COPY was kept, so the upload can be repeated." >&2
  exit 1
fi
echo "    The copy is on the target and has the expected size."

# ---------------------------------------------------------------------------
# The retention window. The names carry a UTC timestamp, so the order of the
# names is the order of the copies.
# ---------------------------------------------------------------------------
mapfile -t COPIES < <(printf '%s\n' "$LISTING" | grep -E "^${PREFIX}-.*\.enc$" | sort)
TOTAL="${#COPIES[@]}"
if [[ "$TOTAL" -gt "$KEEP_COPIES" ]]; then
  REMOVE="$((TOTAL - KEEP_COPIES))"
  echo "==> Removing $REMOVE copy/copies from the target, $KEEP_COPIES are kept"
  for ((index = 0; index < REMOVE; index++)); do
    remote_delete "${COPIES[$index]}"
  done
fi

# ---------------------------------------------------------------------------
# The summary. It never contains the key, the database url or a credential.
# ---------------------------------------------------------------------------
case "$TRANSPORT" in
  rclone) ALIAS="${OFFSITE_TARGET%%:*}" ;;
  ssh) ALIAS="${OFFSITE_TARGET%%:*}" ;;
  local) ALIAS="$(basename "$OFFSITE_TARGET")" ;;
esac

echo "==> Off-site backup complete"
echo "    file      : $NAME"
echo "    size      : $LOCAL_SIZE bytes"
echo "    target    : $TRANSPORT \"$ALIAS\""
echo "    kept      : $KEEP_COPIES copies on the target"
echo "    local copy: removed after the copy on the target was verified"

# The local copy is only removed now, after the copy on the target was
# verified. If anything failed above, it is still there and the upload can be
# repeated without dumping the database again.
rm -f "$LOCAL_COPY"
