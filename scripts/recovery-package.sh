#!/usr/bin/env bash
# Builds the encrypted recovery package of the platform.
#
# The package holds everything that is needed to put the platform back on a
# new machine: the environment of the platform, the credentials of the
# database, the key of the age that decrypts the off-site copies, the key of
# the off-site copy itself and the code of the backup and of the restore.
#
# The package is encrypted for a key that the operator holds and the server
# does not. That is the whole point of the exercise: a package that the server
# can open by itself is not a recovery copy, it is a copy.
#
# Two rules are enforced by the script itself:
#
#   1. the recipient must be given on the command line, and it must not be
#      the public key of the identity that is on this machine: a package
#      encrypted for that key could be opened here, without the operator;
#   2. nothing is printed. The script says what it put in the package and
#      nothing else, so a log of the run cannot become a leak.
#
# Usage:
#   scripts/recovery-package.sh --recipient age1... [--label NAME] [--output DIR]
#
# The package is written for the operator to take with SFTP. The receipt of
# the copy says what is inside and how to check it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="recovery"
OUTPUT=""
RECIPIENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --recipient) RECIPIENT="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$RECIPIENT" ]]; then
  echo "The recipient of the package is missing. Give the public key of the operator with --recipient age1..." >&2
  exit 2
fi

if ! [[ "$RECIPIENT" =~ ^age1[0-9a-z]{20,}$ ]]; then
  echo "The recipient does not look like a public key of age." >&2
  exit 2
fi

if ! command -v age >/dev/null 2>&1; then
  echo "age is not installed on this machine. Install it before building the package." >&2
  exit 1
fi

OUTPUT="${OUTPUT:-$HOME/recovery}"
mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d /tmp/blipmade-recovery.XXXXXX)"
chmod 700 "$WORK"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# --- the rule that makes the package a recovery copy ------------------------
#
# The identity that is on this machine decrypts the off-site copies. If the
# package were encrypted for that same key, the package could be opened here,
# without the operator, and it would be no better than a copy on the disk.
OWN_PUBLIC=""
for candidate in "$HOME"/.blipmade-backup.age "$HOME"/.config/age/keys.txt; do
  [[ -r "$candidate" ]] || continue
  derived="$(age-keygen -y "$candidate" 2>/dev/null || true)"
  [[ -n "$derived" ]] && OWN_PUBLIC="$derived" && break
done
if [[ -n "$OWN_PUBLIC" && "$OWN_PUBLIC" == "$RECIPIENT" ]]; then
  echo "The recipient is the key of this machine. The package would be decryptable here without the operator." >&2
  exit 2
fi

# --- the inventory ----------------------------------------------------------
mkdir -p "$WORK/package/env" "$WORK/package/keys" "$WORK/package/app"

copy() {
  local source="$1" target="$2"
  [[ -r "$source" ]] || return 0
  cp -p "$source" "$WORK/package/$target"
  chmod 600 "$WORK/package/$target" 2>/dev/null || true
}

# The environment of the platform: the secret of the session, the keys of
# Stripe, the keys of the panel and of the mail system, the token of Caddy,
# the addresses of the database and of the off-site copy.
for file in .env .env.db-admin .env.test .env.example; do
  copy "$ROOT/$file" "env/$file"
done

# The identity that decrypts the off-site copies, and the key that writes
# them. Without the first the operator cannot open the copies; without the
# second the operator cannot make a new one.
copy "$HOME/.blipmade-backup.age" "keys/blipmade-backup.age"
copy "$HOME/.ssh/blipmade_offsite" "keys/blipmade_offsite"
copy "$HOME/.ssh/blipmade_offsite.pub" "keys/blipmade_offsite.pub"
copy "$HOME/.ssh/github_deploy" "keys/github_deploy"
copy "$HOME/.ssh/github_deploy.pub" "keys/github_deploy.pub"
copy "$HOME/.ssh/config" "keys/ssh-config"
copy "$HOME/.ssh/known_hosts" "keys/known_hosts"

# The code that describes the platform and the tools of the recovery.
cp -r "$ROOT/api/prisma/schema.prisma" "$WORK/package/app/" 2>/dev/null || true
cp -r "$ROOT/api/prisma/migrations" "$WORK/package/app/migrations" 2>/dev/null || true
cp -r "$ROOT/scripts" "$WORK/package/app/scripts" 2>/dev/null || true
cp -r "$ROOT/.github/workflows" "$WORK/package/app/workflows" 2>/dev/null || true
for file in compose.yml compose.api.yml compose.web.yml; do
  cp "$ROOT/$file" "$WORK/package/app/" 2>/dev/null || true
done
chmod -R go-rwx "$WORK/package"

# --- the receipt ------------------------------------------------------------
#
# The receipt is written in the clear: it says what is in the package and how
# to check it, and it holds no secret at all.
MANIFEST="$WORK/package/MANIFEST.txt"
{
  echo "Blipmade — the recovery package of the platform"
  echo "Built: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Host: $(hostname)"
  echo "Encryption: age, with the public key of the operator"
  echo "The private key of this package is NOT on this machine."
  echo
  echo "What is inside:"
  ( cd "$WORK/package" && find . -type f | sed 's|^\./|  |' | sort )
} > "$MANIFEST"

# The receipt that is left next to the package, so the operator can read it
# before he takes the package.
cp "$MANIFEST" "$OUTPUT/MANIFEST-$STAMP.txt"
chmod 600 "$OUTPUT/MANIFEST-$STAMP.txt"

# --- the package ------------------------------------------------------------
TARBALL="$WORK/blipmade-recovery-$STAMP.tar.gz"
tar -czf "$TARBALL" -C "$WORK/package" .
PACKAGE="$OUTPUT/blipmade-recovery-$STAMP.tar.gz.age"
age --encrypt --recipient "$RECIPIENT" --output "$PACKAGE" "$TARBALL"
chmod 600 "$PACKAGE"

# The checksum of the encrypted package: the operator checks it after the
# transfer, and a copy that was damaged on the way is caught before it is
# opened.
( cd "$OUTPUT" && sha256sum "blipmade-recovery-$STAMP.tar.gz.age" > "blipmade-recovery-$STAMP.tar.gz.age.sha256" )
chmod 600 "$OUTPUT/blipmade-recovery-$STAMP.tar.gz.age.sha256"

# The size and the checksum are the only things the run says. No secret is
# printed, and the key of the operator is not written anywhere on the host.
echo "The recovery package is written."
echo "  package : $PACKAGE"
echo "  receipt : $OUTPUT/MANIFEST-$STAMP.txt"
echo "  checksum: $OUTPUT/blipmade-recovery-$STAMP.tar.gz.age.sha256"
echo "  size    : $(stat -c %s "$PACKAGE") bytes"
echo
echo "Take it with SFTP, check the checksum, and open it with the private key of the operator."
echo "Nothing was deleted and nothing was rotated."
