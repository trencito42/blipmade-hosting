#!/usr/bin/env bash
# Ruleaza suita de teste a API-ului din arborele de lucru al ramurii, pe VM.
#
#   bash run-tests-repo.sh [baza_de_test] [fisier_de_test...]
#
# Baza de test e aleasa prin perf-db.sh, care verifica numele bazei inainte de
# orice scriere; baza vie nu poate fi atinsa. Redis e adresat prin localhost:
# numele de container nu se rezolva de pe gazda, iar o asteptare fara sfarsit
# ar bloca testul.
set -euo pipefail

REPO="${REPO:-/opt/blipmade}"
DB="${1:-blipmade_phase16_test}"
shift || true

cd "$REPO/api"
set -a
# shellcheck disable=SC1091
source "$REPO/.env"
set +a

PERF_ROOT="$REPO" source "$REPO/audit/_tools/perf-db.sh" "$DB"

export REDIS_URL="$(python3 "$REPO/audit/_tools/redis-db-url.py" "$REDIS_URL" 127.0.0.1 1)"
export NODE_ENV=test
export LOG_LEVEL=silent
export STRIPE_TEST_MODE=true
export STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_PUBLISHABLE_KEY=
export SMTP_URL= COOKIE_SECURE=false

exec npx vitest run "$@"
