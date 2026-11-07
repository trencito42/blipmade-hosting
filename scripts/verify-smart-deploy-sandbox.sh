#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
runner="$repo_root/scripts/smart-deploy-sandbox-runner.sh"
proof_root=$(mktemp -d /tmp/blipmade-sandbox-proof.XXXXXX)
case "$proof_root" in /tmp/blipmade-sandbox-proof.*) ;; *) exit 70 ;; esac

cleanup() {
  case "$proof_root" in
    /tmp/blipmade-sandbox-proof.*) rm -rf -- "$proof_root" ;;
  esac
}
trap cleanup EXIT INT TERM

mkdir -p "$proof_root/source" "$proof_root/success" "$proof_root/timeout"
printf 'original\n' > "$proof_root/source/input.txt"

"$runner" \
  --source "$proof_root/source" \
  --output "$proof_root/success" \
  --runtime node \
  --build 'test ! -e /root; ! sh -c "printf hacked > /source/input.txt"; ! wget -q -T 2 -O /dev/null https://example.com; test ! -e /output/build-owned; mkdir -p dist; printf isolated > dist/result.txt' \
  --timeout 30 \
  --memory-mb 256 \
  --disk-mb 128

test "$(cat "$proof_root/source/input.txt")" = original
test "$(tar -xOf "$proof_root/success/artifact.tar.gz" ./dist/result.txt)" = isolated
sha256sum --check "$proof_root/success/artifact.sha256"

set +e
"$runner" \
  --source "$proof_root/source" \
  --output "$proof_root/timeout" \
  --runtime node \
  --build 'sleep 10' \
  --timeout 1 \
  --memory-mb 256 \
  --disk-mb 128
timeout_status=$?
set -e

test "$timeout_status" -eq 124
test ! -e "$proof_root/timeout/artifact.tar.gz"
printf 'sandbox proof passed: source read-only, host hidden, network absent, artifact hashed, timeout enforced\n'
