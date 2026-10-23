#!/usr/bin/env bash
#
# Installs the Blipmade panel bridge into a Pterodactyl panel.
#
# Run it on the panel host as root:
#
#     ./install.sh /var/www/pterodactyl 10.77.0.13
#
# The first argument is the panel directory (default /var/www/pterodactyl, also taken from
# PANEL_DIR), the second is the list of addresses a client key may be used from (also taken
# from BLIPMADE_KEYMINT_ALLOWED_IPS). That list is the address of the Blipmade server, because
# that is the address the client key is used from.
#
# The script may be run again at any time: the route is registered only once, an existing secret
# is never overwritten and no file is ever deleted.
#
# Two layouts of the panel are supported:
#
#  - the panels that keep every api route in routes/api.php get the route appended to that file.
#  - the panels that split the routes into routes/api-client.php and routes/api-application.php
#    (Pterodactyl 1.11 and newer) get a service provider, because every one of those route
#    files sits behind a middleware that asks for a session or for an API key, and the bridge
#    carries its own signature.

set -euo pipefail

PANEL_DIR="${1:-${PANEL_DIR:-/var/www/pterodactyl}}"
ALLOWED_IPS="${2:-${BLIPMADE_KEYMINT_ALLOWED_IPS:-}}"
SECRET="${BLIPMADE_KEYMINT_SECRET:-}"
PHP_BIN="${PHP_BIN:-php}"

# The marker of the route. It is the same text as in routes-snippet.php.
MARKER='Blipmade panel bridge'

# The provider of the modern layout.
PROVIDER_CLASS='Pterodactyl\Providers\BlipmadeBridgeServiceProvider::class'

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
[ -f "$PANEL_DIR/app/Http/Controllers/Controller.php" ] || fail "$PANEL_DIR is not a Pterodactyl panel (the base controller is missing)"
[ -f "$PANEL_DIR/config/app.php" ] || fail "$PANEL_DIR is not a Pterodactyl panel (the configuration is missing)"

if [ -f "$PANEL_DIR/routes/api.php" ]; then
    LAYOUT='legacy'
    say "panel layout: the api routes are in routes/api.php"
elif [ -f "$PANEL_DIR/app/Providers/RouteServiceProvider.php" ]; then
    LAYOUT='provider'
    say "panel layout: the api routes are split, the bridge is registered by a provider"
else
    fail "$PANEL_DIR is not a Pterodactyl panel (no routes were found)"
fi

CONTROLLER_TARGET="$PANEL_DIR/app/Http/Controllers/BlipmadeKeyMintController.php"
CONFIG_TARGET="$PANEL_DIR/config/blipmade_bridge.php"
ENV_FILE="$PANEL_DIR/.env"

say "panel directory: $PANEL_DIR"

# --- 2. the files -----------------------------------------------------------------------

say "copying the controller"
copy_into_panel "$SRC_DIR/BlipmadeKeyMintController.php" "$CONTROLLER_TARGET"

say "copying the configuration"
copy_into_panel "$SRC_DIR/config/blipmade_bridge.php" "$CONFIG_TARGET"

# --- 3. the route ------------------------------------------------------------------------

if [ "$LAYOUT" = 'legacy' ]; then
    ROUTES_FILE="$PANEL_DIR/routes/api.php"
    if grep -Fq "$MARKER" "$ROUTES_FILE"; then
        say "the route is already registered, nothing is added"
    else
        say "registering the route in routes/api.php"
        ensure_trailing_newline "$ROUTES_FILE"
        cat "$SRC_DIR/routes-snippet.php" >>"$ROUTES_FILE"
    fi
else
    PROVIDER_TARGET="$PANEL_DIR/app/Providers/BlipmadeBridgeServiceProvider.php"
    say "copying the provider"
    copy_into_panel "$SRC_DIR/BlipmadeBridgeServiceProvider.php" "$PROVIDER_TARGET"

    APP_CONFIG="$PANEL_DIR/config/app.php"
    if grep -Fq 'BlipmadeBridgeServiceProvider' "$APP_CONFIG"; then
        say "the provider is already registered, nothing is added"
    else
        say "registering the provider in config/app.php"
        # The line is put right after the provider of the routes, so it sits with the other
        # providers of the panel. The file keeps its owner and its rights, because the new
        # content is written into the old file instead of replacing it.
        #
        # The class is handed over through the environment: awk reads a backslash of a value
        # that is set with -v as an escape sequence, and the namespace of the provider would
        # then lose its backslashes.
        TMP_CONFIG="$(mktemp)"
        BLIPMADE_PROVIDER_LINE="        ${PROVIDER_CLASS}," \
            awk '{ print }
                !done && /Pterodactyl\\Providers\\RouteServiceProvider::class,/ {
                    print ENVIRON["BLIPMADE_PROVIDER_LINE"]; done = 1
                }' "$APP_CONFIG" >"$TMP_CONFIG"
        if ! grep -Fq 'BlipmadeBridgeServiceProvider' "$TMP_CONFIG"; then
            # The anchor was not found, so the line goes in right after the opening of the list.
            BLIPMADE_PROVIDER_LINE="        ${PROVIDER_CLASS}," \
                awk '{ print }
                    !done && /providers.*=>.*\[/ {
                        print ENVIRON["BLIPMADE_PROVIDER_LINE"]; done = 1
                    }' "$APP_CONFIG" >"$TMP_CONFIG"
        fi
        grep -Fq 'BlipmadeBridgeServiceProvider' "$TMP_CONFIG" || fail "the provider could not be added to config/app.php"
        cat "$TMP_CONFIG" >"$APP_CONFIG"
        rm -f "$TMP_CONFIG"
    fi
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

# The caches of the panel are written by the web server, so they are cleared as the owner of the
# panel. Clearing them as root would leave files that the web server may not write again.
PANEL_USER="$(stat -c '%U' "$PANEL_DIR" 2>/dev/null || echo 'root')"
if [ "$(id -u)" -eq 0 ] && [ "$PANEL_USER" != 'root' ] && command -v sudo >/dev/null 2>&1; then
    (cd "$PANEL_DIR" && sudo -u "$PANEL_USER" "$PHP_BIN" artisan optimize:clear) || CLEAR_STATUS=$?
else
    (cd "$PANEL_DIR" && "$PHP_BIN" artisan optimize:clear) || CLEAR_STATUS=$?
fi

# --- 6. what the operator has to do ------------------------------------------------------

APP_URL="$(env_value APP_URL "$ENV_FILE")"
if [ -z "$APP_URL" ]; then
    APP_URL='https://<the host of the panel>'
fi

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

    PANEL_KEYMINT_URL=${APP_URL}/api/blipmade/keymint
    PANEL_KEYMINT_SECRET=$SECRET

The list of allowed addresses of the panel is:

    BLIPMADE_KEYMINT_ALLOWED_IPS=$ALLOWED_IPS

That list must name the address of the Blipmade server, because that is the address the client
key is used from. Restart the api and the worker afterwards, they read the .env when they start.

EOF

exit "$CLEAR_STATUS"
