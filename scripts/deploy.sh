#!/usr/bin/env bash
# The one way to put main in production. Run it on the platform VM, in the production folder:
#
#   cd /opt/blipmade && bash scripts/deploy.sh
#
# The production folder is a clean checkout of main and nobody edits it. This script refuses to run when it is not clean,
# when it is not on main, or when main cannot be fast-forwarded, so nothing that was written by hand can get into production.
# It makes a backup first, builds, applies the migrations that main has, replaces the containers one by one, checks that
# they answer, and says how to go back.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
F="-f compose.yml -f compose.api.yml -f compose.web.yml"

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "REFUSED: the production folder has changes that are not commits:"; git status --short | head; exit 1; }
git fetch -q origin main
git checkout -q main 2>/dev/null || git checkout -q -B main origin/main
git merge --ff-only -q origin/main || { echo "REFUSED: main cannot be fast-forwarded. Production is never merged by hand."; exit 1; }
SHA=$(git rev-parse --short HEAD)
echo "Deploying main $SHA: $(git log -1 --format=%s | cut -c1-80)"

BUSY=$(docker exec blipmade-postgres-1 sh -c 'psql -U $POSTGRES_USER $POSTGRES_DB -tA -c "select count(*) from \"Instance\" where status in ('"'"'PENDING'"'"','"'"'PROVISIONING'"'"')"')
[ "$BUSY" = "0" ] || { echo "REFUSED: $BUSY services are being provisioned. Try again when they are done."; exit 1; }

BACKUP=/var/backups/blipmade/pre-deploy-$SHA-$(date +%Y%m%d%H%M).sql.gz
docker exec blipmade-postgres-1 sh -c 'pg_dump -U $POSTGRES_USER $POSTGRES_DB' | gzip > "$BACKUP"
gzip -t "$BACKUP" && echo "Backup: $BACKUP"

for s in api web worker; do docker tag "blipmade-$s:latest" "blipmade-$s:before-$SHA" 2>/dev/null || true; done
docker compose -p blipmade $F build api web worker > /tmp/deploy-build.log 2>&1 || { grep -E "error TS|ERROR" /tmp/deploy-build.log | head; echo "BUILD FAILED, nothing was changed."; exit 1; }
env -u DATABASE_URL bash scripts/apply-migrations.sh | tail -2

docker compose -p blipmade $F up -d --no-deps api web
for _ in $(seq 1 40); do
  a=$(docker inspect -f '{{.State.Health.Status}}' blipmade-api-1); w=$(docker inspect -f '{{.State.Health.Status}}' blipmade-web-1)
  [ "$a" = healthy ] && [ "$w" = healthy ] && break; sleep 3
done
[ "$a" = healthy ] && [ "$w" = healthy ] || { echo "NOT HEALTHY (api=$a web=$w). Go back: see the end of this file."; exit 1; }
docker compose -p blipmade $F up -d --no-deps worker

echo "--- smoke"
for p in /api/health / /apps /docs /app; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://blipmade.com$p"; done
echo "Deployed $SHA."
echo "To go back: for s in api web worker; do docker tag blipmade-\$s:before-$SHA blipmade-\$s:latest; done; docker compose -p blipmade $F up -d --no-deps api web worker"
