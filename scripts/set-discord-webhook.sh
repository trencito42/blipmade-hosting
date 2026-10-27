#!/usr/bin/env bash
#
# Puts the address of the Discord channel of the alarms on the machine of the
# platform and checks that the message arrives.
#
# The address is read from the standard input, so it never appears in the
# list of the processes and never in the history of a shell:
#
#     printf '%s' "$WEBHOOK" | ./scripts/set-discord-webhook.sh
#
# The address is written in a file that only the owner of the machine can
# reach, and the platform is told where that file is. The address therefore
# travels neither with the rest of the environment nor with a copy of the
# configuration. The script prints the host of the channel and never the
# address itself.
#
# The check is done with the code of the platform: the same function that
# sends an alarm sends the test message, so a message that arrives proves that
# the alarms arrive too.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BLIPMADE_ENV_FILE:-$ROOT/.env}"
# The path of the file with the address. It is the same on the machine and
# inside the containers: the compose files mount the file at this path, and
# the platform reads the path that is written in the environment.
SECRETS_DIR="${BLIPMADE_SECRETS_DIR:-/opt/blipmade/secrets}"
WEBHOOK_FILE="${OPS_DISCORD_WEBHOOK_FILE:-$SECRETS_DIR/discord-webhook}"
COMPOSE_FILES=(-f compose.yml -f compose.api.yml -f compose.web.yml)

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

cd "$ROOT"
[ -f "$ENV_FILE" ] || fail "the file $ENV_FILE does not exist"

# --- 1. the address ------------------------------------------------------------------------

# The address is read at once: reading the input line by line with several
# commands would lose lines.
mapfile -t LINES
WEBHOOK="${LINES[0]:-}"
unset LINES

[ -n "$WEBHOOK" ] || fail "the address of the channel is missing"

case "$WEBHOOK" in
  https://discord.com/api/webhooks/*|https://discordapp.com/api/webhooks/*|https://canary.discord.com/api/webhooks/*) ;;
  *) fail "the address does not look like a webhook of Discord" ;;
esac

# The shape the platform checks itself: the host has to be Discord and the
# path has to name a channel and a token.
if ! printf '%s' "$WEBHOOK" | grep -qE '^https://(discord\.com|discordapp\.com|canary\.discord\.com)/api/(v[0-9]+/)?webhooks/[0-9]+/[A-Za-z0-9_.-]+$'; then
  fail "the address does not look like a webhook of Discord"
fi

# The host is the only part of the address that is shown.
HOST="$(printf '%s' "$WEBHOOK" | sed -E 's#^https://([^/]+)/.*#\1#')"
say "the channel of the alarms is on $HOST"

# --- 2. the file that only the owner can read ------------------------------------------------

mkdir -p "$SECRETS_DIR"
chmod 0700 "$SECRETS_DIR" 2>/dev/null \
  || fail "the directory $SECRETS_DIR belongs to another user and cannot be closed; the address of the channel would be readable by the other users of the machine"

# The container of the platform runs under another user than the owner of the
# machine (`blip`, 100, and `debian`, 1000), so the file cannot stay 0600: the
# container would not be able to read it. The file is read only for everybody
# and the directory that holds it is closed to the other users of the machine,
# so the address is reachable by the owner of the machine and by the platform,
# and by nobody else.
#
# The file is written under another name and moved into place: a file that is
# read only cannot be written over, and a move needs only the permission on
# the directory.
if [ -d "$WEBHOOK_FILE" ]; then
  # A mount of a file that is not there yet leaves a directory behind.
  rmdir "$WEBHOOK_FILE" 2>/dev/null \
    || fail "the path $WEBHOOK_FILE is a directory and cannot be replaced by the file of the channel"
fi

