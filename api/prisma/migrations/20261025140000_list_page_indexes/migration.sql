-- The lists of the platform are read in pages and in the order of the moment
-- of the row and of its id.
--
-- The indexes that were there carry the moment alone. A page is stopped by
-- the moment and by the id, so the database had to sort the rows that share
-- the same moment, and the lists of the whole platform had to sort the whole
-- table before they could show the first rows.
--
-- The plan of every one of these queries was read with EXPLAIN (ANALYZE,
-- BUFFERS) on a database with 200000 customers, 200000 orders, 200000
-- invoices, 100000 tickets, 100000 services and 500000 entries of the
-- journal. The plans and the times are in the report of the change.
--
-- The indexes are additive: nothing that existed before depends on them, and
-- they can be dropped again with
--
--   DROP INDEX "User_createdAt_id_idx";
--   DROP INDEX "Order_createdAt_id_idx";
--   DROP INDEX "Invoice_createdAt_id_idx";
--   DROP INDEX "Instance_createdAt_id_idx";
--   DROP INDEX "Ticket_updatedAt_id_idx";
--   DROP INDEX "AuditLog_createdAt_id_idx";

-- The list of the customers of the platform.
CREATE INDEX IF NOT EXISTS "User_createdAt_id_idx" ON "User"("createdAt", "id");

-- The list of the orders of the platform.
CREATE INDEX IF NOT EXISTS "Order_createdAt_id_idx" ON "Order"("createdAt", "id");

-- The list of the invoices of the platform.
CREATE INDEX IF NOT EXISTS "Invoice_createdAt_id_idx" ON "Invoice"("createdAt", "id");

-- The list of the services of the platform.
CREATE INDEX IF NOT EXISTS "Instance_createdAt_id_idx" ON "Instance"("createdAt", "id");

-- The list of the tickets of the platform, which is ordered by the moment of
-- the last reply.
CREATE INDEX IF NOT EXISTS "Ticket_updatedAt_id_idx" ON "Ticket"("updatedAt", "id");

-- The journal of the platform.
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");
