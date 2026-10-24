#!/usr/bin/env bash
# Aplica migrarile pe baza de test, prin acelasi helper care verifica numele
# bazei. Baza vie nu poate fi atinsa: numele cerut este verificat inainte de
# orice scriere.
#
#   bash migrate-test-db.sh [nume_baza]
set -euo pipefail

REPO="${REPO:-/opt/blipmade}"
DB="${1:-blipmade_phase16_test}"

cd "$REPO/api"
set -a
# shellcheck disable=SC1091
source "$REPO/.env"
set +a

PERF_ROOT="$REPO" source "$REPO/audit/_tools/perf-db.sh" "$DB"
echo "baza: $PERF_DB_NAME"

npx prisma migrate deploy
echo
echo "starea migrarilor:"
npx prisma migrate status | tail -8
