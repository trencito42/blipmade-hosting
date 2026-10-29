-- The state of the container of an instance, as the node reports it.
--
-- The platform marks an instance as online when the provisioning finished, and
-- that is what the customer zone used to show for ever: the state of the
-- container was never asked for, so a service whose container runs was shown
-- as restarting until somebody looked at the node by hand.
--
-- The columns hold what the node said the last time it was asked:
--
--   - "runtimeState" is the state of the node, in the words of the node;
--   - "runtimeCondition" is what the platform concludes from it, and it is
--     the state the customer zone shows;
--   - "runtimeStateCheckedAt" is the moment of that answer;
--   - "runtimeStateStale" says that the node could not be asked for the last
--     time, so the last known state is kept but is not fresh any more;
--   - "runtimeConditionCandidate" and "runtimeConditionCandidateSince" hold
--     the state that was seen last but is not shown yet. A state has to be
--     seen for a while before it replaces the one that is shown, so a
--     container that flaps does not make the customer zone blink.
--
-- The migration is additive: no row is dropped, no row is written, and the
-- instances of the customers keep the state they have. The columns are empty
-- until the worker asks the node for the first time.
ALTER TABLE "Instance" ADD COLUMN "runtimeState" TEXT;
ALTER TABLE "Instance" ADD COLUMN "runtimeCondition" TEXT;
ALTER TABLE "Instance" ADD COLUMN "runtimeStateCheckedAt" TIMESTAMP(3);
ALTER TABLE "Instance" ADD COLUMN "runtimeStateStale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Instance" ADD COLUMN "runtimeConditionCandidate" TEXT;
ALTER TABLE "Instance" ADD COLUMN "runtimeConditionCandidateSince" TIMESTAMP(3);
