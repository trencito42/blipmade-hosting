#!/usr/bin/env bash
#
# Puts the live keys of Stripe into the .env of the platform and restarts the
# parts that read them.
#
# The keys are read from the standard input, one per line, so they never
# appear in the list of the processes and never in the history of a shell:
#
#     printf '%s\n' "$SECRET" "$PUBLIC" "$WEBHOOK" | ./scripts/apply-stripe-live.sh
#
# The script refuses a key that does not look like a live key, it keeps a copy
# of the .env before it writes, and it prints nothing that holds a secret: the
# values are only ever counted, never shown.
#
# The switch is done in one step, so the platform is never left half of it:
# the three keys and the flag are written together and the api and the worker
# are restarted together.
#
# The payment of the platform stays in the sandbox until this script is run.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BLIPMADE_ENV_FILE:-$ROOT/.env}"
COMPOSE_FILES=(-f compose.yml -f compose.api.yml -f compose.web.yml)

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "the file $ENV_FILE does not exist"
[ -w "$ENV_FILE" ] || fail "the file $ENV_FILE cannot be written"

# --- 1. the keys ------------------------------------------------------------------------

# The three keys are read at once. Reading the input one line at a time with
# several commands would lose lines, because the first command reads ahead.
mapfile -t KEY_LINES
SECRET_KEY="${KEY_LINES[0]:-}"
PUBLIC_KEY="${KEY_LINES[1]:-}"
WEBHOOK_SECRET="${KEY_LINES[2]:-}"
unset KEY_LINES

[ -n "$SECRET_KEY" ] || fail "the secret key is missing"
[ -n "$PUBLIC_KEY" ] || fail "the public key is missing"
[ -n "$WEBHOOK_SECRET" ] || fail "the secret of the webhook is missing"

case "$SECRET_KEY" in
  sk_live_*) ;;
  *) fail "the secret key does not start with sk_live_. The sandbox key is refused here." ;;
esac
case "$PUBLIC_KEY" in
  pk_live_*) ;;
  *) fail "the public key does not start with pk_live_. The sandbox key is refused here." ;;
esac
case "$WEBHOOK_SECRET" in
  whsec_*) ;;
  *) fail "the secret of the webhook does not start with whsec_." ;;
esac

# The length of a real key. A key that was cut in half is refused here and
# not after the restart of the platform.
[ "${#SECRET_KEY}" -ge 20 ] || fail "the secret key is too short"
[ "${#PUBLIC_KEY}" -ge 20 ] || fail "the public key is too short"
[ "${#WEBHOOK_SECRET}" -ge 16 ] || fail "the secret of the webhook is too short"

# --- 2. the copy of the file before it is written ----------------------------------------

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${ENV_FILE}.before-stripe-live-${STAMP}"
cp -p "$ENV_FILE" "$BACKUP"
say "the file before the change is kept as $BACKUP"

# --- 3. the file --------------------------------------------------------------------------

# The value of a line is written as it is. A key of Stripe never holds a space
# or a quote, and the check above makes sure of it.
write_value() {
  local name="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp)"
  if grep -qE "^[[:space:]]*${name}=" "$ENV_FILE"; then
    # The line is replaced, not appended: the platform reads the last value of
    # a name, and a file with two values of one name is a file nobody can
    # read.
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

write_value STRIPE_SECRET_KEY "$SECRET_KEY"
write_value STRIPE_PUBLISHABLE_KEY "$PUBLIC_KEY"
write_value STRIPE_WEBHOOK_SECRET "$WEBHOOK_SECRET"
write_value PAYMENTS_ENABLED "true"

# The keys are not shown. Only the fact that they were written is.
say "the three keys and the switch of the payments were written into $ENV_FILE"

unset SECRET_KEY PUBLIC_KEY WEBHOOK_SECRET

# --- 4. the restart -------------------------------------------------------------------------

cd "$ROOT"

if command -v docker >/dev/null 2>&1; then
  say "restarting the api and the worker"
  docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate api worker

  say "waiting for the api to answer"
  for attempt in $(seq 1 30); do
    if timeout 10 docker compose "${COMPOSE_FILES[@]}" exec -T api node -e "process.exit(0)" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
else
  fail "docker is not available, the files were written but the services were not restarted"
fi

# --- 5. what the platform answers -----------------------------------------------------------

say "the state of the payments, read by the platform itself"
STATUS="$(timeout 60 docker compose "${COMPOSE_FILES[@]}" exec -T api node -e "
  const url = process.env.STRIPE_SECRET_KEY || '';
  const live = url.startsWith('sk_live_');
  process.stdout.write(live ? 'live' : 'not-live');
" 2>/dev/null || echo unknown)"
printf '    the platform reads: %s\n' "$STATUS"

say "done. The payments of the platform now run on the live keys of Stripe."
