#!/usr/bin/env bash
# Ruleaza un test sau suita API pe baza proprie a worktree-ului.
#
# Baza este aleasa prin perf-db.sh, care verifica numele bazei inainte de
# orice scriere, iar Redis este adresat prin localhost: numele de container
# nu se rezolva de pe gazda, iar o asteptare fara sfarsit ar bloca testul.
#
#   ./run-tests.sh [baza] [fisier_de_test...]
set -euo pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${1:-blipmade_phase16_test}"
shift || true

cd "$WORKTREE"
set -a
# shellcheck disable=SC1091
source ./.env
set +a
# shellcheck disable=SC1091
PERF_ROOT="$WORKTREE" source ./perf-db.sh "$DB"

export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis:\/\/localhost:}"
export NODE_ENV=test
export LOG_LEVEL=silent
export STRIPE_TEST_MODE=true
export STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_PUBLISHABLE_KEY=
export SMTP_URL= COOKIE_SECURE=false

cd "$WORKTREE/api"
exec npx vitest run "$@"
