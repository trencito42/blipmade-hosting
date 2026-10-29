#!/usr/bin/env bash
# Puts the base of the platform in one of its two modes, and says which one
# is in place.
#
#   cloudflare  The traffic of the base goes through Cloudflare, and the edge
#               answers with the certificate of Cloudflare Origin CA. The
#               certificate of the visitor is the one of Cloudflare, so the
#               zone of Cloudflare has to hold a certificate that covers the
#               base. This is the mode the platform is built for.
#
#   direct      The traffic of the base goes straight to the edge, and Caddy
#               obtains a public certificate for every host name of a route.
#               This mode needs two things from outside: the firewall of the
#               provider has to let the ports 80 and 443 of the edge through
#               to the world, and the name has to point at the edge without
#               the proxy of Cloudflare in front of it.
#
# The mode is a property of the base, not of a host name: the certificate of
# the origin covers the whole base, so the edge either answers with it or
# manages the certificates of the base itself.
#
# Usage: switch-apps-tls.sh cloudflare|direct|status
set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
CLOUDFLARE="/etc/caddy/Caddyfile.cloudflare"
DIRECT="/etc/caddy/Caddyfile.direct"

mode_of() {
  if grep -q "blipmade-origin.crt" "$CADDYFILE" 2>/dev/null; then
    echo "cloudflare"
  else
    echo "direct"
  fi
}

case "${1:-status}" in
  status)
    echo "mode: $(mode_of)"
    echo "file: $CADDYFILE"
    ;;
  cloudflare|direct)
    target="$CLOUDFLARE"
    [ "$1" = "direct" ] && target="$DIRECT"
    if [ ! -f "$target" ]; then
      echo "The file of the mode '$1' is not there: $target" >&2
      exit 1
    fi
    # The file that is in place is kept, so the mode can be put back.
    cp "$CADDYFILE" "$CADDYFILE.before-switch"
    cp "$target" "$CADDYFILE"
    if ! caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
      echo "The configuration of the mode '$1' is not valid; the file that was in place was put back." >&2
      cp "$CADDYFILE.before-switch" "$CADDYFILE"
      exit 1
    fi
    caddy reload --config "$CADDYFILE" >/dev/null 2>&1
    echo "mode: $(mode_of)"
    # The routes of the customers are written again by the worker of the
    # platform within the minute; the reload took them away.
    echo "the routes of the customers come back within the minute."
    ;;
  *)
    echo "Usage: $0 cloudflare|direct|status" >&2
    exit 2
    ;;
esac
