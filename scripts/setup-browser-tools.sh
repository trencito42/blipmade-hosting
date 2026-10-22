#!/usr/bin/env bash
# Installs the browser tooling the verification scripts use.
#
# The scripts under scripts/ drive a real Chromium so the panel and the
# responsive screenshots behave like a person using them. The packages live in
# tools/browser and are not part of the application build.
#
# Usage: scripts/setup-browser-tools.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v chromium >/dev/null 2>&1; then
  echo "==> Installing Chromium and Xvfb"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    chromium xvfb xauth
fi

mkdir -p tools/browser
cd tools/browser
[[ -f package.json ]] || npm init -y >/dev/null
npm install --no-audit --no-fund playwright-core ws >/dev/null

echo "==> Browser tooling ready in $ROOT/tools/browser"
chromium --version
