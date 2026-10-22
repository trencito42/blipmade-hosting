#!/usr/bin/env bash
# Inventory of the Blipmade data that was created while verifying the platform.
set -euo pipefail
cd /opt/blipmade

psql_query() {
  docker compose -f compose.yml exec -T postgres psql -U blipmade -d blipmade -c "$1"
}

echo "=== products ==="
psql_query 'SELECT id, slug, name, "deployable", "eggId" FROM "Product" ORDER BY id;'
echo "=== orders ==="
psql_query 'SELECT id, number, status, total FROM "Order" ORDER BY id;'
echo "=== users ==="
psql_query 'SELECT id, email, role, "pterodactylUserId" FROM "User" ORDER BY id;'
echo "=== instances ==="
psql_query 'SELECT id, name, status, "pterodactylServerId" FROM "Instance" ORDER BY id;'
echo "=== subscriptions ==="
psql_query 'SELECT id, status, amount, currency FROM "Subscription" ORDER BY id;'
echo "=== invoices ==="
psql_query 'SELECT id, number, status, total FROM "Invoice" ORDER BY id;'
echo "=== tickets ==="
psql_query 'SELECT id, subject, status FROM "Ticket" ORDER BY id;'
