#!/usr/bin/env bash
# Construiește URL-ul bazei de măsurători și verifică numele bazei înainte de orice scriere.
#
# Regula: scriptul nu atinge nicio bază în care numele nu e exact cel cerut.
# Fără asta, o eroare de substrare poate ajunge să scrie în baza vie.
set -euo pipefail

ROOT="${PERF_ROOT:-/home/debian/bm-phase14}"
TARGET_DB="${1:?foloseste: perf-db.sh <nume_baza>}"

URL="$(python3 "$ROOT/perf-db-url.py" "$ROOT/.env" "$TARGET_DB")"

DB_NAME="$(python3 "$ROOT/perf-db-name.py" "$URL")"
if [[ "$DB_NAME" != "$TARGET_DB" ]]; then
  echo "REFUZ: URL-ul a dus la baza \"$DB_NAME\", nu la \"$TARGET_DB\"" >&2
  exit 9
fi

export DATABASE_URL="$URL"
export PERF_DB_NAME="$DB_NAME"
echo "$URL" > /tmp/perf-db-url.txt
