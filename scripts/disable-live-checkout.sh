#!/usr/bin/env bash
#
# Turns off live Checkout and hosted-mail sales on this environment, then
# restarts api and worker so the process actually reads the flags.
#
#   cd /opt/blipmade && bash scripts/disable-live-checkout.sh
#
# Stripe keys stay. Existing subscriptions still renew at Stripe until an
# operator cancels them. Open Checkout sessions still exist at Stripe until
# they expire.
#
# Prints no secrets.

set -euo pipefail

ROOT="${BLIPMADE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${BLIPMADE_ENV_FILE:-$ROOT/.env}"
COMPOSE_FILES=(-f compose.yml -f compose.api.yml -f compose.web.yml)

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "the file $ENV_FILE does not exist"
[ -w "$ENV_FILE" ] || fail "the file $ENV_FILE cannot be written"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${ENV_FILE}.before-disable-checkout-${STAMP}"
cp -p "$ENV_FILE" "$BACKUP"
say "the file before the change is kept as $BACKUP"

write_value() {
  local name="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp)"
  if grep -qE "^[[:space:]]*${name}=" "$ENV_FILE"; then
    awk -v name="$name" -v value="$value" '
      BEGIN { done = 0 }
      $0 ~ "^[[:space:]]*" name "=" && done == 0 { print name "=" value; done = 1; next }
      $0 ~ "^[[:space:]]*" name "=" && done == 1 { next }
      { print }
    ' "$ENV_FILE" >"$temporary"
  else
    cp "$ENV_FILE" "$temporary"
    printf '%s=%s\n' "$name" "$value" >>"$temporary"
  fi
  cat "$temporary" >"$ENV_FILE"
  rm -f "$temporary"
}

write_value PAYMENTS_ENABLED "false"
write_value MAIL_SALES_ENABLED "false"
say "PAYMENTS_ENABLED=false and MAIL_SALES_ENABLED=false were written into $ENV_FILE"

flag_in_file() {
  awk -F= -v name="$1" '$1 == name { print $2; exit }' "$ENV_FILE"
}

[ "$(flag_in_file PAYMENTS_ENABLED)" = "false" ] || fail "PAYMENTS_ENABLED was not written as false"
[ "$(flag_in_file MAIL_SALES_ENABLED)" = "false" ] || fail "MAIL_SALES_ENABLED was not written as false"

cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  fail "docker is not available, the files were written but the services were not restarted"
fi

say "restarting the api and the worker"
docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate api worker

say "waiting for the api to answer"
ok=0
for _ in $(seq 1 30); do
  if timeout 10 docker compose "${COMPOSE_FILES[@]}" exec -T api node -e "process.exit(0)" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
[ "$ok" = 1 ] || fail "the api container did not answer after recreate"

PAY_PROC="$(timeout 20 docker compose "${COMPOSE_FILES[@]}" exec -T api printenv PAYMENTS_ENABLED | tr -d '\r')"
MAIL_PROC="$(timeout 20 docker compose "${COMPOSE_FILES[@]}" exec -T api printenv MAIL_SALES_ENABLED | tr -d '\r')"
say "api process PAYMENTS_ENABLED=${PAY_PROC}"
say "api process MAIL_SALES_ENABLED=${MAIL_PROC}"
[ "$PAY_PROC" = "false" ] || fail "the running api still has PAYMENTS_ENABLED=${PAY_PROC}"
[ "$MAIL_PROC" = "false" ] || fail "the running api still has MAIL_SALES_ENABLED=${MAIL_PROC}"

say "done. New Checkout sessions must return payments_unavailable. Existing Stripe subscriptions are unchanged."
