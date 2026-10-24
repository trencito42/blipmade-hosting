#!/usr/bin/env bash
# Rebuilds the shared review stack on the VM FROM THE BRANCH and restarts it.
#
# Why this script exists: the retest of the repairs found that the review
# stack was running code started at 00:28 while the repairs of the branch
# landed at 01:18-01:42, so every verdict given on that stack was a verdict
# about old code. The stack used to be built from the mirror, which is a copy
# without git and drifts behind the branch.
#
# The stack is built from the branch in the repository on the VM, and the
# script prints the commit it built and checks that the built artefacts
# really carry the symbols of that commit, so a reviewer can never be fooled
# again.
#
# The production containers are never touched. The stack lives in /tmp and
# runs against the test database.
#
#   ./rebuild-review-stack.sh [branch]
set -euo pipefail

VM=debian@10.77.0.13
KEY=/root/.ssh/blipmade_vm103
BRANCH="${1:-remediation/phase-2-critical-fixes}"

ssh -i "$KEY" "$VM" "bash -s -- '$BRANCH'" <<'SH'
set -euo pipefail
BRANCH="$1"
REPO=/opt/blipmade
WORK=/tmp/check

cd "$REPO"
git fetch --all --quiet || true
git checkout "$BRANCH" >/dev/null
COMMIT="$(git rev-parse --short HEAD)"
echo "== ramura: $BRANCH @ $COMMIT"

rm -rf "$WORK" /tmp/api-check /tmp/web-check
mkdir -p "$WORK"
git archive "$BRANCH" api web scripts | tar -xf - -C "$WORK"

cat > /tmp/check/env.sh <<'ENV'
# Mediul stivei de revizie: baza de test si configuratia de test.
# Baza de productie nu este folosita niciodata aici.
set -a
. /opt/blipmade/.env
set +a
DATABASE_URL="${DATABASE_URL/@postgres:/@localhost:}"
DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#/[^/?]+$#/blipmade_test#')"
export DATABASE_URL
export TEST_DATABASE_URL="$DATABASE_URL"
export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis:\/\/localhost:}"
# Stiva de revizie e folosita de mai multi auditori in acelasi timp si toti
# se autentifica de la aceeasi adresa, deci limita de incercari de autentificare
# e ridicata aici. Nu atinge mediul de productie.
export LOGIN_RATE_LIMIT_MAX=500
export NODE_ENV=test
export LOG_LEVEL=silent
export PORT=3101
export HOST=127.0.0.1
export STRIPE_TEST_MODE=true
export STRIPE_SECRET_KEY=""
export STRIPE_WEBHOOK_SECRET=""
export STRIPE_PUBLISHABLE_KEY=""
export SMTP_URL=""
export COOKIE_SECURE=false
ENV

cd "$WORK"
ln -sfn /opt/blipmade/api/node_modules api/node_modules
ln -sfn /opt/blipmade/web/node_modules web/node_modules
mv api /tmp/api-check
mv web /tmp/web-check
cp /tmp/check/env.sh /tmp/api-check/env.sh

echo "== construirea api-ului"
cd /tmp/api-check
npx tsc -p tsconfig.json

echo "== construirea web-ului"
cd /tmp/web-check
npx tsc --noEmit
npx vite build > /tmp/web-build.log 2>&1
tail -3 /tmp/web-build.log

echo "== provenienta codului construit"
# Simbolurile care arata ce ramura ruleaza. Daca unul lipseste, stiva nu este
# cea a ramurii si nu trebuie folosita pentru un verdict.
MISSING=0
for symbol in addressRateLimitKey loginGuardForAttempts failedAttempts assertMayActOnAccount; do
  if grep -rq "$symbol" /tmp/api-check/dist 2>/dev/null; then
    echo "   $symbol: prezent"
  else
    echo "   $symbol: LIPSA"
    MISSING=1
  fi
done
if grep -rq "cannot be paid: its status is" /tmp/api-check/dist 2>/dev/null; then
  echo "   \"cannot be paid: its status is\": prezent"
else
  echo "   \"cannot be paid: its status is\": LIPSA"
  MISSING=1
fi
# Serverul web ruleaza din sursa (nu din bundle-ul clientului), deci marcarea
# se cauta in fisierul pe care il executa.
if grep -q "chain.length - 1" /tmp/web-check/src/lib/client-address.mjs 2>/dev/null; then
  echo "   adresa clientului citita din dreapta: prezent"
else
  echo "   adresa clientului citita din dreapta: LIPSA"
  MISSING=1
fi
if [ "$MISSING" -ne 0 ]; then
  echo "Stiva construita nu poarta simbolurile ramurii. Nu o folosi pentru un verdict." >&2
  exit 7
fi

echo "== repornirea"

# Stiva de revizie nu trebuie sa ajunga niciodata la API-ul de productie. API-ul
# de productie asculta pe 3100 pe loopback; o instanta de web indreptata spre
# el scrie fiecare autentificare, fiecare bilet si fiecare comanda in baza
# vie. Adresa este scrisa o singura data, aici, iar garda verifica exact acea
# valoare: o gresie de scriere nu poate ajunge la datele vii.
CHECK_API_URL="http://127.0.0.1:3101"

case "$CHECK_API_URL" in
  *":3100"*|*"production"*|*"blipmade.com"*)
    echo "Stiva de revizie ar indica spre API-ul de productie. Refuz sa pornesc." >&2
    exit 1
    ;;
esac

for port in 30003 3101; do
  pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
done
sleep 1
cd /tmp/api-check && . ./env.sh && (setsid node dist/index.js > /tmp/api-new.log 2>&1 < /dev/null &)
cd /tmp/web-check && (SERVER_PORT=30003 API_URL="$CHECK_API_URL" setsid node server.mjs > /tmp/web-live.log 2>&1 < /dev/null &)
sleep 4

echo "== starea stivei"
printf "api  3101 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3101/health
printf "web 30003 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30003/healthz
printf "web -> api -> "; curl -s -o /dev/null -w "%{http_code}\n" "$CHECK_API_URL/health"
echo "== stiva de revizie ruleaza codul $COMMIT ($BRANCH)"
SH
