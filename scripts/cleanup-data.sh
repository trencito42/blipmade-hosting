#!/usr/bin/env bash
# Removes the rows that were created by the provisioning verification runs.
#
# The administrator account and the five demo catalog products are kept, so the
# customer and admin interfaces still show a realistic environment. The audit
# log is append-only and is therefore not touched.
set -euo pipefail
cd /opt/blipmade

psql_exec() {
  docker compose -f compose.yml exec -T postgres psql -U blipmade -d blipmade -v ON_ERROR_STOP=1 -c "$1"
}

echo "=== before ==="
psql_exec 'SELECT
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Instance") AS instances,
  (SELECT count(*) FROM "Subscription") AS subscriptions,
  (SELECT count(*) FROM "Product") AS products,
  (SELECT count(*) FROM "User") AS users;'

psql_exec 'BEGIN;
  DELETE FROM "Order" WHERE number LIKE '"'"'BM-%'"'"';
  DELETE FROM "Instance" WHERE name = '"'"'Nginx verification'"'"';
  DELETE FROM "Subscription" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '"'"'verify-%@blipmade.test'"'"');
  DELETE FROM "Product" WHERE slug LIKE '"'"'nginx-verify-%'"'"';
  DELETE FROM "User" WHERE email LIKE '"'"'verify-%@blipmade.test'"'"';
COMMIT;'

echo "=== after ==="
psql_exec 'SELECT
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Instance") AS instances,
  (SELECT count(*) FROM "Subscription") AS subscriptions,
  (SELECT count(*) FROM "Product") AS products,
  (SELECT count(*) FROM "User") AS users;'

echo "=== remaining rows ==="
psql_exec 'SELECT id, slug, name, "deployable" FROM "Product" ORDER BY id;'
psql_exec 'SELECT id, email, role FROM "User" ORDER BY id;'
