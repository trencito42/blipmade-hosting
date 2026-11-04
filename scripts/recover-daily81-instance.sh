#!/usr/bin/env bash
# Repairs Smart Deploy linkage for instance cmw1bjrpw000tns01od7zntpw and re-queues import apply.
set -euo pipefail
INSTANCE_ID=cmw1bjrpw000tns01od7zntpw
IMPORT_ID=cmw1bgmja0001ns014z7nw0s5
BUILD='npm install && npx prisma generate && npm run build'
START='next start -p $SERVER_PORT -H 0.0.0.0'

cd "$(dirname "$0")/.."
docker compose exec -T postgres psql -U blipmade -d blipmade <<SQL
UPDATE "OrderItem" oi
SET config = jsonb_set(oi.config, '{importSourceId}', '"${IMPORT_ID}"', true)
FROM "Instance" i
WHERE i."orderItemId" = oi.id AND i.id = '${INSTANCE_ID}';

UPDATE "ImportSource"
SET "instanceId" = '${INSTANCE_ID}',
    phase = 'pending',
    "appliedAt" = NULL,
    "deployId" = NULL,
    "lastError" = NULL,
    "confirmedServices" = ARRAY['attached_mysql']::text[],
    "buildCommand" = '${BUILD}',
    "startCommand" = '${START}'
WHERE id = '${IMPORT_ID}';

UPDATE "GitDeploy"
SET "buildCommand" = '${BUILD}',
    "startCommand" = '${START}'
WHERE "instanceId" = '${INSTANCE_ID}';

UPDATE "Instance"
SET "applicationReadyAt" = NULL,
    "applicationError" = 'Smart Deploy recovery queued.'
WHERE id = '${INSTANCE_ID}';
SQL

docker compose exec -T api node --import tsx/esm <<'NODE'
import { prisma } from './src/db.js';
import { recoverStoredImports } from './src/services/import-apply.js';
const n = await recoverStoredImports();
console.info('recoverStoredImports:', n);
await prisma.$disconnect();
NODE

echo "Recovery SQL applied. Watch worker logs and instance deploy events."
