#!/usr/bin/env bash
# Copiază dovezile măsurătorilor în arbore, ca raportul să aibă lângă el
# cifrele pe care se bazează.
#
#   bash collect-perf-evidence.sh
#
# Surse: /home/debian/perf-out/{before,after} pe VM.
# Destinație: audit/post-remediation/_raw/perf-{before,after}/ în repo.
set -euo pipefail

KEY=/root/.ssh/blipmade_vm103
VM=debian@10.77.0.13
REPO=/opt/blipmade
DEST="$REPO/audit/post-remediation/_raw"

ssh -i "$KEY" "$VM" "bash -s -- '$REPO' '$DEST'" <<'SH'
set -euo pipefail
REPO="$1"; DEST="$2"

for side in before after; do
  SRC="/home/debian/perf-out/$side"
  [ -d "$SRC" ] || { echo "  lipseste $SRC"; continue; }
  mkdir -p "$DEST/perf-$side"
  # rapoartele Lighthouse sunt mari; se pastreaza toate, ca fiecare runda sa
  # poata fi verificata. Se iau doar rapoartele cu numar de runda
  # (lh-<ruta>-<n>.json); cele fara numar sunt masuratori mai vechi, cu o
  # singura rulare, pastrate doar in dosarul original.
  cp -f "$SRC"/lh-*[0-9].json "$DEST/perf-$side/" 2>/dev/null || true
  cp -f "$SRC"/ac-*[0-9].json "$DEST/perf-$side/" 2>/dev/null || true
  [ -f "$SRC/headers.txt" ] && cp -f "$SRC/headers.txt" "$DEST/perf-$side/" || true
  # rezumatul lizibil al fiecarui raport
  python3 /tmp/lh-summary.py "$DEST/perf-$side"/lh-*.json > "$DEST/perf-$side/lighthouse-summary.txt" 2>/dev/null || true
  python3 /tmp/ac-summary.py "$DEST/perf-$side"/ac-*.json > "$DEST/perf-$side/load-summary.txt" 2>/dev/null || true
  echo "  perf-$side: $(ls "$DEST/perf-$side" | wc -l) fisiere"
done

cd "$REPO"
git status --short audit/post-remediation/_raw | head -5
SH
