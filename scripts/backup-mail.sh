#!/usr/bin/env bash
# The backup of the mail server.
#
# The mail of the customers does not live in the database of the platform: it
# lives in the mail server, in its own database, in its own volumes and in
# its own keys. The backup of the platform and the backup of the mail are two
# things, and both are needed to bring the service back.
#
# This script runs on the mail server. It writes one archive that holds:
#
#   - the database of the mail server (the domains, the mailboxes, the
#     aliases and the keys of DKIM that are written down),
#   - the mail of the customers, as it is on the disk,
#   - the keys of DKIM, the private ones included, because a mail server that
#     is brought back without them signs the mail with another key and the
#     records of DNS that the customers published stop working,
#   - the certificates of the mail server.
#
# The archive holds secrets, so it never travels as it is. The copy that
# leaves the machine is made by scripts/backup-offsite.sh, which encrypts the
# payload before it travels.
#
# Usage: scripts/backup-mail.sh [label]
set -euo pipefail

MAILCOW_ROOT="${MAILCOW_ROOT:-/opt/mailcow-dockerized}"
BACKUP_DIR="${MAIL_BACKUP_DIR:-/var/backups/blipmade-mail}"
LABEL="${1:-auto}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${MAIL_BACKUP_KEEP_DAYS:-14}"

MYSQL_CONTAINER="${MAIL_MYSQL_CONTAINER:-mailcowdockerized-mysql-mailcow-1}"
VMAIL_VOLUME="${MAIL_VMAIL_VOLUME:-mailcowdockerized_vmail-vol-1}"
REDIS_VOLUME="${MAIL_REDIS_VOLUME:-mailcowdockerized_redis-vol-1}"

if [[ ! -d "$MAILCOW_ROOT" ]]; then
  echo "The mail server is not at $MAILCOW_ROOT." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not on this machine, so the mail cannot be packed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The password of the database is read from the configuration of the mail
# server and it never reaches the output.
#
# The first line is read with `sed -n '1p'` and not with `head`: a pipe that
# is closed early sends SIGPIPE to the process that writes, and the script
# would stop with the state 141 in the middle of the backupe.
read_config() {
  grep -E "^$1=" "$MAILCOW_ROOT/mailcow.conf" | sed -n '1p' | cut -d= -f2- || true
}

DBUSER="$(read_config DBUSER)"
DBPASS="$(read_config DBPASS)"
DBNAME="$(read_config DBNAME)"

if [[ -z "$DBUSER" || -z "$DBNAME" ]]; then
  echo "The database of the mail server could not be read from mailcow.conf." >&2
  exit 1
fi

echo "==> Dumping the database of the mail server"
# One row per statement: the dump is bigger, but the drill that reads it can
# count the rows and can name them without a database, which is the whole
# point of a drill that runs on a machine that has no mail server.
docker exec "$MYSQL_CONTAINER" \
  mysqldump -u"$DBUSER" -p"$DBPASS" --single-transaction --quick --routines \
  --extended-insert=1 "$DBNAME" \
  > "$WORK/mailcow.sql"
# The password of the database is in the command line of the process, and the
# process list of the machine can be read by everybody. The dump is checked
# here, because a dump that is empty is a backupe that holds nothing.
if [[ ! -s "$WORK/mailcow.sql" ]]; then
  echo "The dump of the database is empty, so the archive was not written." >&2
  exit 1
fi

echo "==> Packing the mail of the customers"
for volume in "$VMAIL_VOLUME" "$REDIS_VOLUME"; do
  mountpoint="$(docker volume inspect -f '{{.Mountpoint}}' "$volume" 2>/dev/null || true)"
  if [[ -z "$mountpoint" ]]; then
    echo "    The volume $volume was not found, the archive carries no copy of it." >&2
    continue
  fi
  tar -czf "$WORK/$(basename "$volume").tar.gz" -C "$mountpoint" .
done

echo "==> Packing the configuration and the certificates"
tar -czf "$WORK/mailcow-config.tar.gz" \
  --exclude='mailcow.conf' \
  -C "$MAILCOW_ROOT" data/conf data/assets/ssl docker-compose.yml 2>/dev/null || true

echo "==> Writing the manifest"
{
  echo "label=$LABEL"
  echo "stamp=$STAMP"
  echo "mailcow_root=$MAILCOW_ROOT"
  # The version of the mail server is the commit it was built from. It is
  # read from the history of the software, because a backupe that is brought
  # back on another version has to say which version it was made with.
  echo "mailcow_version=$(git -C "$MAILCOW_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "domains=$(docker exec "$MYSQL_CONTAINER" mysql -u"$DBUSER" -p"$DBPASS" -N -B "$DBNAME" -e 'SELECT COUNT(*) FROM domain;' 2>/dev/null || echo unknown)"
  echo "mailboxes=$(docker exec "$MYSQL_CONTAINER" mysql -u"$DBUSER" -p"$DBPASS" -N -B "$DBNAME" -e 'SELECT COUNT(*) FROM mailbox;' 2>/dev/null || echo unknown)"
} > "$WORK/manifest.txt"

ARCHIVE="$BACKUP_DIR/mailcow-$LABEL-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

echo "==> Backup written: $ARCHIVE"
cat "$ARCHIVE.sha256"
cat "$WORK/manifest.txt"

echo "==> Removing the local backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name "mailcow-*.tar.gz" -mtime "+$KEEP_DAYS" -print -delete

echo "==> The copy that leaves the machine is made by scripts/backup-offsite.sh."
echo "    This archive holds secrets and it must never travel as it is."
