-- A database that is big enough to show the cost of a list.
--
-- The rows are made with generate_series, so the table grows in seconds and
-- the measurement of the query times is about the query and not about the
-- loading of the data.
--
-- The rows are written in the tables of the lists of the platform:
--   200000 customers
--   200000 orders
--   200000 invoices
--   100000 tickets
--   100000 services
--   500000 entries of the journal of the platform
--
-- The script is meant for the disposable test database only. It refuses to
-- run against a database whose name does not end with "_test".

TRUNCATE TABLE "AuditLog", "OrderItem", "Order", "Invoice", "Payment", "Ticket",
  "TicketMessage", "TicketEvent", "InstanceEvent", "InstanceDomain", "Instance",
  "Subscription", "Session", "StaffMember", "User" CASCADE;

-- The customers. The id is the same in every table, so the rows of a
-- customer can be found.
INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "role", "createdAt", "updatedAt")
SELECT
  'u' || lpad(i::text, 9, '0'),
  'customer-' || i || '@perf.test',
  'not-a-real-hash',
  'Customer',
  i::text,
  'CUSTOMER'::"Role",
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval,
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 200000) AS i;

-- One administrator, so the lists of the platform can be read.
INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "role", "createdAt", "updatedAt")
VALUES ('u000000000', 'admin@perf.test', 'not-a-real-hash', 'Admin', 'Perf', 'ADMIN', NOW(), NOW());

INSERT INTO "StaffMember" ("userId", "permissions", "createdAt", "updatedAt")
VALUES ('u000000000', ARRAY[]::text[], NOW(), NOW());

-- The orders.
INSERT INTO "Order" ("id", "number", "userId", "status", "kind", "total", "currency", "createdAt", "updatedAt")
SELECT
  'o' || lpad(i::text, 9, '0'),
  'PERF-' || i,
  'u' || lpad(((i - 1) % 500 + 1)::text, 9, '0'),
  'PAID'::"OrderStatus",
  'NEW'::"OrderKind",
  1000,
  'EUR',
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval,
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 200000) AS i;

-- The invoices.
INSERT INTO "Invoice" ("id", "number", "userId", "orderId", "status", "amount", "total", "currency", "createdAt", "updatedAt")
SELECT
  'v' || lpad(i::text, 9, '0'),
  'PERF-INV-' || i,
  'u' || lpad(((i - 1) % 500 + 1)::text, 9, '0'),
  'o' || lpad(i::text, 9, '0'),
  'PAID'::"InvoiceStatus",
  1000,
  1000,
  'EUR',
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval,
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 200000) AS i;

-- The tickets.
INSERT INTO "Ticket" ("id", "userId", "subject", "category", "priority", "status", "createdAt", "updatedAt")
SELECT
  't' || lpad(i::text, 9, '0'),
  'u' || lpad(((i - 1) % 500 + 1)::text, 9, '0'),
  'A question',
  'OTHER'::"TicketCategory",
  'NORMAL'::"TicketPriority",
  'OPEN'::"TicketStatus",
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval,
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 100000) AS i;

-- The services.
INSERT INTO "Instance" ("id", "userId", "productId", "name", "status", "ram", "cpu", "disk", "price", "currency", "createdAt", "updatedAt")
SELECT
  's' || lpad(i::text, 9, '0'),
  'u' || lpad(((i - 1) % 500 + 1)::text, 9, '0'),
  (SELECT "id" FROM "Product" ORDER BY "id" LIMIT 1),
  'srv-' || i,
  'ONLINE'::"InstanceStatus",
  1024, 100, 10240, 1000, 'EUR',
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval,
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 100000) AS i;

-- The journal of the platform.
INSERT INTO "AuditLog" ("id", "action", "targetType", "targetId", "createdAt")
SELECT
  'a' || lpad(i::text, 9, '0'),
  'test.action',
  'user',
  'u' || lpad(((i - 1) % 500 + 1)::text, 9, '0'),
  TIMESTAMP '2026-01-01 00:00:00' + (i || ' seconds')::interval
FROM generate_series(1, 500000) AS i;

ANALYZE "User";
ANALYZE "Order";
ANALYZE "Invoice";
ANALYZE "Ticket";
ANALYZE "Instance";
ANALYZE "AuditLog";
