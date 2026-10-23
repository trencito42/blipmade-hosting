#!/bin/bash
# Verifies the interface of the platform in a real browser.
#
# It runs three passes:
#   1. the checks of the fixed behaviour (one focus indicator, the autofill of
#      the browser, the password button, the order of the keyboard, the links
#      and the deploy buttons),
#   2. the responsive pass over every route at 320, 375, 390, 768, 1024 and
#      1440 px,
#   3. the screenshots of the before and after state.
#
# The login endpoint allows ten attempts every fifteen minutes for an address,
# so the passes share as few sessions as possible: the responsive pass signs in
# once and resizes the window.
#
# Environment:
#   BM_BASE             the platform (default http://10.77.0.13:3000)
#   BM_EMAIL            the customer account
#   BM_PASSWORD         its password
#   BM_ADMIN_EMAIL      the staff account
#   BM_ADMIN_PASSWORD   its password
#   SHOT_DIR            where the screenshots and the report are written
set -euo pipefail

BASE="${BM_BASE:-http://10.77.0.13:3000}"
SHOT_DIR="${SHOT_DIR:-/opt/blipmade/screenshots/after}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

: "${BM_EMAIL:?the customer account is needed}"
: "${BM_PASSWORD:?the password of the customer account is needed}"
: "${BM_ADMIN_EMAIL:?the staff account is needed}"
: "${BM_ADMIN_PASSWORD:?the password of the staff account is needed}"

mkdir -p "$SHOT_DIR"

echo "== 1. the fixed behaviour =="
BM_BASE="$BASE" BM_EMAIL="$BM_EMAIL" BM_PASSWORD="$BM_PASSWORD" \
  xvfb-run -a node "$ROOT/scripts/ops/browser-checks.mjs" || true

echo
echo "== 2. the responsive pass =="
SHOT_DIR="$SHOT_DIR" BM_BASE="$BASE" BM_EMAIL="$BM_EMAIL" BM_PASSWORD="$BM_PASSWORD" \
  xvfb-run -a node "$ROOT/scripts/ops/browser-responsive.mjs" || true

echo
echo "== 3. the screenshots =="
SHOT_DIR="$SHOT_DIR" BM_BASE="$BASE" \
  BM_EMAIL="$BM_EMAIL" BM_PASSWORD="$BM_PASSWORD" \
  BM_ADMIN_EMAIL="$BM_ADMIN_EMAIL" BM_ADMIN_PASSWORD="$BM_ADMIN_PASSWORD" \
  xvfb-run -a node "$ROOT/scripts/ops/browser-screenshots.mjs" || true

echo
echo "done -> $SHOT_DIR"
