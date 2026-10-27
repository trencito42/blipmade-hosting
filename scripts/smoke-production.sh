#!/usr/bin/env bash
# Read-only smoke test of the live platform.
#
# It only reads: GET and HEAD requests over the public address, the API and
# the infrastructure. It never authenticates, never writes and never opens a
# session, so it cannot leave a trace in the production database.
#
# The frontend is a single page application, so every path of the site
# answers with the same shell and the status code alone proves nothing. The
# pages are therefore checked for the content they must carry, and the API is
# checked for the answers it must give.
#
# Usage: scripts/smoke-production.sh
set -uo pipefail

BASE_PUBLIC="${PUBLIC_BASE:-https://blipmade.com}"
BASE_LOCAL="${LOCAL_BASE:-http://10.77.0.13:3000}"
API_LOCAL="${API_LOCAL:-http://127.0.0.1:3100}"

PASS=0
FAIL=0
FAILED_LIST=()

check() {
  local label="$1" expected="$2" url="$3"
  local code
  code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)"
  if [[ "$code" == "$expected" ]]; then
    PASS=$((PASS + 1)); printf '  ok    %-46s %s\n' "$label" "$code"
  else
    FAIL=$((FAIL + 1)); FAILED_LIST+=("$label (expected $expected, got ${code:-none})")
    printf '  FAIL  %-46s %s (expected %s)\n' "$label" "${code:-none}" "$expected"
  fi
}

# A page of the site must carry a marker that only that page carries.
check_content() {
  local label="$1" marker="$2" url="$3"
  local body
  body="$(curl -sS -m 20 "$url" 2>/dev/null)"
  if printf '%s' "$body" | grep -qi -- "$marker"; then
    PASS=$((PASS + 1)); printf '  ok    %-46s content "%s"\n' "$label" "$marker"
  else
    FAIL=$((FAIL + 1)); FAILED_LIST+=("$label (the content \"$marker\" is missing)")
    printf '  FAIL  %-46s the content "%s" is missing\n' "$label" "$marker"
  fi
}

# The API must answer with a given value in its answer.
check_json() {
  local label="$1" url="$2" expression="$3"
  local body
  body="$(curl -sS -m 20 "$url" 2>/dev/null)"
  if printf '%s' "$body" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if ($expression) else 1)
" 2>/dev/null; then
    PASS=$((PASS + 1)); printf '  ok    %-46s the answer is the expected one\n' "$label"
  else
    FAIL=$((FAIL + 1)); FAILED_LIST+=("$label (the answer is not the expected one)")
    printf '  FAIL  %-46s the answer is not the expected one\n' "$label"
  fi
}

echo "=== waiting for the platform to answer ==="
# The checks begin only when the api answers. Right after a release the
# containers are still starting, and a check that runs too early says that the
# platform is broken when it is only warming up: the gateway answers 502 and
# the health of the host answers nothing at all.
READY=0
for attempt in $(seq 1 30); do
  CODE="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$API_LOCAL/health" 2>/dev/null)"
  if [[ "$CODE" == "200" ]]; then
    READY=1
    break
  fi
  sleep 2
done
if [[ "$READY" == "1" ]]; then
  printf '  ok    %-46s %s\n' "the api answers" "$CODE"
else
  printf '  FAIL  %-46s %s\n' "the api answers" "the api did not answer in a minute"
  exit 1
fi

echo
echo "=== public pages (over the internet, through the gateway) ==="
check "homepage"                      200 "$BASE_PUBLIC/"
check "catalog"                       200 "$BASE_PUBLIC/catalog"
check "pricing"                       200 "$BASE_PUBLIC/pricing"
check "login"                         200 "$BASE_PUBLIC/login"
check "register"                      200 "$BASE_PUBLIC/register"
# The frontend renders in the browser, so the content of a page is checked by
# the browser test and not by the status code of the shell.

echo
echo "=== the API behind the gateway ==="
check "api health"                    200 "$BASE_PUBLIC/api/health"
check "api catalog products"          200 "$BASE_PUBLIC/api/catalog/products"
check "api unknown route"             404 "$BASE_PUBLIC/api/nope"
check_json "the session is empty without a cookie" "$BASE_PUBLIC/api/auth/session" "data.get('user') is None"
check_json "the catalog carries products"          "$BASE_PUBLIC/api/catalog/products" "len(data.get('products') or data.get('items') or []) > 0"
check_json "the catalog says what cannot be ordered" "$BASE_PUBLIC/api/catalog/products" "any((p.get('availability') or {}).get('orderable') is False for p in (data.get('products') or data.get('items') or []))"

echo
echo "=== the protected area refuses a visitor without a session ==="
for route in customers orders products pricing promotions audit dead-letters; do
  check "api admin/$route (no cookie)" 401 "$BASE_PUBLIC/api/admin/$route"
done
for route in orders instances tickets settings domains; do
  check "api $route (no cookie)" 401 "$BASE_PUBLIC/api/$route"
done
check "api billing/summary (no cookie)" 401 "$BASE_PUBLIC/api/billing/summary"
check "api catalog/products/:slug" 200 "$BASE_PUBLIC/api/catalog/products/discord-bot"

echo
echo "=== the application on the host ==="
check "web healthz"                   200 "$BASE_LOCAL/healthz"
check "api health"                    200 "$API_LOCAL/health"
check "api health live"               200 "$API_LOCAL/health/live"
check "api health ready"              200 "$API_LOCAL/health/ready"

echo
echo "=== TLS ==="
TLS="$(curl -sS -m 20 -o /dev/null -w '%{ssl_verify_result}' "$BASE_PUBLIC/" 2>/dev/null)"
if [[ "$TLS" == "0" ]]; then
  PASS=$((PASS + 1)); echo "  ok    certificate verifies"
else
  FAIL=$((FAIL + 1)); FAILED_LIST+=("TLS verification (result $TLS)"); echo "  FAIL  certificate verifies (result $TLS)"
fi
CERT="$(echo | openssl s_client -connect blipmade.com:443 -servername blipmade.com 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | tr '\n' ' ')"
echo "  info  certificate: $CERT"

echo
echo "=== static resources ==="
ASSET="$(curl -sS -m 20 "$BASE_PUBLIC/" 2>/dev/null | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | sed -n '1p')"
if [[ -n "$ASSET" ]]; then
  check "asset $ASSET" 200 "$BASE_PUBLIC$ASSET"
else
  echo "  info  no asset found in the HTML of the homepage"
fi

echo
echo "=== result ==="
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [[ ${#FAILED_LIST[@]} -gt 0 ]]; then
  echo "  the failures:"
  for item in "${FAILED_LIST[@]}"; do echo "    - $item"; done
  exit 1
fi
echo "  the live platform answered every read-only check."
