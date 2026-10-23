#!/usr/bin/env bash
# Installs the schedule of the backup of the Blipmade platform.
#
# The backup scripts were already there, but nothing ran them: the platform
# had a manual backup and no schedule. This script installs the systemd unit
# and the timer that run it every night, and it can be run again at any time:
# it is idempotent.
#
# It needs root, because the units go into /etc/systemd/system.
#
#   sudo scripts/install-backup-timer.sh [--run-now]
#
# The off-site copy is a separate decision: without an off-site target the
# timer still runs the local backup, and the report says so.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$ROOT/scripts/systemd"
RUN_NOW=0

for arg in "$@"; do
  case "$arg" in
    --run-now) RUN_NOW=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$(id -u)" != "0" ]]; then
  echo "This script installs a systemd unit and needs root." >&2
  exit 1
fi

for unit in blipmade-backup.service blipmade-backup.timer; do
  if [[ ! -f "$UNIT_DIR/$unit" ]]; then
    echo "Missing unit: $UNIT_DIR/$unit" >&2
    exit 1
  fi
  install -m 0644 "$UNIT_DIR/$unit" "/etc/systemd/system/$unit"
  echo "installed /etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now blipmade-backup.timer
echo "enabled blipmade-backup.timer"

if [[ "$RUN_NOW" == "1" ]]; then
  echo "== running the backup once"
  systemctl start blipmade-backup.service
  systemctl --no-pager --full status blipmade-backup.service || true
fi

echo
echo "== the schedule"
systemctl list-timers blipmade-backup.timer --no-pager || true
echo
echo "== the last result"
systemctl --no-pager --full status blipmade-backup.service || true
echo
echo "The local backup is scheduled. It is not a backup until the copy leaves"
echo "the host: set OFFSITE_TARGET (and the encryption key) in /opt/blipmade/.env."
