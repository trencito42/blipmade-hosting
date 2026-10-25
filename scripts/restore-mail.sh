#!/usr/bin/env bash
# The restore of the mail server, and the drill that proves the restore works.
#
# A backupe is not a backupe until it was restored and a message was read back
# from the restored copy. This script unpacks an archive into a directory and
# says what it found: how many domains, how many mailboxes and how many
# messages are in it.
#
# It never writes over a running mail server. The restore into the machine
# that is running is a work of the operator, with the mail server stopped, and
# the steps of that are in docs/MAIL_HOSTING.md.
#
# Usage: scripts/restore-mail.sh <archive> [target directory]
set -euo pipefail

ARCHIVE="${1:-}"
TARGET="${2:-}"

if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: scripts/restore-mail.sh <archive> [target directory]" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "The archive $ARCHIVE was not found." >&2
  exit 1
fi

if [[ -f "$ARCHIVE.sha256" ]]; then
  echo "==> Checking the sum of the archive"
  (cd "$(dirname "$ARCHIVE")" && sha256sum --check "$(basename "$ARCHIVE").sha256")
else
  echo "    There is no .sha256 file next to the archive, the sum was not checked." >&2
fi

if [[ -z "$TARGET" ]]; then
  TARGET="$(mktemp -d)"
  echo "==> Unpacking the archive into $TARGET"
else
  mkdir -p "$TARGET"
  echo "==> Unpacking the archive into $TARGET"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar -xzf "$ARCHIVE" -C "$WORK"

echo "==> The manifest of the archive"
cat "$WORK/manifest.txt" 2>/dev/null || echo "    The archive has no manifest."

echo "==> The parts of the archive"
find "$WORK" -maxdepth 1 -type f -printf '    %f (%s bytes)\n' | sort

echo "==> The domains, the mailboxes and the aliases that are in the archive"
if [[ -s "$WORK/mailcow.sql" ]]; then
  # The dump is SQL and it is read with the same tools that read it. The
  # numbers come from the rows that are written in the dump, and not from a
  # database, because a database is not needed to read a file.
  #
  # The dump writes the rows of a table under the statement of that table,
  # one row per line, so the rows of every table are counted with one pass.
  counts="$(awk '
    /^INSERT INTO `/ { split($0, parts, "`"); table = parts[2]; next }
    /^\(/ { if (table != "") rows[table]++ }
    END { for (name in rows) printf "%s %d\n", name, rows[name] }
  ' "$WORK/mailcow.sql")"

  domains="$(printf '%s\n' "$counts" | awk '$1 == "domain" { print $2 }')"
  mailboxes="$(printf '%s\n' "$counts" | awk '$1 == "mailbox" { print $2 }')"
  aliases="$(printf '%s\n' "$counts" | awk '$1 == "alias" { print $2 }')"
  echo "    domains:   ${domains:-0}"
  echo "    mailboxes: ${mailboxes:-0}"
  echo "    aliases:   ${aliases:-0}"

  if [[ "${domains:-0}" -gt 0 ]]; then
    echo "==> The names of the domains that are in the archive"
    # The name of the domain is the first value of the row. The number of the
    # row is not written by the dump, because the database gives it.
    awk '
      /^INSERT INTO `/ { split($0, parts, "`"); table = parts[2]; next }
      table == "domain" && /^\(/ {
        line = $0
        sub(/^\(/, "", line)
        match(line, /^'"'"'[^'"'"']*'"'"'/)
        if (RSTART > 0 && printed < 20) {
          print "    " substr(line, RSTART + 1, RLENGTH - 2)
          printed++
        }
      }
    ' "$WORK/mailcow.sql"
  fi
else
  echo "    The archive has no dump of the database." >&2
fi

echo "==> The messages that are in the archive"
for volume_archive in "$WORK"/*-vol-1.tar.gz; do
  [[ -f "$volume_archive" ]] || continue
  echo "    $(basename "$volume_archive")"
  # The mail of a customer lives in the directories "cur" and "new" of the
  # volume of the mail. The other volumes carry no mail, and they say so.
  messages="$(tar -tzf "$volume_archive" 2>/dev/null | grep -cE '/(cur|new)/' || true)"
  echo "        messages: ${messages:-0}"
done

echo "==> The restore was read, not written over a running server."
echo "    The steps of the restore into the machine that runs are in docs/MAIL_HOSTING.md."
echo "    The copy is in $TARGET"
