#!/usr/bin/env bash
#
# Builds a real instance of a product of the catalog and waits for it.
#
# The test needs a customer, an order that is paid and an instance, because
# the platform refuses to build a service for an order that was not paid. The
# rows are written straight into the database, because the payment of the
# test cannot go through Stripe: the live keys are not on this machine and the
# gateway of the tests is closed on a live site.
#
# The rows carry the mark "verify", so they are found again and can be
# removed. Nothing else is touched.
#
# Usage:
#     scripts/deploy-test-instance.sh <slug of the product> [name of the egg]
#
# The egg may be left out: the product names its own egg.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SLUG="${1:-}"
EGG_NAME="${2:-}"

[ -n "$SLUG" ] || {
  printf 'usage: %s <slug of the product> [name of the egg]\n' "$0" >&2
  exit 1
}

say() { printf '==> %s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"
PSQL=(docker exec -i blipmade-postgres-1 psql -h 127.0.0.1 -U blipmade -d blipmade -At -F ' | ')

# --- 1. the product ------------------------------------------------------------------------

PRODUCT_JSON="$(timeout 60 docker exec blipmade-api-1 node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.product.findUnique({ where: { slug: process.argv[1] } })
    .then((p) => { process.stdout.write(JSON.stringify(p ?? null)); })
    .finally(() => prisma.\$disconnect());
" "$SLUG")"

[ "$PRODUCT_JSON" != "null" ] || fail "the product $SLUG is not in the catalog"

PRODUCT_ID="$(printf '%s' "$PRODUCT_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
PRODUCT_EGG="$(printf '%s' "$PRODUCT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('eggName') or d.get('eggId') or '')")"
say "product $SLUG (id $PRODUCT_ID), egg $PRODUCT_EGG"

if [ -n "$EGG_NAME" ]; then
  say "the product is pointed at the egg $EGG_NAME"
  "${PSQL[@]}" -c "UPDATE \"Product\" SET \"eggName\" = '$EGG_NAME' WHERE id = '$PRODUCT_ID';" >/dev/null
fi

# --- 2. the customer, the order and the instance -------------------------------------------

STAMP="$(date -u +%Y%m%d%H%M%S)"
EMAIL="verify-${STAMP}@blipmade.test"
PASSWORD="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"

say "writing the customer, the order and the instance of the test"
INSTANCE_ID="$(cat <<SQL | "${PSQL[@]}" -f -
WITH customer AS (
  INSERT INTO "User" ("id", "email", "passwordHash", "role", "firstName", "lastName", "emailVerifiedAt", "createdAt", "updatedAt")
  VALUES ('verify-${STAMP}', '${EMAIL}', 'not-a-real-hash', 'CUSTOMER', 'Verify', 'Instance', NOW(), NOW(), NOW())
  RETURNING id
), product AS (
  SELECT id, "minRam", "minCpu", "minDisk", "defaultRam", "defaultCpu", "defaultDisk" FROM "Product" WHERE id = '${PRODUCT_ID}'
), created_order AS (
  INSERT INTO "Order" ("id", "number", "userId", "status", "total", "currency", "paidAt", "createdAt", "updatedAt")
  VALUES ('verify-order-${STAMP}', 'BM-VERIFY-${STAMP}', (SELECT id FROM customer), 'PAID', 149, 'EUR', NOW(), NOW(), NOW())
  RETURNING id
), item AS (
  INSERT INTO "OrderItem" ("id", "orderId", "productId", "name", "quantity", "unitAmount", "total", "currency", "createdAt", "updatedAt")
  VALUES ('verify-item-${STAMP}', (SELECT id FROM created_order), '${PRODUCT_ID}', '${SLUG}', 1, 149, 149, 'EUR', NOW(), NOW())
  RETURNING id
), instance AS (
  INSERT INTO "Instance" ("id", "userId", "productId", "orderId", "orderItemId", "name", "status", "ram", "cpu", "disk", "price", "currency", "createdAt", "updatedAt")
  VALUES ('verify-inst-${STAMP}', (SELECT id FROM customer), '${PRODUCT_ID}', (SELECT id FROM created_order), (SELECT id FROM item), 'Verify ${SLUG}', 'PENDING',
          (SELECT "minRam" FROM product), (SELECT "minCpu" FROM product), (SELECT "minDisk" FROM product), 149, 'EUR', NOW(), NOW())
  RETURNING id
)
SELECT id FROM instance;
SQL
)"

[ -n "$INSTANCE_ID" ] || fail "the instance of the test could not be written"
say "instance $INSTANCE_ID"

# --- 3. the build ---------------------------------------------------------------------------

say "the platform builds the instance"
# The modules of the platform open connections of their own, so the process
# would stay alive after the work is done. The program ends itself, and the
# call is capped in time, so a provisioning that hangs is reported instead of
# holding the operator in front of a command that never returns.
timeout 900 docker exec blipmade-api-1 node -e "
  import('/app/dist/services/provisioning.js')
    .then((m) => m.provisionInstance(process.argv[1]))
    .then(() => { process.stdout.write('the provisioning run finished\n', () => process.exit(0)); })
    .catch((error) => { process.stderr.write(String(error?.message ?? error) + '\n', () => process.exit(1)); });
" "$INSTANCE_ID" || fail "the provisioning of the instance failed"

# --- 4. what the panel holds -----------------------------------------------------------------

say "the state of the instance"
"${PSQL[@]}" -c "
  SELECT i.id, i.status, i.\"pterodactylServerId\", i.\"pterodactylAllocation\",
         (SELECT count(*) FROM \"InstanceEvent\" e WHERE e.\"instanceId\" = i.id) AS events
  FROM \"Instance\" i WHERE i.id = '${INSTANCE_ID}';
"

say "the last events of the instance"
"${PSQL[@]}" -c "
  SELECT type, message FROM \"InstanceEvent\"
  WHERE \"instanceId\" = '${INSTANCE_ID}' ORDER BY \"createdAt\" DESC LIMIT 12;
"

say "the variables the platform made for the instance"
"${PSQL[@]}" -c "
  SELECT CASE WHEN \"generatedVariables\" IS NULL THEN 'none' ELSE 'made' END
  FROM \"Instance\" WHERE id = '${INSTANCE_ID}';
"

say "done. The instance is ${INSTANCE_ID}; the rows of the test carry the mark 'verify'."
