#!/usr/bin/env bash
# Ruleaza pe VM: fuzioneaza in trei cai lotul unui worker peste ramura curenta.
#
#   merge-worker.sh web|api|data <directorul cu base/ si theirs/>
#
# Intrare:  <stage>/base/<cale>   = versiunea din baza workerului (baza comuna)
#           <stage>/theirs/<cale> = rezultatul workerului
# Curent:   fisierul din arborele de lucru (ramura de reparare, fazele 14-16)
set -euo pipefail

WHICH="${1:?web|api|data}"
STAGE="${2:?directorul cu base/ si theirs/}"
REPO="${REPO:-/opt/blipmade}"

cd "$REPO"

ADDED=0; MERGED=0; CLEAN=0; CONFLICT=0
: > /tmp/merge-$WHICH.conflicts

LIST="$STAGE/all.txt"
[ -f "$LIST" ] || LIST="$STAGE.all"
[ -f "$LIST" ] || { echo "nu gasesc lista de fisiere ($LIST)"; exit 3; }

while read -r f; do
  [ -n "$f" ] || continue

  if [ ! -e "$f" ] && [ ! -e "$STAGE/base/$f" ]; then
    # fisier nou: vine direct
    mkdir -p "$(dirname "$f")"
    cp -r "$STAGE/theirs/$f" "$f"
    ADDED=$((ADDED + 1))
    continue
  fi

  if [ -e "$STAGE/base/$f" ] && [ -e "$f" ]; then
    # daca "al nostru" e deja exact "al lor", nu e nimic de făcut
    if cmp -s "$f" "$STAGE/theirs/$f"; then
      CLEAN=$((CLEAN + 1))
      continue
    fi
    # daca baza comuna e identica cu "al nostru", fisierul a fost doar atins de
    # worker: se ia versiunea lui
    if cmp -s "$STAGE/base/$f" "$f"; then
      cp -r "$STAGE/theirs/$f" "$f"
      MERGED=$((MERGED + 1))
      continue
    fi
    # altfel: fuziune in trei cai, baza comuna fiind versiunea din baza workerului
    if git merge-file -p --diff3 --marker-size=7 "$f" "$STAGE/base/$f" "$STAGE/theirs/$f" > "/tmp/merge-$WHICH.out" 2>/dev/null; then
      cp /tmp/merge-$WHICH.out "$f"
      CLEAN=$((CLEAN + 1))
    else
      cp /tmp/merge-$WHICH.out "$f"
      echo "$f" >> /tmp/merge-$WHICH.conflicts
      CONFLICT=$((CONFLICT + 1))
      echo "  CONFLICT: $f"
    fi
    continue
  fi

  # fisier sters de worker
  if [ ! -e "$f" ] && [ -e "$STAGE/base/$f" ]; then
    echo "  STERGERE (worker): $f"
    rm -f "$f"
  fi
done < "$LIST"

echo
echo "worker $WHICH: $ADDED noi, $MERGED inlocuite, $CLEAN fara conflict, $CONFLICT cu conflict"
if [ "$CONFLICT" -gt 0 ]; then
  echo "fisierele cu conflict sunt in /tmp/merge-$WHICH.conflicts si au marcatori <<<<<<< in arbore"
  exit 2
fi
