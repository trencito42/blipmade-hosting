-- The ledger of the slots of the VPS. It is filled from the services that exist, so the next
-- slot can never be one that a machine already uses, even when the row of a service is deleted.
CREATE TABLE "VpsSlot" (
    "slot" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IN_USE',
    "serviceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpsSlot_pkey" PRIMARY KEY ("slot")
);

CREATE INDEX "VpsSlot_state_idx" ON "VpsSlot"("state");

INSERT INTO "VpsSlot" ("slot", "state", "serviceId", "updatedAt")
SELECT "slot", 'IN_USE', "id", CURRENT_TIMESTAMP FROM "VpsService";
