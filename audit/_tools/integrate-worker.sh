#!/usr/bin/env bash
# Integrează lotul unui worker de performanță în ramura de reparare.
#
#   ./integrate-worker.sh web|api|data [--apply]
#
# De ce fuziune în trei căi, și nu cherry-pick: worktree-ul workerului trăiește
# pe mașina locală și are o istorie proprie (import comprimat al ramurii), fără
# strămoși comuni cu repo-ul de pe VM. În plus baza workerului e anterioară
# fazelor 14–16, deci `git apply` ar da conflicte la fiecare fișier atins de
# acele faze. `git merge-file` ia baza explicită: baza workerului = baza comună,
# ramura de pe VM = "al nostru", rezultatul workerului = "al lor".
#
# Sursa este ramura `perf/<lot>` a workerului, nu HEAD: un worker poate termina
# cu HEAD desprins pe baza, iar atunci diferența față de bază ar fi goală.
#
# Fără --apply doar raportează ce a atins workerul (nu scrie nimic pe VM).
set -euo pipefail

WHICH="${1:?web|api|data}"
APPLY="${2:-}"

WT="/home/debian/wt-$WHICH"
BR="perf/$WHICH"
STAGE="/tmp/int-$WHICH"
SSH=(ssh -i /root/.ssh/blipmade_vm103 -o StrictHostKeyChecking=no debian@10.77.0.13)
SCP=(scp -i /root/.ssh/blipmade_vm103 -o StrictHostKeyChecking=no)
REMOTE_REPO="/opt/blipmade"

[ -d "$WT" ] || { echo "nu exista $WT"; exit 1; }

cd "$WT"
BASE="$(git rev-list --max-parents=0 "$BR")"

# 1. Daca workerul a terminat cu HEAD desprins pe baza, ramura lui e sursa.
HEAD_REF="$(git rev-parse --abbrev-ref HEAD)"
if [ "$HEAD_REF" != "$BR" ]; then
  if [ -n "$(git status --porcelain | grep -v '^?? ' || true)" ]; then
    echo "REFUZ: ramura $WHICH are modificari necomise si HEAD e desprins ($HEAD_REF)." >&2
    echo "       Asteapta workerul sa-si termine lucrarea." >&2
    exit 10
  fi
  git checkout "$BR" >/dev/null 2>&1
  echo "   (HEAD era desprins pe $HEAD_REF; am trecut pe $BR)"
fi

# 2. Ce a schimbat workerul: comis + necomis.
EXCLUDE_RE='^(dist/|dist-measure/|node_modules/|\.env|.*\.log$|api/dbg.*\.mjs$|api/zz-diag\.test\.ts$|api/probe-page\.ts$|.*-probe\.cjs$|.*-measure\.cjs$)'

{
  git diff --name-only "$BASE" "$BR"
  git diff --name-only "$BR"
  git status --porcelain | awk '$1 == "??" {print $2}'
} | grep -Ev "$EXCLUDE_RE" | sort -u > "$STAGE.all"

rm -rf "$STAGE"
mkdir -p "$STAGE/base" "$STAGE/theirs"

while read -r f; do
  [ -n "$f" ] || continue
  mkdir -p "$STAGE/base/$(dirname "$f")" "$STAGE/theirs/$(dirname "$f")"
  git show "$BASE:$f" > "$STAGE/base/$f" 2>/dev/null || rm -f "$STAGE/base/$f"
  # "al lor" = starea de acum a arborelui workerului (comis + necomis)
  if [ -e "$f" ]; then
    cp -r "$f" "$STAGE/theirs/$f"
  else
    rm -f "$STAGE/theirs/$f"
  fi
done < "$STAGE.all"

cp "$STAGE.all" "$STAGE/all.txt"

echo "worker $WHICH (ramura $BR @ $(git rev-parse --short "$BR")): $(wc -l < "$STAGE.all") fișiere"

# 3. Transport pe VM.
if [ "$APPLY" = "--apply" ]; then
  tar -czf /tmp/int-$WHICH.tar.gz -C "$STAGE" base theirs all.txt
  "${SCP[@]}" -q /tmp/int-$WHICH.tar.gz debian@10.77.0.13:/tmp/int-$WHICH.tar.gz
  "${SSH[@]}" "rm -rf /tmp/int-$WHICH && mkdir -p /tmp/int-$WHICH && tar -xzf /tmp/int-$WHICH.tar.gz -C /tmp/int-$WHICH"
  "${SSH[@]}" "cd $REMOTE_REPO && bash /opt/blipmade/audit/_tools/merge-worker.sh $WHICH /tmp/int-$WHICH" < /dev/null
else
  echo "previzualizare: fișierele atinse de workerul $WHICH"
  sed 's/^/  /' "$STAGE.all"
fi
