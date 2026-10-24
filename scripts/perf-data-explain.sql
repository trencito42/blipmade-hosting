-- The cost of the lists of the platform, with the plan of the database.
--
-- The script runs EXPLAIN (ANALYZE, BUFFERS) on the queries of the lists, so
-- the plan and the time of every one of them is written down. It is run once
-- before the indexes are added and once after, and the two are compared.
--
-- The cursor of the second page of every list is the real row that closes
-- the first page, so the second page is measured with the same shape as the
-- first one.

\timing on

\echo '=== 1. the list of the customers, first page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "email", "firstName", "lastName", "createdAt" FROM "User"
WHERE "role" = 'CUSTOMER' ORDER BY "createdAt" DESC, "id" DESC LIMIT 200;

\echo '=== 2. the list of the customers, second page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "email", "firstName", "lastName", "createdAt" FROM "User"
WHERE "role" = 'CUSTOMER'
  AND (("createdAt" < '2026-01-03 07:30:00'::timestamp) OR ("createdAt" = '2026-01-03 07:30:00'::timestamp AND "id" < 'u000199800'))
ORDER BY "createdAt" DESC, "id" DESC LIMIT 201;

\echo '=== 3. the list of the orders, first page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "number", "status", "total", "createdAt" FROM "Order"
ORDER BY "createdAt" DESC, "id" DESC LIMIT 200;

\echo '=== 4. the list of the orders, second page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "number", "status", "total", "createdAt" FROM "Order"
WHERE (("createdAt" < '2026-01-03 07:30:00'::timestamp) OR ("createdAt" = '2026-01-03 07:30:00'::timestamp AND "id" < 'o000199800'))
ORDER BY "createdAt" DESC, "id" DESC LIMIT 201;

\echo '=== 5. the list of the orders of a customer ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "number", "status", "total", "createdAt" FROM "Order"
WHERE "userId" = 'u000000001' ORDER BY "createdAt" DESC, "id" DESC LIMIT 101;

\echo '=== 6. the list of the invoices of a customer ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "number", "status", "amount", "createdAt" FROM "Invoice"
WHERE "userId" = 'u000000001' ORDER BY "createdAt" DESC, "id" DESC LIMIT 101;

\echo '=== 7. the list of the services, first page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "name", "status", "price", "createdAt" FROM "Instance"
ORDER BY "createdAt" DESC, "id" DESC LIMIT 300;

\echo '=== 8. the list of the services, second page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "name", "status", "price", "createdAt" FROM "Instance"
WHERE (("createdAt" < '2026-01-02 03:41:40'::timestamp) OR ("createdAt" = '2026-01-02 03:41:40'::timestamp AND "id" < 's000099700'))
ORDER BY "createdAt" DESC, "id" DESC LIMIT 301;

\echo '=== 9. the list of the services of a customer ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "name", "status", "price", "createdAt" FROM "Instance"
WHERE "userId" = 'u000000001' ORDER BY "createdAt" DESC, "id" DESC LIMIT 51;

\echo '=== 10. the list of the tickets, first page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "subject", "status", "createdAt", "updatedAt" FROM "Ticket"
ORDER BY "updatedAt" DESC, "id" DESC LIMIT 200;

\echo '=== 11. the list of the tickets, second page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "subject", "status", "createdAt", "updatedAt" FROM "Ticket"
WHERE (("updatedAt" < '2026-01-02 03:43:20'::timestamp) OR ("updatedAt" = '2026-01-02 03:43:20'::timestamp AND "id" < 't000099800'))
ORDER BY "updatedAt" DESC, "id" DESC LIMIT 201;

\echo '=== 12. the list of the tickets of a customer ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "subject", "status", "createdAt", "updatedAt" FROM "Ticket"
WHERE "userId" = 'u000000001' ORDER BY "updatedAt" DESC, "id" DESC LIMIT 101;

\echo '=== 13. the journal of the platform, first page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "action", "targetType", "targetId", "createdAt" FROM "AuditLog"
ORDER BY "createdAt" DESC, "id" DESC LIMIT 300;

\echo '=== 14. the journal of the platform, second page ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT "id", "action", "targetType", "targetId", "createdAt" FROM "AuditLog"
WHERE (("createdAt" < '2026-01-06 18:48:20'::timestamp) OR ("createdAt" = '2026-01-06 18:48:20'::timestamp AND "id" < 'a000499700'))
ORDER BY "createdAt" DESC, "id" DESC LIMIT 301;

\echo '=== 15. the count of the customers of a list ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING)
SELECT COUNT(*) FROM "User" WHERE "role" = 'CUSTOMER';
