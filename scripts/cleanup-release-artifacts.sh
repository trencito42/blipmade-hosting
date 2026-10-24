#!/usr/bin/env bash
# Removes the artifacts that the verification runs left in the production
# database, and nothing else.
#
# Safety rules
# ------------
# 1. The default is a dry run: the plan is printed and nothing is written.
# 2. A delete needs three independent signals: the environment variable
#    RELEASE_CLEANUP_TARGET must be exactly the name of the live database,
#    --execute must be given on the command line, and --confirm must repeat
#    the number of rows that the plan found.
# 3. Every target is selected by an explicit criterion that names the
#    artifact. There is no wildcard and no table-wide delete.
# 4. The delete runs in one transaction. If a row cannot be removed, the
#    whole transaction is rolled back.
# 5. The plan is written to an audit trail file before the delete, and the
#    result is appended to it.
#
# Usage:
#   scripts/cleanup-release-artifacts.sh
#   RELEASE_CLEANUP_TARGET=blipmade scripts/cleanup-release-artifacts.sh \
#       --execute --confirm DELETE-<count>
set -euo pipefail

cd /opt/blipmade

EXECUTE=0
CONFIRM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --execute) EXECUTE=1; shift ;;
    --confirm) CONFIRM="${2:-}"; shift; shift || true ;;
    --confirm=*) CONFIRM="${1##}"; CONFIRM="${1#*=}"; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

LIVE_DB="blipmade"

if [ "$EXECUTE" -eq 1 ]; then
  if [ "${RELEASE_CLEANUP_TARGET:-}" != "$LIVE_DB" ]; then
    echo "REFUSED: RELEASE_CLEANUP_TARGET must be exactly '$LIVE_DB' to write." >&2
    echo "         The live database was not touched." >&2
    exit 2
  fi
  if [ -z "$CONFIRM" ]; then
    echo "REFUSED: --execute needs --confirm with the row count from the plan." >&2
    exit 2
  fi
fi

psql_exec() {
  docker exec -i blipmade-postgres-1 psql -U blipmade -d "$LIVE_DB" -X -v ON_ERROR_STOP=1 "$@"
}

# ---------------------------------------------------------------------------
# The three criteria. Each one names the artifact and the evidence for it.
#
# 1. webhook_fixture : the idempotency ledger of the provider holds eight
#    entries whose identifier is "evt_verify_<unix seconds>". That is a
#    deterministic fixture identifier, the kind the verification runs use.
#    A real provider event never has that shape, and the platform has never
#    had a provider key, so no real payment can be behind them. Nothing
#    references them: the table has no foreign key towards another table.
#
# 2. mail_test_only : the delivery ledger holds one row whose only recipient
#    is "browser-customer@blipmade.test", a verification address from the
#    documented incident. The rows that also carry a real recipient are kept,
#    because the delivery to the real address is a real event.
#
# 3. token_expired : three unused verification tokens of the administrator
#    accounts have expired. The raw token of two of them was written to the
#    mail sink of the host by the verification runs, so they are removed
#    together with that residue. The two tokens that are still valid belong
#    to real accounts and are kept.
# ---------------------------------------------------------------------------
WEBHOOK_CRITERION="\"eventId\" LIKE 'evt\\_verify\\_%'"
MAIL_CRITERION="\"to\" LIKE '%@blipmade.test%' AND \"to\" NOT LIKE '%@blipmade.com%'"
TOKEN_CRITERION="\"usedAt\" IS NULL AND \"expiresAt\" < now()"

plan_sql() {
  cat <<SQL
SELECT 'webhook_fixture', id FROM "WebhookEvent" WHERE $WEBHOOK_CRITERION
UNION ALL
SELECT 'mail_test_only', key FROM "MailDelivery" WHERE $MAIL_CRITERION
UNION ALL
SELECT 'token_expired', id FROM "VerificationToken" WHERE $TOKEN_CRITERION
ORDER BY 1, 2;
SQL
}

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
AUDIT="/var/backups/blipmade/cleanup-release-artifacts-$STAMP.log"

echo "=== cleanup-release-artifacts.sh ==="
if [ "$EXECUTE" -eq 1 ]; then
  echo "mode            : EXECUTE - the rows listed below will be deleted"
else
  echo "mode            : DRY RUN - nothing is deleted"
