#!/usr/bin/env bash
#
# Installs the Blipmade panel bridge into a Pterodactyl panel.
#
# Run it on the panel host as root:
#
#     ./install.sh /var/www/pterodactyl 203.0.113.10
#
# The first argument is the panel directory (default /var/www/pterodactyl, also taken from
# PANEL_DIR), the second is the list of addresses a client key may be used from (also taken
# from BLIPMADE_KEYMINT_ALLOWED_IPS).
#
# The script may be run again at any time: the route is appended only once, an existing secret
# is never overwritten and no file is ever deleted.

set -euo pipefail

PANEL_DIR="${1:-${PANEL_DIR:-/var/www/pterodactyl}}"
ALLOWED_IPS="${2:-${BLIPMADE_KEYMINT_ALLOWED_IPS:-}}"
SECRET="${BLIPMADE_KEYMINT_SECRET:-}"
PHP_BIN="${PHP_BIN:-php}"

# The marker of the route. It is the same text as in routes-snippet.php.
MARKER='Blipmade panel bridge'

# The directory of this script, so the files can be found wherever the script was unpacked.
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Prints the value of a variable of the .env of the panel, without the quotes around it.
env_value() {
    local name="$1"
    local file="$2"
    local value
    value="$(sed -n "s/^[[:space:]]*${name}=//p" "$file" | tail -n 1 || true)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s' "$value"
}

# Appends a line to a file. The file is given a closing newline first, because a file that
# does not end with a newline would swallow the line that is added to it.
append_line() {
    local file="$1"
    local line="$2"
    ensure_trailing_newline "$file"
    printf '%s\n' "$line" >>"$file"
}

# Gives a file a closing newline, so a line that is added to it ends up on a line of its own.
ensure_trailing_newline() {
    local file="$1"
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
        printf '\n' >>"$file"
    fi
}

# Copies a file of the bridge into the panel and keeps the owner of the panel, so the web
# server can still read it.
copy_into_panel() {
    local source="$1"
    local target="$2"
    [ -f "$source" ] || fail "$source is missing"
    mkdir -p "$(dirname "$target")"
    cp -f "$source" "$target"
    chmod 0644 "$target"
    chown --reference="$(dirname "$target")" "$target" 2>/dev/null || true
}

# --- 1. the panel -----------------------------------------------------------------------

[ -d "$PANEL_DIR" ] || fail "the panel directory $PANEL_DIR does not exist"
[ -f "$PANEL_DIR/routes/api.php" ] || fail "$PANEL_DIR/routes/api.php is missing, this does not look like a Pterodactyl panel"
[ -f "$PANEL_DIR/app/Http/Controllers/Controller.php" ] || fail "$PANEL_DIR is not a Pterodactyl panel (the base controller is missing)"
[ -f "$PANEL_DIR/config/app.php" ] || fail "$PANEL_DIR is not a Pterodactyl panel (the configuration is missing)"

CONTROLLER_TARGET="$PANEL_DIR/app/Http/Controllers/BlipmadeKeyMintController.php"
CONFIG_TARGET="$PANEL_DIR/config/blipmade_bridge.php"
ROUTES_FILE="$PANEL_DIR/routes/api.php"
ENV_FILE="$PANEL_DIR/.env"

say "panel directory: $PANEL_DIR"

# --- 2. the files -----------------------------------------------------------------------

say "copying the controller"
copy_into_panel "$SRC_DIR/BlipmadeKeyMintController.php" "$CONTROLLER_TARGET"

say "copying the configuration"
copy_into_panel "$SRC_DIR/config/blipmade_bridge.php" "$CONFIG_TARGET"

# --- 3. the route ------------------------------------------------------------------------

if grep -Fq "$MARKER" "$ROUTES_FILE"; then
    say "the route is already registered, nothing is added"
else
    say "registering the route"
    ensure_trailing_newline "$ROUTES_FILE"
    cat "$SRC_DIR/routes-snippet.php" >>"$ROUTES_FILE"
fi

# --- 4. the .env of the panel ------------------------------------------------------------

if [ ! -f "$ENV_FILE" ]; then
    say "the panel has no .env, one is created"
    touch "$ENV_FILE"
fi

if grep -qE '^[[:space:]]*BLIPMADE_KEYMINT_SECRET=' "$ENV_FILE"; then
    say "the secret is already in the .env of the panel, it is left alone"
else
    if [ -z "$SECRET" ]; then
        if command -v openssl >/dev/null 2>&1; then
            SECRET="$(openssl rand -hex 32)"
        else
            # openssl is not always installed, /dev/urandom is always there.
            SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
    fi
    say "adding the secret to the .env of the panel"
    append_line "$ENV_FILE" "BLIPMADE_KEYMINT_SECRET=$SECRET"
fi

if grep -qE '^[[:space:]]*BLIPMADE_KEYMINT_ALLOWED_IPS=' "$ENV_FILE"; then
    say "the list of allowed addresses is already in the .env of the panel, it is left alone"
else
    say "adding the list of allowed addresses to the .env of the panel"
    append_line "$ENV_FILE" "BLIPMADE_KEYMINT_ALLOWED_IPS=$ALLOWED_IPS"
fi

# The values that the panel will really use, and that the operator has to copy over.
SECRET="$(env_value BLIPMADE_KEYMINT_SECRET "$ENV_FILE")"
ALLOWED_IPS="$(env_value BLIPMADE_KEYMINT_ALLOWED_IPS "$ENV_FILE")"

# --- 5. the caches of the panel ----------------------------------------------------------

say "clearing the caches of the panel"
CLEAR_STATUS=0
(cd "$PANEL_DIR" && "$PHP_BIN" artisan optimize:clear) || CLEAR_STATUS=$?

# --- 6. what the operator has to do ------------------------------------------------------

printf '\n'
say "the bridge is installed"

if [ -z "$SECRET" ]; then
    printf 'the secret is empty, so the endpoint answers 503 "disabled" until it is set\n'
fi
if [ -z "$ALLOWED_IPS" ]; then
    printf 'the list of allowed addresses is empty, so the endpoint answers 503 "disabled" until it is set\n'
fi
if [ "$CLEAR_STATUS" -ne 0 ]; then
    printf 'the caches of the panel were not cleared (php artisan optimize:clear failed), run it by hand\n'
fi

cat <<EOF

Add these two lines to the .env of Blipmade (the control plane host, /opt/blipmade/.env):

    PANEL_KEYMINT_URL=https://<the host of the panel>/api/blipmade/keymint
    PANEL_KEYMINT_SECRET=$SECRET

The list of allowed addresses of the panel is:

    BLIPMADE_KEYMINT_ALLOWED_IPS=$ALLOWED_IPS

That list must name the public address of the Blipmade server, because that is the address
from which the client key is used. Restart the api and the worker afterwards, they read the
.env when they start.
EOF

exit "$CLEAR_STATUS"