umask 077
TMP_FILE="$(mktemp "$SECRETS_DIR/.discord-webhook.XXXXXX")"
printf '%s' "$WEBHOOK" >"$TMP_FILE"
chmod 0444 "$TMP_FILE"
mv -f "$TMP_FILE" "$WEBHOOK_FILE"
unset WEBHOOK

say "the address is written in $WEBHOOK_FILE (the directory is closed to the other users)"

# --- 3. the environment -----------------------------------------------------------------------

if grep -qE '^[[:space:]]*OPS_DISCORD_WEBHOOK_FILE=' "$ENV_FILE"; then
  # The line is replaced, not appended: a file with two values of one name is
  # a file nobody can read.
  awk -v value="$WEBHOOK_FILE" '
    BEGIN { done = 0 }
    $0 ~ "^[[:space:]]*OPS_DISCORD_WEBHOOK_FILE=" && done == 0 { print "OPS_DISCORD_WEBHOOK_FILE=" value; done = 1; next }
    $0 ~ "^[[:space:]]*OPS_DISCORD_WEBHOOK_FILE=" && done == 1 { next }
    { print }
  ' "$ENV_FILE" >"$ENV_FILE.tmp"
  cat "$ENV_FILE.tmp" >"$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
  say "the path of the file was already in the environment, it was replaced"
else
  printf 'OPS_DISCORD_WEBHOOK_FILE=%s\n' "$WEBHOOK_FILE" >>"$ENV_FILE"
  say "the path of the file was added to the environment"
fi

# --- 4. the restart ------------------------------------------------------------------------------

command -v docker >/dev/null 2>&1 || fail "docker is not available, the file was written but the services were not restarted"

say "restarting the api and the worker"
docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate api worker

# --- 5. the check --------------------------------------------------------------------------------

say "checking that the platform sees the file"
SEEN=no
for attempt in $(seq 1 30); do
  if docker compose "${COMPOSE_FILES[@]}" exec -T api sh -c 'test -r "$OPS_DISCORD_WEBHOOK_FILE"' >/dev/null 2>&1; then
    SEEN=yes
    break
  fi
  sleep 2
done
[ "$SEEN" = "yes" ] || fail "the container of the api cannot read $WEBHOOK_FILE; the compose files have to mount it"

say "sending a test message with the code of the platform"
# The modules of the platform open connections of their own, so the process
# would stay alive after the work is done. The program therefore ends itself,
# and the call is capped in time: a script that waits for a process that never
# ends is a script that never ends.
RESULT="$(timeout 60 docker compose "${COMPOSE_FILES[@]}" exec -T api node -e "
  import('/app/dist/services/ops-alert-discord.js')
    .then((m) => m.sendDiscordAlert(
      m.toDiscordAlert({
        severity: 'info',
        title: 'Blipmade: the channel of the alarms is set',
        detail: 'The address of the channel was written on the machine of the platform. This message was sent by the platform itself, through the same code that sends the alarms.',
        check: 'discord.channel',
        fingerprint: 'discord.channel.set',
        dashboardUrl: process.env.PUBLIC_WEB_URL ? process.env.PUBLIC_WEB_URL + '/app' : undefined,
      }),
      { attempts: 2, wait: 0 },
    ))
    .then((r) => { process.stdout.write(JSON.stringify(r), () => process.exit(0)); })
    .catch((error) => { process.stdout.write(JSON.stringify({ status: 'failed', reason: String(error?.message ?? error) }), () => process.exit(0)); });
" 2>/dev/null || echo '{"status":"failed","reason":"the container did not answer"}')"

STATUS="$(printf '%s' "$RESULT" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p')"
REASON="$(printf '%s' "$RESULT" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p')"

printf '    the answer of Discord: %s\n' "${STATUS:-unknown}"
if [ -n "$REASON" ]; then
  printf '    the reason           : %s\n' "$REASON"
fi

if [ "$STATUS" != "sent" ]; then
  fail "the message did not arrive, the address is probably not the right one"
fi

say "done. The alarms of the platform reach this channel."
