-- JobOpportunity.filledAt: when a job became FILLED. A club may delete a job once
-- every application was answered, or once it has been FILLED for 14 days
-- (enforced in JobsService.delete). Additive and nullable, so it is safe to deploy
-- before the code that reads it.
ALTER TABLE "JobOpportunity" ADD COLUMN "filledAt" TIMESTAMP(3);

-- Jobs already FILLED start their cooldown from their last change.
UPDATE "JobOpportunity" SET "filledAt" = "updatedAt" WHERE "status" = 'FILLED';