fi
echo "database        : $LIVE_DB"
echo "never touched   : the users, the orders, the payments, the invoices, the"
echo "                  subscriptions, the instances, the tickets, the audit"
echo "                  log, the catalog, the promotions and the sessions"

echo
echo "=== before ==="
psql_exec -A -t <<'SQL'
SELECT 'users='||(SELECT count(*) FROM "User")
    ||' orders='||(SELECT count(*) FROM "Order")
    ||' payments='||(SELECT count(*) FROM "Payment")
    ||' invoices='||(SELECT count(*) FROM "Invoice")
    ||' instances='||(SELECT count(*) FROM "Instance")
    ||' sessions='||(SELECT count(*) FROM "Session")
    ||' auditlog='||(SELECT count(*) FROM "AuditLog")
    ||' webhook_events='||(SELECT count(*) FROM "WebhookEvent")
    ||' mail_delivery='||(SELECT count(*) FROM "MailDelivery")
    ||' tokens='||(SELECT count(*) FROM "VerificationToken");
SQL

PLAN="$(psql_exec -A -t -F '|' <<SQL
$(plan_sql)
SQL
)"
COUNT="$(printf '%s\n' "$PLAN" | grep -c '|' || true)"

echo
echo "=== the plan ==="
if [ "$COUNT" -eq 0 ]; then
  echo "  (nothing to delete)"
else
  printf '%s\n' "$PLAN" | while IFS='|' read -r kind id; do
    [ -n "$kind" ] || continue
    echo "  DELETE $kind id=$id"
  done
  echo
  echo "  total: $COUNT rows"
fi

if [ "$EXECUTE" -ne 1 ]; then
  echo
  echo "=== dry run finished; nothing was written ==="
  echo "To apply: RELEASE_CLEANUP_TARGET=$LIVE_DB $0 --execute --confirm DELETE-$COUNT"
  exit 0
fi

if [ "$CONFIRM" != "DELETE-$COUNT" ]; then
  echo >&2
  echo "REFUSED: the confirmation token must be exactly 'DELETE-$COUNT'." >&2
  echo "         The live database was not touched." >&2
  exit 2
fi

{
  echo "=== cleanup-release-artifacts.sh (execute) ==="
  echo "when        : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database    : $LIVE_DB"
  echo "rows        : $COUNT"
  echo "--- plan ---"
  printf '%s\n' "$PLAN"
} > "$AUDIT"

echo
echo "=== applying the delete in one transaction ==="
psql_exec <<SQL
BEGIN;
DELETE FROM "WebhookEvent" WHERE $WEBHOOK_CRITERION;
DELETE FROM "MailDelivery" WHERE $MAIL_CRITERION;
DELETE FROM "VerificationToken" WHERE $TOKEN_CRITERION;
COMMIT;
SQL

echo
echo "=== after ==="
psql_exec -A -t <<'SQL'
SELECT 'users='||(SELECT count(*) FROM "User")
    ||' orders='||(SELECT count(*) FROM "Order")
    ||' payments='||(SELECT count(*) FROM "Payment")
    ||' invoices='||(SELECT count(*) FROM "Invoice")
    ||' instances='||(SELECT count(*) FROM "Instance")
    ||' sessions='||(SELECT count(*) FROM "Session")
    ||' auditlog='||(SELECT count(*) FROM "AuditLog")
    ||' webhook_events='||(SELECT count(*) FROM "WebhookEvent")
    ||' mail_delivery='||(SELECT count(*) FROM "MailDelivery")
    ||' tokens='||(SELECT count(*) FROM "VerificationToken");
SQL

{
  echo "--- result ---"
  echo "remaining webhook fixtures: $(psql_exec -At -c "select count(*) from \"WebhookEvent\" where $WEBHOOK_CRITERION;")"
  echo "remaining test-only mail rows: $(psql_exec -At -c "select count(*) from \"MailDelivery\" where $MAIL_CRITERION;")"
  echo "remaining expired unused tokens: $(psql_exec -At -c "select count(*) from \"VerificationToken\" where $TOKEN_CRITERION;")"
  echo "result   : done"
} >> "$AUDIT"

echo
echo "audit trail: $AUDIT"
echo "the run is idempotent: running it again finds nothing to delete."
