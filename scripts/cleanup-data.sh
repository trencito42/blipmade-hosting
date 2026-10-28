#!/usr/bin/env bash
# Shows what the verification rows would be removed from the platform database.
#
# Nothing is deleted unless --execute is given *and* --confirm repeats the
# number of rows that the plan found. The default run only reads.
#
# The criteria are the artifacts the verification runs created:
#   * users whose address is a verification address,
#   * products whose slug carries the verification prefix,
#   * the instances, orders and subscriptions that belong to those users.
# Real customers never match them. The administrator account, the demo
# catalog and the append-only audit log are never touched.
#
# Usage:
#   scripts/cleanup-data.sh                                   # plan only
#   scripts/cleanup-data.sh --execute --confirm DELETE-<count>
set -euo pipefail
cd /opt/blipmade

EXECUTE=0
CONFIRM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --execute)
      EXECUTE=1
      shift
      ;;
    --confirm)
      CONFIRM="${2:-}"
      shift
      shift || true
      ;;
    --confirm=*)
      CONFIRM="${1#*=}"
      shift
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: scripts/cleanup-data.sh [--execute --confirm DELETE-<count>]" >&2
      exit 2
      ;;
  esac
done

if [ "$EXECUTE" -eq 1 ] && [ -z "$CONFIRM" ]; then
  echo "refusing to run: --execute needs an explicit confirmation."
  echo "Read the plan first and repeat the row count with --confirm DELETE-<count>."
  echo "Nothing was read and nothing was changed."
  exit 2
fi

psql_exec() {
  docker compose -f compose.yml exec -T postgres \
    psql -X -U blipmade -d blipmade -v ON_ERROR_STOP=1 "$@"
}

# One row per matching artifact: table|id|detail
VERIFY_USERS="email LIKE 'verify-%@blipmade.test'"
VERIFY_PRODUCTS="slug LIKE 'nginx-verify-%'"

plan_rows() {
  psql_exec -A -t -F '|' <<SQL
SELECT 'user', id, email FROM "User" WHERE $VERIFY_USERS
UNION ALL
SELECT 'product', id, slug FROM "Product" WHERE $VERIFY_PRODUCTS
UNION ALL
SELECT 'instance', id, name FROM "Instance"
  WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)
     OR "productId" IN (SELECT id FROM "Product" WHERE $VERIFY_PRODUCTS)
UNION ALL
SELECT 'order', id, number FROM "Order"
  WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)
UNION ALL
SELECT 'subscription', id, status::text FROM "Subscription"
  WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)
ORDER BY 1, 2;
SQL
}

count_rows() {
  psql_exec -A -t <<SQL
SELECT
  (SELECT count(*) FROM "User" WHERE $VERIFY_USERS) +
  (SELECT count(*) FROM "Product" WHERE $VERIFY_PRODUCTS) +
  (SELECT count(*) FROM "Instance"
     WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)
        OR "productId" IN (SELECT id FROM "Product" WHERE $VERIFY_PRODUCTS)) +
  (SELECT count(*) FROM "Order"
     WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)) +
  (SELECT count(*) FROM "Subscription"
     WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS));
SQL
}

echo "=== cleanup-data.sh ==="
if [ "$EXECUTE" -eq 1 ]; then
  echo "mode            : EXECUTE - the rows listed below will be deleted"
else
  echo "mode            : DRY RUN - nothing is deleted"
fi
echo "database        : blipmade on the postgres service of /opt/blipmade"
echo "criteria        : verification users, verification products and their rows"
echo "never touched   : the administrator account, the demo catalog, the audit log"

echo
echo "=== before ==="
psql_exec -A -t <<'SQL'
SELECT
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Instance") AS instances,
  (SELECT count(*) FROM "Subscription") AS subscriptions,
  (SELECT count(*) FROM "Product") AS products,
  (SELECT count(*) FROM "User") AS users;
SQL

echo
echo "=== what would change ==="
ROWS="$(plan_rows)"
if [ -z "$ROWS" ]; then
  echo "  (nothing - no verification row is stored)"
else
  echo "$ROWS" | while IFS='|' read -r table id detail; do
    echo "  DELETE $table id=$id ($detail)"
  done
  echo
  echo "  the sessions, tokens, payments and invoices of those users are removed"
  echo "  by the database's own cascade rules"
fi

TOTAL="$(count_rows | tr -d '[:space:]')"
echo
echo "rows affected   : $TOTAL"

if [ "$EXECUTE" -ne 1 ]; then
  echo
  echo "=== result ==="
  echo "nothing was deleted (dry run)"
  echo "To delete, re-run with --execute --confirm DELETE-$TOTAL"
  exit 0
fi

if [ "$CONFIRM" != "DELETE-$TOTAL" ]; then
  echo
  echo "refusing to run: the confirmation does not match the plan."
  echo "expected --confirm DELETE-$TOTAL"
  echo "Nothing was deleted."
  exit 2
fi

echo
echo "=== deleting ==="
# One transaction: a foreign key problem rolls the whole thing back, so the
# database is never left half cleaned.
psql_exec <<SQL
BEGIN;
  DELETE FROM "Subscription" WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS);
  DELETE FROM "Instance" WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS)
                             OR "productId" IN (SELECT id FROM "Product" WHERE $VERIFY_PRODUCTS);
  DELETE FROM "Order" WHERE "userId" IN (SELECT id FROM "User" WHERE $VERIFY_USERS);
  DELETE FROM "Product" WHERE $VERIFY_PRODUCTS;
  DELETE FROM "User" WHERE $VERIFY_USERS;
COMMIT;
SQL

echo
echo "=== after ==="
psql_exec -A -t <<'SQL'
SELECT
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Instance") AS instances,
  (SELECT count(*) FROM "Subscription") AS subscriptions,
  (SELECT count(*) FROM "Product") AS products,
  (SELECT count(*) FROM "User") AS users;
SQL

echo
echo "=== remaining rows ==="
psql_exec -A -t <<'SQL'
SELECT 'product', id, slug, name FROM "Product" ORDER BY id;
SQL
psql_exec -A -t <<'SQL'
SELECT 'user', id, email, role FROM "User" ORDER BY id;
SQL

echo
echo "=== result ==="
echo "deleted $TOTAL verification rows"
