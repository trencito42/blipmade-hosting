#!/usr/bin/env bash
# Runs the browser tests of the site.
#
# The site is built first, because the tests walk the built site: the server of
# the platform serves the files of the build and forwards `/api` to the API, so
# the tests see the same pages a visitor sees and the same prices the API
# charges.
#
# The browser of Playwright is installed once:
#   npx playwright install chromium
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

# The address of the API. The server of the site forwards `/api` to it.
export E2E_API_URL="${E2E_API_URL:-http://127.0.0.1:3100}"
# The port the site is served on while the tests run.
export E2E_PORT="${E2E_PORT:-30001}"

echo "==> Building the site"
npm run build

echo "==> Running the browser tests"
npx playwright test "$@"
