#!/usr/bin/env bash
# Reconstruction stivei de masuratoare din ramura curenta, apoi pornirea ei.
#
#   bash rebuild-perf-stack.sh [baza_de_test]
#
# Stiva este construita din ramura de reparare, nu din mirror, pentru ca
# masuratorile sa fie despre codul care urmeaza sa fie livrat. Producția nu
# este atinsa: stiva asculta pe 3106 si 30020, pe baza de test, si pe o baza
# Redis proprie (indicele 2), ca joburile ei sa nu ajunga in coada workerului
# de productie.
set -euo pipefail

KEY=/root/.ssh/blipmade_vm103
VM=debian@10.77.0.13
DB="${1:-blipmade_perf_test}"
BRANCH="remediation/phase-2-critical-fixes"
WORK=/home/debian/bm-phase14

ssh -i "$KEY" "$VM" "bash -s -- '$BRANCH' '$DB' '$WORK'" <<'SH'
set -euo pipefail
BRANCH="$1"
DB="$2"
WORK="$3"
REPO=/opt/blipmade

cd "$REPO"
COMMIT="$(git rev-parse --short "$BRANCH")"
echo "== ramura: $BRANCH @ $COMMIT"

# 1. Worktree-ul stivei este adus la commitul ramurii.
git -C "$WORK" checkout --detach "$BRANCH" >/dev/null
echo "   worktree: $(git -C "$WORK" rev-parse --short HEAD)"

# 2. Instrumentele si dependintele trebuie sa fie aceleasi ca in repo.
for d in api web; do
  [ -e "$WORK/$d/node_modules" ] || ln -s "$REPO/$d/node_modules" "$WORK/$d/node_modules"
done

echo "== construirea API-ului"
cd "$WORK/api"
npx tsc -p tsconfig.json

echo "== construirea web-ului"
cd "$WORK/web"
rm -rf dist
npx vite build > /tmp/perf-web-build.log 2>&1 || { tail -20 /tmp/perf-web-build.log; exit 1; }
tail -3 /tmp/perf-web-build.log

echo "== provenienta codului construit"
MISSING=0
for symbol in addressRateLimitKey failedAttempts assertMayActOnAccount; do
  if grep -rq "$symbol" "$WORK/api/dist" 2>/dev/null; then
    echo "   $symbol: prezent"
  else
    echo "   $symbol: LIPSA"
    MISSING=1
  fi
done
for symbol in precompressSite resolveRequestId shutdownGracefully; do
  if grep -rq "$symbol" "$WORK/api/dist" "$WORK/web/src" 2>/dev/null; then
    echo "   $symbol: prezent"
  else
    echo "   $symbol: LIPSA"
    MISSING=1
  fi
done
if [ ! -f "$WORK/web/dist/index.html" ]; then
  echo "   bundle-ul web: LIPSA"
  MISSING=1
else
  echo "   bundle-ul web: prezent"
fi
if [ "$MISSING" -ne 0 ]; then
  echo "Stiva construita nu poarta simbolurile ramurii. Nu o folosi pentru o masuratoare." >&2
  exit 7
fi

echo "== pornirea stivei"
bash /opt/blipmade/audit/_tools/perf-stack.sh "$DB"

sleep 2
echo "== starea stivei"
printf "api  3106 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3106/health
printf "web 30020 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30020/healthz
printf "web -> api -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3106/api/health
printf "catalog -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3106/api/catalog/products
echo "== stiva de masuratoare ruleaza codul $COMMIT"
SH
