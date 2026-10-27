#!/usr/bin/env bash
#
# Puts the Application API key of the panel into the .env of the platform and
# restarts the parts that read it.
#
# The key is read from the standard input, so it never appears in the list of
# the processes and never in the history of a shell:
#
#     printf '%s' "$PANEL_KEY" | ./scripts/apply-panel-key.sh
#
# The script refuses a key that does not look like a key of Pterodactyl, it
# keeps a copy of the .env before it writes, and it prints nothing that holds
# the key: only the host of the panel and the answer of the platform.
#
# The check at the end is done with the code of the platform: the same call
# that lists the servers of the panel when it provisions. A key that the panel
# refuses is therefore caught here, and not at the first order of a customer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BLIPMADE_ENV_FILE:-$ROOT/.env}"
COMPOSE_FILES=(-f compose.yml -f compose.api.yml -f compose.web.yml)

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "the file $ENV_FILE does not exist"
[ -w "$ENV_FILE" ] || fail "the file $ENV_FILE cannot be written"

# --- 1. the key ---------------------------------------------------------------------------

# The key is read at once. Reading the input one line at a time with several
# commands would lose lines, because the first command reads ahead.
mapfile -t KEY_LINES
APP_KEY="${KEY_LINES[0]:-}"
unset KEY_LINES

[ -n "$APP_KEY" ] || fail "the key is missing"

case "$APP_KEY" in
  ptla_*|ptlc_*|*[A-Za-z0-9]*) ;;
  *) fail "the key does not look like a key of the panel." ;;
esac

# A key of Pterodactyl is long. A key that was cut in half is refused here and
# not at the first order of a customer.
[ "${#APP_KEY}" -ge 20 ] || fail "the key is too short"

# --- 2. the copy of the file before it is written ----------------------------------------

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${ENV_FILE}.before-panel-key-${STAMP}"
cp -p "$ENV_FILE" "$BACKUP"
say "the file before the change is kept as $BACKUP"

# --- 3. the file --------------------------------------------------------------------------

# The value of a line is written as it is. A key never holds a space or a
# quote, and the check above makes sure of it.
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

write_value PTERODACTYL_APP_KEY "$APP_KEY"
say "the key of the panel was written into $ENV_FILE"

unset APP_KEY

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
  fail "docker is not available, the file was written but the services were not restarted"
fi

# --- 5. what the platform answers ------------------------------------------------------------

say "the state of the panel, read by the platform itself"
RESULT="$(timeout 60 docker compose "${COMPOSE_FILES[@]}" exec -T api node -e "
  import('/app/dist/services/pterodactyl/application.js')
    .then((m) => m.listServers())
    .then((servers) => process.stdout.write('the panel answered: ' + servers.length + ' server(s)'))
    .catch((error) => {
      process.stdout.write('the panel refused the key: ' + String(error?.message ?? error).slice(0, 160));
      process.exit(0);
    });
" 2>/dev/null || echo 'the container did not answer')"

printf '    %s\n' "$RESULT"

case "$RESULT" in
  *"the panel refused the key"*)
    fail "the panel does not accept this key. The key of the panel is made in the panel: Administration -> API Keys -> Application API, with the permission to create servers."
    ;;
  *"the panel answered"*)
    say "done. The platform sees the panel."
    ;;
  *)
    fail "the answer of the platform could not be read. The key was written, but the check did not finish."
    ;;
esac
