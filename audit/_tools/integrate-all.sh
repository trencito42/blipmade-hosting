#!/usr/bin/env bash
# Integreaza toate cele trei loturi de performanta in ramura de reparare, pe VM.
#
#   bash integrate-all.sh
#
# Fiecare lot este fuzionat in trei cai: baza workerului este baza comuna, ramura
# de pe VM este "al nostru", rezultatul workerului este "al lor". Fisierele pe care
# fazele 14-16 le-au atins sunt singurele care pot da conflict, si conflictul
# se rezolva manual, nu automat.
#
# Ramura nu se modifica pe disc pana la o revizie umana a conflictelor.
set -euo pipefail

KEY=/root/.ssh/blipmade_vm103
VM=debian@10.77.0.13
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== integrarea loturilor de performanta ==="
for which in web api data; do
  echo
  echo "--- lotul $which ---"
  bash "$TOOLS/integrate-worker.sh" "$which" --apply
done

echo
echo "=== starea arborelui de pe VM ==="
ssh -i "$KEY" "$VM" 'cd /opt/blipmade && git status --short && echo "--- conflictele ---" && (cat /tmp/merge-*.conflicts 2>/dev/null || echo "(niciun)")'
