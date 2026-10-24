#!/usr/bin/env bash
# Pregătește pachetul de integrare al unui worker: fișierele pe care le-a
# schimbat, atât cele comise, cât și cele încă necomise.
#
#   ./pack-worker.sh web|api|data <cale_de_ieșire.tar.gz>
#
# Worktree-ul workerului trăiește pe mașina locală, iar ramura de reparare
# trăiește pe VM. Pachetul duce doar fișierele schimbate, nu arborele întreg.
set -euo pipefail

WHICH="${1:?web|api|data}"
OUT="${2:?calea de ieșire}"
WT="/home/debian/wt-$WHICH"

cd "$WT"
BASE="$(git rev-list --max-parents=0 HEAD)"

rm -f "/tmp/pack-$WHICH"*
mkdir -p "/tmp/pack-$WHICH"

# 1. Diferența dintre baza importului și starea de acum (inclusiv ce nu e comis).
git diff "$BASE" > "/tmp/pack-$WHICH/changes.patch"

# 2. Fișierele noi, care nu apar în diff.
git status --porcelain | awk '$1 == "??" {print $2}' | while read -r f; do
  mkdir -p "/tmp/pack-$WHICH/files/$(dirname "$f")"
  cp -r "$f" "/tmp/pack-$WHICH/files/$f" 2>/dev/null || cp -r "$f" "/tmp/pack-$WHICH/files/$f"
done

# 3. Lista fișierelor atinse.
{
  echo "# fișierele atinse de workerul $WHICH"
  git diff --name-only "$BASE"
  git status --porcelain | awk '$1 == "??" {print $2}'
} | sort -u > "/tmp/pack-$WHICH/files.txt"

tar -czf "$OUT" -C /tmp/pack-$WHICH .
echo "pachet: $OUT ($(wc -l < "/tmp/pack-$WHICH/files.txt") fișiere)"
